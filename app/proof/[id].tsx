import React, { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge, Card, Divider, IconButton } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { PROOF_LABEL } from '@/chain/midnight/prover';
import { BAND_LABEL, DISTANCE_LABEL, type Proof } from '@/chain/midnight/types';
import { explorerUrl, serialiseAttestation, encodeAttestation } from '@/chain/bridge';
import { useHalo } from '@/state/store';

/**
 * Proof detail.
 *
 * The screen is organised as a ledger of what crossed the boundary, in two
 * columns: disclosed and withheld. That framing is the pitch. Any judge can
 * read the right-hand column and see that the app is not holding the thing it
 * would need to hold to do this the ordinary way.
 *
 * The Solana panel is the cross-chain half - it shows the exact memo bytes that
 * would be published, so nobody has to take the claim on faith.
 */

export default function ProofScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { proofs } = useHalo();

  const proof = useMemo(() => proofs.find((p) => p.id === id), [proofs, id]);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  }, []);

  if (!proof) {
    return (
      <View style={styles.root}>
        <GlowBackdrop intensity={0.6} />
        <View style={[styles.missing, { paddingTop: insets.top + space['4xl'] }]}>
          <Text style={type.title3}>Proof not found</Text>
          <Text style={[type.callout, styles.missingNote]}>
            Proofs are held in memory for this session only. Nothing is written to disk.
          </Text>
          <MetalButton label="Back" variant="metal" onPress={() => router.back()} style={styles.missingAction} />
        </View>
      </View>
    );
  }

  const memo = serialiseAttestation(encodeAttestation(proof));

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.85} origin={1.08} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + space['4xl'],
          paddingHorizontal: space.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={type.eyebrow}>{PROOF_LABEL[proof.kind]} circuit</Text>
            <Text style={[type.title2, styles.title]}>Proof settled</Text>
          </View>
          <IconButton name="close" accessibilityLabel="Close" onPress={() => router.back()} />
        </View>

        <View style={styles.badges}>
          <Badge
            label={proof.simulated ? 'Local prover' : 'Proof server'}
            tone={proof.simulated ? 'neutral' : 'positive'}
            icon={proof.simulated ? 'cube' : 'bolt'}
          />
          <Badge label={`${proof.provingMs} ms`} tone="violet" icon="clock" />
        </View>

        {proof.simulated ? (
          <Card radius={radii.lg} style={styles.notice}>
            <Text style={[type.caption, styles.noticeText]}>
              Produced by the on-device simulator. It enforces every assertion the Compact circuit
              enforces — openings, range, threshold — so this claim is true. It is not
              cryptographically verifiable. Point{' '}
              <Text style={type.captionStrong}>midnightProofServer</Text> at a running proof server
              to produce a real proof.
            </Text>
          </Card>
        ) : null}

        {/* The ledger. */}
        <Text style={[type.eyebrow, styles.sectionLabel]}>Crossed the boundary</Text>
        <LiquidGlass radius={radii.card} style={styles.panel} intensity={46}>
          <Row
            icon="check"
            tone={palette.positive}
            label="Disclosed"
            value={disclosureOf(proof)}
          />
          <Divider style={styles.rowDivider} />
          <Row
            icon="fingerprint"
            tone={palette.violet}
            label="Nullifier"
            value={truncate(proof.nullifier, 14, 8)}
            onPress={() => void copy('nullifier', proof.nullifier)}
            copied={copied === 'nullifier'}
          />
          <Divider style={styles.rowDivider} />
          <Row
            icon="cube"
            tone={alpha.t56}
            label="Public inputs"
            value={`${truncate(proof.inputs.commitA, 8, 6)}${
              proof.inputs.commitB ? ` · ${truncate(proof.inputs.commitB, 8, 6)}` : ''
            }`}
          />
        </LiquidGlass>

        <Text style={[type.eyebrow, styles.sectionLabel]}>Stayed on this device</Text>
        <Card radius={radii.card} style={styles.withheld}>
          {withheldFor(proof.kind).map((item) => (
            <View key={item} style={styles.withheldRow}>
              <Icon name="lock" size={15} color={alpha.t38} />
              <Text style={[type.callout, styles.withheldLabel]}>{item}</Text>
            </View>
          ))}
        </Card>

        {/* Cross-chain mirror. */}
        <Text style={[type.eyebrow, styles.sectionLabel]}>Solana mirror</Text>
        <Card radius={radii.card} style={styles.solana}>
          <Text style={[type.callout, styles.solanaNote]}>
            Publishing this memo to Solana gives the pair a portable receipt any program can read.
            It carries the nullifier and the band — nothing that identifies either person.
          </Text>
          <View style={styles.memo}>
            <Text style={type.digest} numberOfLines={2}>
              {memo}
            </Text>
          </View>
          <View style={styles.solanaActions}>
            <MetalButton
              label={copied === 'memo' ? 'Copied' : 'Copy memo'}
              variant="metal"
              size="sm"
              icon={<Icon name="copy" size={14} color={palette.white} />}
              onPress={() => void copy('memo', memo)}
            />
            {proof.solanaSignature ? (
              <MetalButton
                label="View on Explorer"
                variant="violet"
                size="sm"
                icon={<Icon name="external" size={14} color={palette.white} />}
                onPress={() => void Linking.openURL(explorerUrl(proof.solanaSignature!))}
              />
            ) : (
              <Badge label="Not yet mirrored" tone="neutral" icon="link" style={styles.notMirrored} />
            )}
          </View>
        </Card>

        <MetalButton
          label="Done"
          variant="light"
          size="lg"
          fullWidth
          onPress={() => router.back()}
          style={styles.done}
        />
      </ScrollView>

      <ScrollScrim />
    </View>
  );
}

function Row({
  icon,
  tone,
  label,
  value,
  onPress,
  copied,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  tone: string;
  label: string;
  value: string;
  onPress?: () => void;
  copied?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Icon name={copied ? 'check' : icon} size={17} color={tone} />
      <View style={styles.rowText}>
        <Text style={type.caption}>{label}</Text>
        <Text style={[type.body, styles.rowValue]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {onPress ? (
        <IconButton
          name={copied ? 'check' : 'copy'}
          size={30}
          iconSize={14}
          accessibilityLabel={`Copy ${label}`}
          onPress={onPress}
        />
      ) : null}
    </View>
  );
}

function disclosureOf(proof: Proof): string {
  if (proof.disclosed.bucket !== undefined) {
    return `Distance bucket: ${DISTANCE_LABEL[proof.disclosed.bucket]}`;
  }
  if (proof.disclosed.band !== undefined) {
    return BAND_LABEL[proof.disclosed.band];
  }
  return 'Personhood handle';
}

/** The right-hand column. Concrete nouns, not reassurances. */
function withheldFor(kind: Proof['kind']): string[] {
  if (kind === 'proximity') {
    return [
      'Your GPS coordinates',
      'Your 250 m grid cell',
      'The exact distance between you',
      'Your bearing from them',
    ];
  }
  if (kind === 'match') {
    return [
      'Your 16-dimension interest vector',
      'Their interest vector',
      'The exact compatibility score',
      'Every dimension either of you closed',
    ];
  }
  return ['Your date of birth', 'Your exact age', 'The issuing authority', 'Your legal identity'];
}

function truncate(value: string, head = 12, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },

  head: { flexDirection: 'row', alignItems: 'flex-start' },
  headText: { flex: 1 },
  title: { marginTop: 4 },

  badges: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },

  notice: { marginTop: space.lg, padding: space.lg },
  noticeText: { lineHeight: 19 },

  sectionLabel: { marginTop: space['2xl'], marginBottom: space.md },

  panel: { paddingHorizontal: space.lg, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowText: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  rowValue: { marginTop: 3 },
  rowDivider: { marginLeft: 33 },

  withheld: { padding: space.lg, gap: space.md },
  withheldRow: { flexDirection: 'row', alignItems: 'center' },
  withheldLabel: { marginLeft: space.md },

  solana: { padding: space.lg },
  solanaNote: { lineHeight: 19 },
  memo: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  solanaActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  notMirrored: { marginLeft: space.xs },

  done: { marginTop: space['2xl'] },

  missing: { paddingHorizontal: space.xl, alignItems: 'center' },
  missingNote: { marginTop: space.md, textAlign: 'center' },
  missingAction: { marginTop: space.xl },
});
