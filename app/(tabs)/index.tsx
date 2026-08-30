import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
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
import { isComplete } from '@/state/profile';
import { useNearbyUsers } from '@/hooks/useNearbyUsers';
import { useRequests, useSentRequestStatus } from '@/hooks/useRequests';
import { formatDistance, formatRadius, snapToGrid } from '@/firebase/geo';
import type { FixOutcome } from '@/services/locationService';
import type { NearbyUser } from '@/firebase/types';
import type { Person } from '@/data/people';
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

type LocateProblem = Extract<FixOutcome, { ok: false }>['reason'];

/**
 * What to say when the pin comes back empty.
 *
 * Each line names the thing the user can actually change. The old copy said
 * "allow location for this site" for every failure, which is advice for exactly
 * one of these three and misleading for the other two - a desktop with its OS
 * location service switched off will not be helped by a browser permission it
 * has already granted.
 */
const LOCATE_PROBLEM: Record<LocateProblem, string> = {
  denied:
    'Location is blocked for this site. Allow it from the icon in your browser’s address bar, then tap the pin again.',
  unavailable:
    'This device could not produce a position. On a desktop that usually means the operating system’s location service is switched off.',
  timeout:
    'Nothing came back in time, so the map is still on its default area. Tap the pin to try again.',
};

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
  const {
    visibility,
    setVisibility,
    proveProximity,
    proveMatch,
    mask,
    selfVector,
    discovery,
    wallet,
    connect,
    profile,
    verified,
  } = useHalo();
  const nearbyLive = useNearbyUsers();
  const { here, locate } = useFirebase();

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

  /**
   * The proved-bucket list, now empty.
   *
   * This was the roster: nine fixtures with hand-written buckets, presented
   * beside real discovery as though both were people you could meet. Nothing
   * writes a proved bucket to the database yet, so the honest list is empty and
   * the screen's existing empty state says exactly that. The chips still filter
   * it, so wiring a real source here changes nothing else.
   */
  const nearby = useMemo<typeof PEOPLE>(() => [], []);

  const person = selected ? PEOPLE_BY_ID.get(selected) ?? null : null;

  /**
   * The discovered account whose card is open.
   *
   * Held apart from `selected`, which is a roster id. They are different kinds
   * of thing - one is a fixture with a known interest vector, the other is a
   * wallet with a published card - and the sheet offers different actions for
   * each, so collapsing them into one string would mean guessing which it was
   * on every read.
   */
  const [openUser, setOpenUser] = useState<NearbyUser | null>(null);
  const requests = useRequests();
  const sentStatus = useSentRequestStatus(openUser?.wallet ?? null);
  const [requesting, setRequesting] = useState(false);

  /**
   * A discovered account, in the shape the sheet already renders.
   *
   * `age` is the one field that does not survive: `Person` requires a number
   * and a published profile may withhold it, so 0 stands for "not disclosed"
   * and the sheet's header drops it rather than inventing one.
   */
  const openPerson = useMemo<Person | null>(() => {
    if (!openUser) return null;
    return {
      id: openUser.wallet,
      name: openUser.profile.name,
      age: openUser.profile.age ?? 0,
      email: openUser.profile.avatar,
      bio: openUser.profile.bio ?? '',
      tags: openUser.profile.interests ?? [],
      area: openUser.place ?? formatDistance(openUser.distance),
      bucket: bucketForDistance(openUser.distance),
      online: openUser.online,
      lastSeen: openUser.online ? 'Active now' : '',
    };
  }, [openUser]);

  const remoteStatus = useMemo(() => {
    if (!openUser) return 'none' as const;
    if (requests.isConnected(openUser.wallet)) return 'connected' as const;
    if (sentStatus === 'pending') return 'pending' as const;
    if (sentStatus === 'declined') return 'declined' as const;
    return 'none' as const;
  }, [openUser, requests, sentStatus]);

  const onSendRequest = useCallback(async () => {
    if (!openUser) return;
    setRequesting(true);
    try {
      await requests.send(openUser.wallet);
    } catch (error) {
      console.warn('[halo] request failed', error);
    } finally {
      setRequesting(false);
    }
  }, [openUser, requests]);

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
      // Was a jump straight into the conversation, which skipped the only
      // screen that says who this person is - and offered a compose box the
      // rules would have refused, since no request had been sent yet.
      const found = nearbyLive.users.find((u) => u.wallet === id);
      if (found) setOpenUser(found);
    },
    [nearbyLive.users],
  );

  const [locating, setLocating] = useState(false);
  /** Why the last attempt came back empty, or null. Cleared by the next one. */
  const [locateProblem, setLocateProblem] = useState<LocateProblem | null>(null);

  /**
   * Put the map over the user.
   *
   * This control exists because on the web nothing else asks. `currentFix` at
   * boot only reads a permission that has already been granted, and a browser
   * answers `prompt` rather than `granted` until something calls
   * `getCurrentPosition` - so the passive read returns null forever on a first
   * visit. The only other caller of `locate` is the connect card below, which
   * disappears the moment the wallet is connected and the profile is complete,
   * leaving a finished account with no way to reach a permission dialog at all
   * and a map parked on the demo origin in Manhattan.
   *
   * On a handset the sharing watcher would eventually prompt on its own, so
   * this is redundant there rather than wrong - and a "centre on me" button is
   * what someone reaches for on either platform anyway.
   */
  const onLocate = useCallback(async () => {
    setLocating(true);
    setLocateProblem(null);
    try {
      const outcome = await locate();
      setLocateProblem(outcome.ok ? null : outcome.reason);
    } finally {
      setLocating(false);
    }
  }, [locate]);

  const [connecting, setConnecting] = useState(false);
  const walletConnected = wallet.status === 'connected';

  /**
   * Connect, then ask for a position, then start broadcasting.
   *
   * All three in one gesture because they are one intention - "put me on the
   * map" - and separately they are three dead ends. A wallet with no fix
   * publishes nothing; a fix with sharing off is never written; and on web the
   * permission dialog only appears if something asks inside a user gesture,
   * which is why `locate()` is called here rather than on mount.
   *
   * Ordered, not parallel: `locate` is what makes the map centre correctly, and
   * turning on broadcasting before there is a fix just starts a watcher that
   * waits.
   */
  const onConnectWallet = useCallback(async () => {
    setConnecting(true);
    try {
      if (!walletConnected) await connect();
      await locate();
      if (!visibility.live) setVisibility({ live: true });
    } catch (error) {
      console.warn('[halo] connect failed', error);
    } finally {
      setConnecting(false);
    }
  }, [walletConnected, connect, locate, visibility.live, setVisibility]);

  /**
   * Whether this account can appear in anyone's results.
   *
   * Connecting a wallet is not enough, and that gap is invisible without this:
   * `discoveryService` drops any candidate whose record has no `profile.name`
   * or whose `verification.adult` is not true, so a user who connected and
   * started broadcasting publishes a position that every other client then
   * silently discards. Both halves come from onboarding - `markVerified` and a
   * complete profile - and nothing else writes them.
   */
  const publishable = isComplete(profile) && verified.ok;

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

          {/* Over the map, where every map app puts it. Outside the map
              component on purpose: on web the map is a sandboxed iframe, so a
              control drawn inside the document could not reach `locate` and a
              press on it would never leave the frame. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={center ? 'Recentre the map on you' : 'Show my location'}
            accessibilityState={{ busy: locating }}
            disabled={locating}
            onPress={() => void onLocate()}
            style={[styles.locate, center ? styles.locateOn : null]}
          >
            {locating ? (
              <ActivityIndicator size="small" color={palette.white} />
            ) : (
              <Icon name="pin" size={19} color={center ? palette.violet : alpha.t72} />
            )}
          </Pressable>
        </View>

        {/* Only after an attempt. Saying "the map is not on you" unprompted,
            to someone who never asked it to be, is noise. */}
        {locateProblem ? (
          <Text style={[type.caption, styles.locateNote]}>{LOCATE_PROBLEM[locateProblem]}</Text>
        ) : null}

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

        {!walletConnected || !publishable ? (
          /*
           * Sits where the results would be, because it is the answer to the
           * question the empty list raises. Two different problems, and telling
           * them apart matters: a missing wallet means nothing is published at
           * all, while an incomplete profile means a position *is* being
           * published and quietly discarded by every reader.
           */
          <View style={styles.connectWrap}>
            <LiquidGlass radius={radii.lg} style={styles.connect} intensity={50}>
              <Icon name="broadcast" size={19} color={alpha.t72} />
              <View style={styles.connectText}>
                <Text style={type.calloutStrong}>
                  {walletConnected ? 'Finish your profile' : 'Connect your wallet'}
                </Text>
                <Text style={[type.caption, styles.connectSub]}>
                  {walletConnected
                    ? 'Your position is being published, but nobody can see it: discovery skips anyone without a name and an age check.'
                    : 'Your address is what the database keys your profile, position and messages to.'}
                </Text>
              </View>
              <MetalButton
                label={walletConnected ? 'Finish' : connecting ? 'Connecting…' : 'Connect'}
                variant="metal"
                size="sm"
                onPress={walletConnected ? () => router.push('/onboarding') : onConnectWallet}
                disabled={connecting}
              />
            </LiquidGlass>
          </View>
        ) : (
        <NearbyList
          users={nearbyLive.users}
          loading={nearbyLive.loading}
          error={nearbyLive.error}
          active={nearbyLive.active}
          blocker={nearbyLive.blocker}
          onConnectWallet={onConnectWallet}
          sharing={visibility.live}
          radiusLabel={formatRadius(discovery.radius)}
          onOpen={setOpenUser}
          onEnableSharing={() => setVisibility({ live: true })}
        />
        )}

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
      {/* The discovered-account card. Same sheet, different footer: a wallet
          has no interest vector to prove against, so what it offers is the
          consent flow rather than the circuits. */}
      <ProfileSheet
        person={openPerson}
        visible={openUser !== null}
        onClose={() => setOpenUser(null)}
        mask={mask}
        selfVector={selfVector}
        remote={{
          status: remoteStatus,
          busy: requesting,
          onRequest: onSendRequest,
          onMessage: () => {
            const wallet = openUser?.wallet;
            setOpenUser(null);
            if (wallet) router.push(`/chat/${wallet}`);
          },
        }}
      />

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
  connectWrap: { paddingTop: space.xs },
  connect: { flexDirection: 'row', alignItems: 'center', padding: space.lg },
  connectText: { flex: 1, marginHorizontal: space.md },
  connectSub: { marginTop: 2 },
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
  locate: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    // Opaque rather than glass: it sits on a basemap whose brightness is not
    // ours to predict, and a blurred disc over a pale tile reads as a smudge.
    backgroundColor: 'rgba(12,10,17,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t14,
  },
  locateOn: { borderColor: 'rgba(216,180,254,0.5)' },
  locateNote: {
    marginTop: -space.md,
    marginBottom: space.lg,
    color: alpha.t56,
    lineHeight: 18,
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
