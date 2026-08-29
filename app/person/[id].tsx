import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import {
  BandMeter,
  Card,
  Chip,
  Divider,
  IconButton,
  SettingRow,
  StatRow,
} from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { match, type MatchResult } from '@/ai/matching';
import { BAND_LABEL, DISTANCE_LABEL } from '@/chain/midnight/types';
import { maskFor, PEOPLE_BY_ID, VECTORS } from '@/data/people';
import { useHalo } from '@/state/store';

/**
 * Someone else's profile.
 *
 * The compatibility panel is the AI track in one card: the score is computed
 * here, on this device, from two vectors neither server nor peer ever sees, and
 * the drivers listed are the literal terms that produced it. Tapping through
 * runs the match circuit and proves the arithmetic was honest.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mask, proveMatch, selfVector } = useHalo();

  const [proving, setProving] = useState(false);
  const person = id ? PEOPLE_BY_ID.get(id) : null;

  const result = useMemo(() => {
    if (!person) return null;
    const peerVector = VECTORS.get(person.id);
    if (!peerVector) return null;
    return match(selfVector, peerVector, mask, maskFor(person));
  }, [person, mask, selfVector]);

  /**
   * Proves the band actually achieved, rather than a fixed threshold.
   *
   * Passing a constant `minBand` would make the circuit legitimately refuse
   * for every low-overlap pair, which reads as a broken button rather than as
   * the correct answer. Proving the achieved band means the assertion always
   * holds, and a band of 0 is handled before we get here by not offering the
   * action at all.
   */
  const onProve = useCallback(async () => {
    if (!person || !result || result.band === 0) return;
    setProving(true);
    try {
      const proof = await proveMatch(person.id, result.band);
      router.push(`/proof/${proof.id}`);
    } catch (error) {
      console.warn('[halo] match proof failed', error);
    } finally {
      setProving(false);
    }
  }, [person, result, proveMatch, router]);

  if (!person || !result) {
    return (
      <View style={styles.root}>
        <GlowBackdrop intensity={0.6} />
        <Text style={[type.title3, { marginTop: insets.top + 80, textAlign: 'center' }]}>
          Person not found
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.9} origin={1.06} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + space['4xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.nav}>
          <IconButton name="chevron-left" accessibilityLabel="Back" onPress={() => router.back()} />
          <IconButton name="dots" accessibilityLabel="More" />
        </View>

        <View style={styles.hero}>
          <Avatar email={person.email} size={132} online={person.online} />
          <Text style={[type.title1, styles.name]}>
            {person.name}, {person.age}
          </Text>
          <Text style={[type.bodyLight, styles.bio]}>{person.bio}</Text>

          <LiquidGlass radius={radii.pill} style={styles.area} intensity={40} specular={0.4}>
            <Icon name="pin" size={14} color={alpha.t56} />
            <Text style={[type.caption, styles.areaLabel]}>
              {DISTANCE_LABEL[person.bucket]} · exact position withheld
            </Text>
          </LiquidGlass>
        </View>

        {/* Compatibility */}
        <View style={styles.section}>
          <Card radius={radii.card}>
            <View style={styles.matchHead}>
              <View style={styles.matchHeadText}>
                <Text style={type.eyebrow}>Compatibility</Text>
                <Text style={[type.title3, styles.matchTitle]}>{BAND_LABEL[result.band]}</Text>
              </View>
              <BandMeter value={result.band} />
            </View>

            <StatRow
              style={styles.matchStats}
              items={[
                { value: `${result.band}/4`, label: 'Band', tone: 'violet' },
                { value: String(result.drivers.length), label: 'Signals' },
                { value: String(result.withheld.length), label: 'Closed', tone: 'muted' },
              ]}
            />

            {/* Share of the score, not raw contribution. A bar is only worth
                drawing if the number beside it means something on its own. */}
            {result.drivers.length ? (
              <>
                <Divider style={styles.matchDivider} />
                <View style={styles.drivers}>
                  {result.drivers.slice(0, 4).map((driver) => (
                    <View key={driver.dimension} style={styles.driver}>
                      <Text style={[type.captionStrong, styles.driverLabel]} numberOfLines={1}>
                        {driver.dimension}
                      </Text>
                      <View style={styles.driverTrack}>
                        <View
                          style={[
                            styles.driverFill,
                            { width: `${Math.max(6, share(result, driver.contribution))}%` },
                          ]}
                        />
                      </View>
                      <Text style={[type.digest, styles.driverValue]}>
                        {share(result, driver.contribution)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {result.band === 0 ? (
              <Text style={[type.caption, styles.noProof]}>
                Not enough shared signal. The circuit would refuse.
              </Text>
            ) : (
              <MetalButton
                label={`Prove band ${result.band}`}
                variant="violet"
                size="md"
                fullWidth
                loading={proving}
                onPress={() => void onProve()}
                style={styles.proveAction}
              />
            )}
          </Card>
        </View>

        {/* Interests */}
        <View style={styles.section}>
          <Text style={[type.eyebrow, styles.sectionLabel]}>Interests</Text>
          <View style={styles.tags}>
            {person.tags.map((tag) => (
              <Chip key={tag} label={tag} style={styles.tag} />
            ))}
          </View>
        </View>

        {/* Safety actions */}
        <View style={[styles.section, styles.safety]}>
          <SettingRow icon="eye-off" title="Hide user" subtitle="Stops appearing on your radar" />
          <SettingRow icon="block" title="Block user" subtitle="No proofs either way" />
          <SettingRow
            icon="flag"
            title="Report user"
            subtitle="Anonymous, bound to their handle"
            tone="negative"
          />
        </View>

        <View style={styles.footer}>
          <MetalButton
            label="Send wink"
            variant="light"
            size="lg"
            fullWidth
            onPress={() => router.push(`/chat/${person.id}`)}
          />
        </View>
      </ScrollView>

      <ScrollScrim />
    </View>
  );
}

/**
 * A driver's share of the total score, as a whole percent.
 *
 * Normalising against the strongest driver, which is what the bars used to
 * do, always paints the top bar full - so every profile looked equally
 * matched on its best dimension and the bars carried no information.
 */
function share(result: MatchResult, contribution: number): number {
  const total = result.drivers.reduce((sum, d) => sum + d.contribution, 0);
  if (total <= 0) return 0;
  return Math.round((contribution / total) * 100);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },

  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },

  hero: { alignItems: 'center', paddingHorizontal: space.xl, marginTop: space.lg },
  name: { marginTop: space.lg },
  bio: { marginTop: space.md, textAlign: 'center' },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  areaLabel: { marginLeft: 6, color: alpha.t56 },

  section: { paddingHorizontal: space.xl, marginTop: space['2xl'] },
  sectionLabel: { marginBottom: space.md },

  matchHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  matchHeadText: { flex: 1 },
  matchTitle: { marginTop: 5 },
  matchStats: { marginTop: space.xl },
  matchDivider: { marginVertical: space.lg },

  drivers: { gap: 10 },
  driver: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  driverLabel: { width: 84, color: alpha.t72, textTransform: 'capitalize' },
  driverTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  driverFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: palette.violet,
  },
  driverValue: { width: 34, textAlign: 'right' },

  proveAction: { marginTop: space.xl },
  noProof: { marginTop: space.xl, lineHeight: 18 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: {},

  safety: { gap: space.sm },

  footer: { paddingHorizontal: space.xl, marginTop: space['2xl'] },
});
