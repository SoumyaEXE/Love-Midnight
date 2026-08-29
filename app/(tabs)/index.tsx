import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { Radar } from '@/components/radar/Radar';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge, Chip, IconButton } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, layout, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { PEOPLE, PEOPLE_BY_ID, SELF } from '@/data/people';
import { useHalo } from '@/state/store';
import { DISTANCE_LABEL, type DistanceBucket } from '@/chain/midnight/types';

/**
 * Radar - the app's home.
 *
 * The screen is arranged around one claim: everything visible here was derived
 * from a proof, not from a location the app is holding. The visibility pill
 * states what is currently being broadcast, the rings show the buckets those
 * broadcasts can land in, and the detail card names the circuit that placed the
 * person on the screen.
 */

const BUCKETS: DistanceBucket[] = [0, 1, 2, 3];

export default function RadarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { visibility, setVisibility, liveProver, proveProximity } = useHalo();

  const [selected, setSelected] = useState<string | null>(null);
  const [proving, setProving] = useState<string | null>(null);

  const radarSize = Math.min(width - space.xl * 2, 380);

  const subjects = useMemo(
    () =>
      PEOPLE.filter((p) => p.id !== 'sophie').map((p) => ({
        id: p.id,
        email: p.email,
        bucket: p.bucket,
        online: p.online,
      })),
    [],
  );

  const person = selected ? PEOPLE_BY_ID.get(selected) : null;

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
      setProving(personId);
      try {
        const proof = await proveProximity(personId);
        router.push(`/proof/${proof.id}`);
      } catch (error) {
        console.warn('[halo] proximity proof failed', error);
      } finally {
        setProving(null);
      }
    },
    [proveProximity, router],
  );

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.95} origin={1.05} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.sm, paddingBottom: layout.tabBarHeight + insets.bottom + space['4xl'] },
        ]}
        showsVerticalScrollIndicator={false}
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
            <Avatar email={SELF.email} size={42} />
          </Pressable>
        </View>

        {/* Visibility. Phrased as what is being broadcast, not as a toggle
            state, because that is the thing the user is actually deciding. */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.visibilityRow}>
          <LiquidGlass radius={radii.pill} style={styles.visibility} intensity={40} specular={0.45}>
            <Icon name="broadcast" size={15} color={visibility.live ? palette.violet : alpha.t38} />
            <Text style={[type.caption, styles.visibilityLabel]}>
              {visibility.live
                ? `Visible ${DISTANCE_LABEL[visibility.maxBucket].toLowerCase()}${
                    minutesLeft ? ` for ${minutesLeft} min` : ''
                  }`
                : 'Not broadcasting'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit visibility"
              hitSlop={8}
              onPress={() => setVisibility({ live: !visibility.live })}
            >
              <Text style={[type.captionStrong, styles.edit]}>
                {visibility.live ? 'Stop' : 'Start'}
              </Text>
            </Pressable>
          </LiquidGlass>
        </Animated.View>

        <View style={styles.radarWrap}>
          <Radar
            size={radarSize}
            subjects={subjects}
            selectedId={selected}
            maxBucket={visibility.maxBucket}
            live={visibility.live}
            onSelect={(id) => setSelected((prev) => (prev === id ? null : id))}
          />
        </View>

        <View style={styles.proverRow}>
          <Badge
            label={liveProver ? 'Proof server live' : 'Local prover'}
            tone={liveProver ? 'positive' : 'neutral'}
            icon={liveProver ? 'bolt' : 'cube'}
          />
          <Badge label="Midnight testnet" tone="violet" icon="shield-check" style={styles.badgeGap} />
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
      </ScrollView>

      {/* Detail card. Slides over the radar rather than navigating, so the
          user keeps sight of where the person sits while deciding. */}
      {person ? (
        <Animated.View
          entering={FadeInDown.springify().damping(20)}
          exiting={FadeOutDown.duration(180)}
          style={[styles.detailWrap, { bottom: layout.tabBarHeight + insets.bottom + space.xl }]}
        >
          <LiquidGlass radius={radii.card} style={styles.detail} intensity={55}>
            <View style={styles.detailHead}>
              <Avatar email={person.email} size={46} online={person.online} />
              <View style={styles.detailText}>
                <Text style={type.body}>
                  {person.name}, {person.age}
                </Text>
                <Text style={[type.caption, styles.detailMeta]} numberOfLines={1}>
                  {person.tags.slice(0, 2).join(' · ')}
                </Text>
                <View style={styles.detailArea}>
                  <Icon name="shield-check" size={13} color={palette.violet} />
                  <Text style={[type.caption, styles.detailAreaLabel]}>
                    Proved {DISTANCE_LABEL[person.bucket].toLowerCase()} · position withheld
                  </Text>
                </View>
              </View>
              <IconButton
                name="close"
                size={30}
                iconSize={15}
                accessibilityLabel="Dismiss"
                onPress={() => setSelected(null)}
              />
            </View>

            <View style={styles.detailActions}>
              <MetalButton
                label="Send wink"
                variant="violet"
                size="md"
                loading={proving === person.id}
                onPress={() => void onWink(person.id)}
                style={styles.detailAction}
              />
              <MetalButton
                label="Quick info"
                variant="metal"
                size="md"
                onPress={() => router.push(`/person/${person.id}`)}
                style={styles.detailAction}
              />
            </View>
          </LiquidGlass>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: space.xl },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  headerText: { flex: 1 },
  tagline: { marginTop: 3 },

  visibilityRow: { alignItems: 'center' },
  visibility: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  visibilityLabel: { marginLeft: 8, color: alpha.t72 },
  edit: { marginLeft: 12, color: palette.violet },

  radarWrap: {
    alignItems: 'center',
    marginTop: space['2xl'],
    marginBottom: space.xl,
  },

  proverRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  badgeGap: { marginLeft: space.sm },

  distanceLabel: { marginTop: space.xl, marginBottom: space.md },
  chips: { paddingRight: space.xl },
  chip: { marginRight: space.sm },

  detailWrap: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
  },
  detail: { padding: space.lg },
  detailHead: { flexDirection: 'row', alignItems: 'center' },
  detailText: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  detailMeta: { marginTop: 2 },
  detailArea: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  detailAreaLabel: { marginLeft: 5, color: alpha.t56 },

  detailActions: { flexDirection: 'row', marginTop: space.lg, gap: space.sm },
  detailAction: { flex: 1 },
});
