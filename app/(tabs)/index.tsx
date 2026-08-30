import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { LeafletMap } from '@/components/map/LeafletMap';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge, Chip, PressableCard } from '@/components/ui/primitives';
import { ProfileSheet } from '@/components/sheets/ProfileSheet';
import { NearbyList } from '@/components/nearby/NearbyList';
import { Icon } from '@/components/icons/Icon';
import { alpha, layout, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { PEOPLE, PEOPLE_BY_ID, SELF } from '@/data/people';
import { useHalo } from '@/state/store';
import { useFirebase } from '@/state/firebase';
import { useNearbyUsers } from '@/hooks/useNearbyUsers';
import { formatRadius, snapToGrid } from '@/firebase/geo';
import { BUCKET_REACH_M } from '@/components/map/placement';
import { DISTANCE_LABEL, type DistanceBucket, type MatchBand } from '@/chain/midnight/types';

/**
 * Home.
 *
 * Everything visible here was derived from a proof rather than from a location
 * the app is holding. The map shows proved *areas*; the list below names the
 * people inside them and the bucket each one proved. The distance chips drive
 * both from one piece of state, so the map and the list can never disagree
 * about who is in range.
 */

const BUCKETS: DistanceBucket[] = [0, 1, 2, 3];

/**
 * The bucket a measured distance falls into.
 *
 * A discovered user has a real distance, not a proved bucket, but the chips
 * filter on buckets and the map dims on buckets - so a measurement is expressed
 * in the same vocabulary rather than given a parallel one. The thresholds are
 * `BUCKET_REACH_M`, so "Walkable" means the same number of metres whether it
 * was proved or measured.
 */
function bucketForDistance(metres: number): DistanceBucket {
  if (metres <= BUCKET_REACH_M[0]) return 0;
  if (metres <= BUCKET_REACH_M[1]) return 1;
  if (metres <= BUCKET_REACH_M[2]) return 2;
  return 3;
}

export default function HomeScreen() {
  const router = useRouter();
  // Tab screens are detached when inactive, so the map's pulse would restart on
  // every return. Gating on focus also keeps it off the frame budget.
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { visibility, setVisibility, proveProximity, proveMatch, mask, selfVector, discovery } =
    useHalo();
  const nearbyLive = useNearbyUsers();
  const { here } = useFirebase();

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'wink' | 'match' | null>(null);
  // A pan on the map and a scroll of the page are the same gesture. While a
  // finger is down on the map the page holds still, or the map is undraggable.
  const [mapHeld, setMapHeld] = useState(false);

  const mapWidth = width - space.xl * 2;
  // Slightly taller than wide, the way a plan view wants to be.
  const mapHeight = Math.min(mapWidth * 1.18, 500);

  /**
   * Where the map is centred, and where the roster is drawn around.
   *
   * Snapped to the same 250 m grid the app publishes on. The raw fix would
   * re-render the map on every GPS twitch, and would also be a *finer* position
   * than this app is willing to hold anywhere else - centring on it would put
   * the exact fix into the tile request. Null until the first fix, which leaves
   * `LeafletMap` on its demo origin rather than on an empty viewport.
   */
  const center = useMemo(() => {
    if (!here) return null;
    const cell = snapToGrid(here);
    return { lat: cell.latitude, lng: cell.longitude };
  }, [here?.latitude, here?.longitude]);

  /**
   * What the map draws: only people discovery actually found.
   *
   * The roster personas are deliberately absent. They carry no position, so
   * everything about where they appeared was fabricated - a bearing from a hash
   * of their id, at a radius from their bucket - and on a map centred on the
   * user's real cell that reads as five strangers standing around your street,
   * which is a claim the data does not support. They remain in the lists below,
   * where a bucket is all they ever claim to be.
   *
   * So an empty map means nobody is nearby, which is the honest answer and a
   * legible one. The discovered users carry the position they published,
   * already coarsened to the grid, and are drawn there.
   */
  const subjects = useMemo(
    () =>
      nearbyLive.users.map((u) => ({
        id: u.wallet,
        name: u.profile.name,
        // `profile.avatar` is the gravatar key, which is what `Avatar` and the
        // map marker both take as `email`. Same as `NearbyList` does.
        email: u.profile.avatar,
        bucket: bucketForDistance(u.distance),
        online: u.online,
        area: u.place ?? undefined,
        lat: u.latitude,
        lng: u.longitude,
      })),
    [nearbyLive.users],
  );

  /** The chips filter the list and dim the map from one piece of state. */
  const nearby = useMemo(
    () =>
      PEOPLE.filter((p) => p.id !== 'sophie' && p.bucket <= visibility.maxBucket).sort(
        (a, b) => a.bucket - b.bucket,
      ),
    [visibility.maxBucket],
  );

  const person = selected ? PEOPLE_BY_ID.get(selected) ?? null : null;

  /**
   * A marker tap.
   *
   * Roster ids open the profile sheet, which is built from the roster. A
   * discovered user has no roster entry and no sheet to open, so it goes
   * straight to the conversation - the same destination `NearbyList` uses for
   * the same person, rather than a second way to reach them.
   */
  const onSelectSubject = useCallback(
    (id: string) => {
      if (PEOPLE_BY_ID.has(id)) {
        setSelected(id);
        return;
      }
      router.push(`/chat/${id}`);
    },
    [router],
  );

  const minutesLeft = visibility.until
    ? Math.max(0, Math.round((visibility.until - Date.now()) / 60000))
    : null;

  /**
   * Winking runs the proximity circuit first. The interaction is gated on the
   * proof rather than decorated with it - if the circuit refuses, no wink is
   * sent, which is the whole point.
   */
  const onWink = useCallback(
    async (personId: string) => {
      setBusy('wink');
      try {
        const proof = await proveProximity(personId);
        setSelected(null);
        router.push(`/proof/${proof.id}`);
      } catch (error) {
        console.warn('[halo] proximity proof failed', error);
      } finally {
        setBusy(null);
      }
    },
    [proveProximity, router],
  );

  const onProveMatch = useCallback(
    async (personId: string, band: MatchBand) => {
      setBusy('match');
      try {
        const proof = await proveMatch(personId, band);
        setSelected(null);
        router.push(`/proof/${proof.id}`);
      } catch (error) {
        console.warn('[halo] match proof failed', error);
      } finally {
        setBusy(null);
      }
    },
    [proveMatch, router],
  );

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.95} origin={1.05} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.sm,
            paddingBottom: layout.tabBarHeight + insets.bottom + space['4xl'],
          },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!mapHeld}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={type.title2}>Halo</Text>
            <Text style={[type.callout, styles.tagline]}>Meet nearby. Prove nothing.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Avatar email={SELF.email} size={44} />
          </Pressable>
        </View>

        <View style={styles.visibilityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Visibility settings"
            onPress={() => router.push('/privacy')}
          >
            <LiquidGlass
              radius={radii.pill}
              style={styles.visibility}
              intensity={40}
              specular={0.45}
            >
              <Icon
                name="broadcast"
                size={15}
                color={visibility.live ? palette.violet : alpha.t38}
              />
              <Text style={[type.caption, styles.visibilityLabel]}>
                {visibility.live
                  ? `Visible ${DISTANCE_LABEL[visibility.maxBucket].toLowerCase()}${
                      minutesLeft ? ` for ${minutesLeft} min` : ''
                    }`
                  : 'Not broadcasting'}
              </Text>
              <Icon
                name="chevron-right"
                size={15}
                color={alpha.t38}
                style={styles.visibilityChevron}
              />
            </LiquidGlass>
          </Pressable>
        </View>

        <View style={styles.mapWrap}>
          <LeafletMap
            width={mapWidth}
            height={mapHeight}
            subjects={subjects}
            selectedId={selected}
            maxBucket={visibility.maxBucket}
            center={center}
            // A sheet over the map means the map is not being looked at. Its
            // pulse is still costing frames underneath, and those frames are
            // the ones the sheet needs to spring up smoothly.
            live={visibility.live && isFocused && selected === null}
            onSelect={onSelectSubject}
            onInteractionChange={setMapHeld}
          />
        </View>

        <Text style={[type.eyebrow, styles.distanceLabel]}>Distance</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {BUCKETS.map((bucket) => (
            <Chip
              key={bucket}
              label={DISTANCE_LABEL[bucket]}
              selected={visibility.maxBucket === bucket}
              onPress={() => setVisibility({ maxBucket: bucket })}
              style={styles.chip}
            />
          ))}
        </ScrollView>

        {/* Live discovery. Real people, real positions, measured on this device
            from what they published - as against the roster below, which is
            people who have *proved* a bucket. Both are "nearby"; only one of
            them is a measurement, so they are labelled and listed apart rather
            than blended into a single list that would have to lie about one of
            them. */}
        <View style={styles.listHead}>
          <Text style={type.eyebrow}>Live within {formatRadius(discovery.radius)}</Text>
          <Text style={[type.micro, styles.listCount]}>
            {nearbyLive.active && !nearbyLive.loading ? `${nearbyLive.users.length} people` : '—'}
          </Text>
        </View>

        <NearbyList
          users={nearbyLive.users}
          loading={nearbyLive.loading}
          error={nearbyLive.error}
          active={nearbyLive.active}
          blocker={nearbyLive.blocker}
          onConnectWallet={() => router.push('/onboarding')}
          sharing={visibility.live}
          radiusLabel={formatRadius(discovery.radius)}
          onOpen={(user) => router.push(`/chat/${user.wallet}`)}
          onEnableSharing={() => setVisibility({ live: true })}
        />

        {/* The people behind the areas. */}
        <View style={styles.listHead}>
          <Text style={type.eyebrow}>{DISTANCE_LABEL[visibility.maxBucket]} and closer</Text>
          <Text style={[type.micro, styles.listCount]}>{nearby.length} people</Text>
        </View>

        <View style={styles.list}>
          {nearby.map((entry) => (
            <PressableCard
              key={entry.id}
              radius={radii.lg}
              style={styles.row}
              accessibilityLabel={`Open ${entry.name}'s profile`}
              onPress={() => setSelected(entry.id)}
            >
              <Avatar email={entry.email} size={48} online={entry.online} />
              <View style={styles.rowText}>
                <Text style={type.body} numberOfLines={1}>
                  {entry.name}, {entry.age}
                </Text>
                <Text style={[type.caption, styles.rowTags]} numberOfLines={1}>
                  {entry.tags.slice(0, 3).join(' · ')}
                </Text>
                <Badge
                  label={`Proved ${DISTANCE_LABEL[entry.bucket].toLowerCase()}`}
                  tone="metal"
                  icon="verified"
                  style={styles.rowBadge}
                />
              </View>
              <Icon name="chevron-right" size={18} color={alpha.t28} />
            </PressableCard>
          ))}
        </View>

        {nearby.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.callout, styles.emptyLabel]}>
              Nobody has proved they are this close right now.
            </Text>
            <MetalButton
              label="Widen to area"
              variant="metal"
              size="md"
              onPress={() => setVisibility({ maxBucket: 3 })}
              style={styles.emptyAction}
            />
          </View>
        ) : null}
      </ScrollView>

      <ScrollScrim />

      {/* Profiles rise over the map rather than replacing it, so you keep your
          place while glancing at someone. */}
      <ProfileSheet
        person={person}
        visible={person !== null}
        onClose={() => setSelected(null)}
        mask={mask}
        selfVector={selfVector}
        onWink={(id) => void onWink(id)}
        onProveMatch={(id, band) => void onProveMatch(id, band)}
        winking={busy === 'wink'}
        proving={busy === 'match'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: space.xl },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xl,
    zIndex: 2,
  },
  headerText: { flex: 1 },
  tagline: { marginTop: 3 },

  visibilityRow: { alignItems: 'center', zIndex: 2 },
  visibility: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  visibilityLabel: { marginLeft: 8, color: alpha.t72 },
  visibilityChevron: { marginLeft: 10 },

  mapWrap: {
    alignItems: 'center',
    marginTop: space['2xl'],
    marginBottom: space['2xl'],
    zIndex: 1,
  },

  distanceLabel: { marginBottom: space.md, zIndex: 2 },
  chips: { paddingRight: space.xl, zIndex: 2 },
  chip: { marginRight: space.sm },

  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space['2xl'],
    marginBottom: space.md,
  },
  listCount: { color: alpha.t38 },

  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowText: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  rowTags: { marginTop: 2 },
  rowBadge: { marginTop: 7 },

  empty: { alignItems: 'center', paddingTop: space['2xl'] },
  emptyLabel: { color: alpha.t38, textAlign: 'center' },
  emptyAction: { marginTop: space.lg },
});
