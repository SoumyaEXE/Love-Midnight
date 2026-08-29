import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge, Card, Chip, IconButton, SettingRow } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { explain, match } from '@/ai/matching';
import { BAND_LABEL, DISTANCE_LABEL } from '@/chain/midnight/types';
import { maskFor, PEOPLE_BY_ID, SELF_VECTOR, VECTORS } from '@/data/people';
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
  const { mask, proveMatch } = useHalo();

  const [proving, setProving] = useState(false);
  const person = id ? PEOPLE_BY_ID.get(id) : null;

  const result = useMemo(() => {
    if (!person) return null;
    const peerVector = VECTORS.get(person.id);
    if (!peerVector) return null;
    return match(SELF_VECTOR, peerVector, mask, maskFor(person));
  }, [person, mask]);

  const onProve = useCallback(async () => {
    if (!person) return;
    setProving(true);
    try {
      const proof = await proveMatch(person.id, 1);
      router.push(`/proof/${proof.id}`);
    } catch (error) {
      console.warn('[halo] match proof failed', error);
    } finally {
      setProving(false);
    }
  }, [person, proveMatch, router]);

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
              {DISTANCE_LABEL[person.bucket]} · area withheld
            </Text>
          </LiquidGlass>
        </View>

        {/* Compatibility */}
        <View style={styles.section}>
          <Card radius={radii.card}>
            <View style={styles.matchHead}>
              <Icon name="sparkle" size={19} color={palette.violet} />
              <Text style={[type.title3, styles.matchTitle]}>{BAND_LABEL[result.band]}</Text>
              <Badge label={`Band ${result.band}/4`} tone="violet" />
            </View>

            <Text style={[type.callout, styles.matchExplain]}>{explain(result)}</Text>

            <View style={styles.drivers}>
              {result.drivers.map((driver) => (
                <View key={driver.dimension} style={styles.driver}>
                  <Text style={[type.captionStrong, styles.driverLabel]}>{driver.dimension}</Text>
                  <View style={styles.driverTrack}>
                    <View
                      style={[
                        styles.driverFill,
                        {
                          width: `${Math.min(
                            100,
                            (driver.contribution / (result.drivers[0]?.contribution || 1)) * 100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>

            {result.withheld.length > 0 ? (
              <View style={styles.withheld}>
                <Icon name="lock" size={13} color={alpha.t38} />
                <Text style={[type.caption, styles.withheldLabel]}>
                  {result.withheld.length} dimension{result.withheld.length === 1 ? '' : 's'} closed
                  by one of you — scored as zero inside the circuit.
                </Text>
              </View>
            ) : null}

            <MetalButton
              label="Prove this match"
              variant="violet"
              size="md"
              fullWidth
              loading={proving}
              onPress={() => void onProve()}
              style={styles.proveAction}
            />
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
          <SettingRow icon="eye-off" title="Hide user" subtitle="They stop appearing on your radar" />
          <SettingRow icon="block" title="Block user" subtitle="No proofs will be exchanged" />
          <SettingRow
            icon="flag"
            title="Report user"
            subtitle="Anonymous — bound to their personhood handle"
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
    </View>
  );
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

  matchHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  matchTitle: { flex: 1 },
  matchExplain: { marginTop: space.md, lineHeight: 20 },

  drivers: { marginTop: space.lg, gap: space.md },
  driver: { gap: 6 },
  driverLabel: { color: alpha.t72 },
  driverTrack: {
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

  withheld: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.lg },
  withheldLabel: { flex: 1, marginLeft: space.sm, lineHeight: 18 },

  proveAction: { marginTop: space.xl },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: {},

  safety: { gap: space.sm },

  footer: { paddingHorizontal: space.xl, marginTop: space['2xl'] },
});
