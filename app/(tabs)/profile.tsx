import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge, Card, Divider, SectionLabel, SettingRow } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, layout, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { DIMENSIONS, SENSITIVE_BY_DEFAULT, type Dimension } from '@/ai/matching';
import { PROOF_LABEL } from '@/chain/midnight/prover';
import { SELF } from '@/data/people';
import { useHalo } from '@/state/store';

/**
 * Profile, doubling as the privacy dashboard.
 *
 * This screen is the "integrate Midnight" argument made visually. A
 * conventional dating app's settings page lists what you have *shared*. This
 * one lists what has been *proved*, and what the model was structurally unable
 * to read - each dimension row shows whether the circuit could see it at all.
 */

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, connect, disconnect, proofs, mask, toggleDimension, vectorCommit, liveProver } =
    useHalo();

  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(async () => {
    if (!wallet.address) return;
    await Clipboard.setStringAsync(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [wallet.address]);

  const openDimensions = mask.filter(Boolean).length;

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.8} origin={1.1} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.xl,
          paddingBottom: layout.tabBarHeight + insets.bottom + space['4xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Avatar email={SELF.email} size={96} />
          <Text style={[type.title1, styles.name]}>
            {SELF.name}, {SELF.age}
          </Text>
          <View style={styles.heroBadges}>
            <Badge label="Adult, proved" tone="violet" icon="shield-check" />
            <Badge
              label={liveProver ? 'Live prover' : 'Local prover'}
              tone={liveProver ? 'positive' : 'neutral'}
              icon="cube"
            />
          </View>
        </View>

        {/* Wallet */}
        <SectionLabel>Identity</SectionLabel>
        <View style={styles.section}>
          <LiquidGlass radius={radii.card} style={styles.wallet} intensity={44}>
            <View style={styles.walletHead}>
              <Icon
                name="wallet"
                size={20}
                color={wallet.status === 'connected' ? palette.violet : alpha.t38}
              />
              <View style={styles.walletText}>
                <Text style={type.body}>
                  {wallet.status === 'connected' ? wallet.name : 'No wallet connected'}
                </Text>
                <Text style={[type.caption, styles.walletSub]} numberOfLines={1}>
                  {wallet.status === 'connected'
                    ? 'Signs pairing handshakes. Never sees your position.'
                    : 'Connect to publish commitments on Midnight.'}
                </Text>
              </View>
            </View>

            {wallet.address ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy address"
                onPress={copyAddress}
                style={styles.address}
              >
                <Text style={type.digest} numberOfLines={1}>
                  {truncate(wallet.address)}
                </Text>
                <Icon name={copied ? 'check' : 'copy'} size={14} color={alpha.t56} />
              </Pressable>
            ) : null}

            <MetalButton
              label={wallet.status === 'connected' ? 'Disconnect' : 'Connect Midnight wallet'}
              variant={wallet.status === 'connected' ? 'metal' : 'violet'}
              size="md"
              fullWidth
              loading={wallet.status === 'connecting'}
              onPress={() => void (wallet.status === 'connected' ? disconnect() : connect())}
              style={styles.walletAction}
            />

            {wallet.error ? (
              <Text style={[type.caption, styles.walletError]}>{wallet.error}</Text>
            ) : null}
          </LiquidGlass>
        </View>

        {/* What the model may read */}
        <SectionLabel>What the matcher may read</SectionLabel>
        <View style={styles.section}>
          <Card radius={radii.card}>
            <Text style={[type.callout, styles.explainer]}>
              Halo scores you on {DIMENSIONS.length} dimensions, on this device. A dimension you
              close is multiplied by zero inside the circuit — the proof shows it could not have
              influenced a match, rather than promising it did not.
            </Text>
            <Text style={[type.numeric, styles.count]}>
              {openDimensions} of {DIMENSIONS.length} open
            </Text>

            <Divider style={styles.divider} />

            <View style={styles.dimensions}>
              {DIMENSIONS.map((dimension, index) => (
                <DimensionToggle
                  key={dimension}
                  dimension={dimension}
                  open={Boolean(mask[index])}
                  sensitive={SENSITIVE_BY_DEFAULT.includes(dimension)}
                  onToggle={() => toggleDimension(dimension)}
                />
              ))}
            </View>
          </Card>

          {vectorCommit ? (
            <Card radius={radii.lg} style={styles.commit}>
              <Text style={type.eyebrow}>Interest commitment</Text>
              <Text style={[type.digest, styles.commitValue]} numberOfLines={1}>
                {truncate(vectorCommit, 10, 8)}
              </Text>
              <Text style={[type.caption, styles.commitNote]}>
                Published. Binds you to one vector without revealing it.
              </Text>
            </Card>
          ) : null}
        </View>

        {/* Proof history */}
        <SectionLabel>Proofs</SectionLabel>
        <View style={styles.section}>
          {proofs.length === 0 ? (
            <Card radius={radii.lg}>
              <Text style={[type.callout, styles.empty]}>
                No proofs yet. Wink at someone on the radar to run the proximity circuit.
              </Text>
            </Card>
          ) : (
            <View style={styles.proofList}>
              {proofs.slice(0, 6).map((proof) => (
                <View key={proof.id}>
                  <SettingRow
                    icon={proof.kind === 'proximity' ? 'pin' : proof.kind === 'match' ? 'sparkle' : 'fingerprint'}
                    tone="violet"
                    title={`${PROOF_LABEL[proof.kind]} proved`}
                    subtitle={`${proof.provingMs} ms · ${proof.simulated ? 'local prover' : 'proof server'}`}
                    onPress={() => router.push(`/proof/${proof.id}`)}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        <SectionLabel>Safety</SectionLabel>
        <View style={[styles.section, styles.settings]}>
          <SettingRow
            icon="shield"
            title="Privacy & Safety"
            subtitle="Calls, hidden users, blocked users"
            onPress={() => router.push('/privacy')}
          />
          <SettingRow
            icon="link"
            title="Cross-chain receipts"
            subtitle="Mirror match proofs to Solana"
            onPress={() => router.push('/privacy')}
          />
        </View>
      </ScrollView>

      <ScrollScrim />
    </View>
  );
}

/**
 * One dimension row.
 *
 * Sensitive dimensions are marked rather than hidden - a user should be able to
 * see that "politics" exists as a scoring axis and that it is closed, which is
 * more informative than omitting it.
 */
function DimensionToggle({
  dimension,
  open,
  sensitive,
  onToggle,
}: {
  dimension: Dimension;
  open: boolean;
  sensitive: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: open }}
      accessibilityLabel={`${dimension}, ${open ? 'open' : 'closed'}`}
      onPress={onToggle}
      style={[styles.dimension, open ? styles.dimensionOpen : styles.dimensionClosed]}
    >
      <Text style={[type.caption, open ? styles.dimensionLabelOpen : styles.dimensionLabel]}>
        {dimension}
      </Text>
      {sensitive ? (
        <Icon name="lock" size={11} color={open ? palette.void : alpha.t38} style={styles.lock} />
      ) : null}
    </Pressable>
  );
}

function truncate(value: string, head = 12, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },

  hero: { alignItems: 'center', paddingHorizontal: space.xl },
  name: { marginTop: space.lg },
  heroBadges: { flexDirection: 'row', gap: space.sm, marginTop: space.md },

  section: { paddingHorizontal: space.xl, gap: space.md },
  settings: { gap: space.sm },

  wallet: { padding: space.lg },
  walletHead: { flexDirection: 'row', alignItems: 'flex-start' },
  walletText: { flex: 1, marginLeft: space.md },
  walletSub: { marginTop: 3 },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  walletAction: { marginTop: space.lg },
  walletError: { marginTop: space.sm, color: palette.negative },

  explainer: { lineHeight: 20 },
  count: { marginTop: space.md, color: palette.violet },
  divider: { marginVertical: space.lg },

  dimensions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dimension: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dimensionOpen: { backgroundColor: palette.white, borderColor: palette.white },
  dimensionClosed: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: alpha.t10 },
  dimensionLabel: { color: alpha.t38 },
  dimensionLabelOpen: { color: palette.void },
  lock: { marginLeft: 5 },

  commit: { padding: space.lg },
  commitValue: { marginTop: space.sm },
  commitNote: { marginTop: space.sm },

  proofList: { gap: space.sm },
  empty: { color: alpha.t38 },
});
