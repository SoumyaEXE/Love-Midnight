import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { Card, SectionLabel, ScreenHeader, SettingRow } from '@/components/ui/primitives';
import {
  ReportDetailsSheet,
  type FiledReport,
} from '@/components/sheets/ReportDetailsSheet';
import { MetalButton } from '@/components/ui/MetalButton';
import { Chip } from '@/components/ui/primitives';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { DISTANCE_LABEL, type DistanceBucket } from '@/chain/midnight/types';
import { useHalo } from '@/state/store';

/**
 * Privacy & Safety.
 *
 * Ordered by how much a setting actually protects you rather than by how a
 * settings screen usually reads. Broadcast controls come first because they
 * govern what leaves the device; blocking and hiding come last because they
 * only govern what you see.
 */

const BUCKETS: DistanceBucket[] = [0, 1, 2, 3];

/**
 * Reports this account has filed.
 *
 * Each one records the reason and the moment, and nothing that identifies the
 * subject - the report is bound to their personhood handle, so moderation can
 * act on it without anyone learning whose account it is.
 */
const FILED_REPORTS: FiledReport[] = [
  {
    id: '#RPT-7X9K-2Q4M',
    personId: 'tom',
    reasonTitle: 'Fake profile',
    reasonDetail: 'This user is pretending to be someone else',
    reasonIcon: 'user-x',
    submitted: 'May 24, 2024 at 2:35 PM',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { visibility, setVisibility, proofs } = useHalo();

  const [mirrorToSolana, setMirrorToSolana] = useState(false);
  const [allowCalls, setAllowCalls] = useState(false);
  const [openReport, setOpenReport] = useState<FiledReport | null>(null);

  const extend = useCallback(
    (minutes: number) => setVisibility({ live: true, until: Date.now() + minutes * 60_000 }),
    [setVisibility],
  );

  const minutesLeft = visibility.until
    ? Math.max(0, Math.round((visibility.until - Date.now()) / 60_000))
    : null;

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.7} origin={1.15} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingBottom: insets.bottom + space['4xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Privacy & Safety" onBack={() => router.back()} />

        <SectionLabel>Broadcast</SectionLabel>
        <View style={styles.section}>
          <Card radius={radii.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={type.body}>Broadcasting</Text>
                <Text style={[type.caption, styles.sub]}>
                  {visibility.live
                    ? minutesLeft
                      ? `Publishing a cell commitment for ${minutesLeft} more minutes.`
                      : 'Publishing a cell commitment.'
                    : 'Nothing is being published. You are invisible.'}
                </Text>
              </View>
              <Switch
                value={visibility.live}
                onValueChange={(live) => setVisibility({ live })}
                trackColor={{ false: 'rgba(255,255,255,0.12)', true: palette.violetDeep }}
                thumbColor={palette.white}
                accessibilityLabel="Broadcasting"
              />
            </View>

            <Text style={[type.eyebrow, styles.inner]}>Widest bucket anyone may prove</Text>
            <View style={styles.chips}>
              {BUCKETS.map((bucket) => (
                <Chip
                  key={bucket}
                  label={DISTANCE_LABEL[bucket]}
                  selected={visibility.maxBucket === bucket}
                  onPress={() => setVisibility({ maxBucket: bucket })}
                />
              ))}
            </View>

            <Text style={[type.eyebrow, styles.inner]}>Auto-stop</Text>
            <View style={styles.chips}>
              {[15, 30, 60].map((minutes) => (
                <Chip
                  key={minutes}
                  label={`${minutes} min`}
                  selected={minutesLeft !== null && Math.abs(minutesLeft - minutes) < 2}
                  onPress={() => extend(minutes)}
                />
              ))}
              <Chip
                label="Until I stop"
                selected={visibility.until === null}
                onPress={() => setVisibility({ live: true, until: null })}
              />
            </View>
          </Card>
        </View>

        <SectionLabel>Cross-chain</SectionLabel>
        <View style={styles.section}>
          <Card radius={radii.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={type.body}>Mirror match receipts to Solana</Text>
                <Text style={[type.caption, styles.sub]}>
                  A memo carrying the nullifier and the band. Nothing identifying.
                </Text>
              </View>
              <Switch
                value={mirrorToSolana}
                onValueChange={setMirrorToSolana}
                trackColor={{ false: 'rgba(255,255,255,0.12)', true: palette.violetDeep }}
                thumbColor={palette.white}
                accessibilityLabel="Mirror to Solana"
              />
            </View>
            <Text style={[type.numeric, styles.stat]}>
              {proofs.filter((p) => p.solanaSignature).length} of {proofs.length} mirrored
            </Text>
          </Card>
        </View>

        <SectionLabel>Contact</SectionLabel>
        <View style={[styles.section, styles.rows]}>
          <SettingRow
            icon="phone"
            title="Call permissions"
            subtitle={allowCalls ? 'After a fresh adulthood proof' : 'Disabled for everyone'}
            right={
              <Switch
                value={allowCalls}
                onValueChange={setAllowCalls}
                trackColor={{ false: 'rgba(255,255,255,0.12)', true: palette.violetDeep }}
                thumbColor={palette.white}
                accessibilityLabel="Call permissions"
              />
            }
          />
          <SettingRow icon="eye-off" title="Hidden users" subtitle="4 profiles hidden" />
          <SettingRow icon="block" title="Blocked users" subtitle="2 users blocked" />
          <SettingRow
            icon="flag"
            title="Reports you have filed"
            subtitle={`${FILED_REPORTS.length} report${FILED_REPORTS.length === 1 ? '' : 's'}, bound to handles`}
            tone="negative"
            onPress={() => setOpenReport(FILED_REPORTS[0] ?? null)}
          />
        </View>

        <SectionLabel>Data</SectionLabel>
        <View style={styles.section}>
          <Card radius={radii.card}>
            <Text style={[type.callout, styles.explainer]}>
              Resetting destroys the seed in this device’s keystore. Every commitment you
              have published becomes permanently unopenable.
            </Text>
            <MetalButton
              label="Reset identity"
              variant="metal"
              size="md"
              fullWidth
              haptic="medium"
              style={styles.reset}
            />
          </Card>
        </View>
      </ScrollView>

      <ScrollScrim />

      <ReportDetailsSheet
        report={openReport}
        visible={openReport !== null}
        onClose={() => setOpenReport(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },

  section: { paddingHorizontal: space.xl },
  rows: { gap: space.sm },

  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchText: { flex: 1, marginRight: space.lg },
  sub: { marginTop: 4, lineHeight: 18 },

  inner: { marginTop: space.xl, marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  stat: { marginTop: space.lg, color: palette.violet },
  explainer: { lineHeight: 20 },
  reset: { marginTop: space.xl },
});
