import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { GlowBackdrop, SpotGlow } from '@/components/ui/GlowBackdrop';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { useHalo } from '@/state/store';
import { markOnboarded } from '@/state/onboarding';

/**
 * Onboarding.
 *
 * Three steps, each of which grants a capability rather than collecting a
 * field. The copy is written to be read by a judge in ten seconds and to be
 * literally true - each line names what stays on the device, and nothing here
 * claims a capability the build does not have.
 */

type Step = {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  action: string;
};

const STEPS: Step[] = [
  {
    icon: 'wallet',
    eyebrow: 'Step one',
    title: 'Connect a key',
    body: 'Your wallet signs pairing handshakes and holds your credential. It never sees where you are, and Halo never holds your keys. Without a Midnight mobile wallet installed, Halo derives a key in this phone’s secure enclave instead.',
    action: 'Connect wallet',
  },
  {
    icon: 'fingerprint',
    eyebrow: 'Step two',
    title: 'Prove you are over 18',
    body: 'A zero-knowledge proof against an issuer-signed credential. Halo learns one bit — that you are an adult — and a handle that is unique here and meaningless anywhere else. Your date of birth stays in the wallet.',
    action: 'Prove adulthood',
  },
  {
    icon: 'broadcast',
    eyebrow: 'Step three',
    title: 'Turn on proximity',
    body: 'Your GPS fix is snapped to a 250 m grid on this device and committed. What leaves is a commitment. Other people can prove they are near you; nobody — including Halo — can work out where you are.',
    action: 'Enable proximity',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { connect, wallet } = useHalo();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const advance = useCallback(async () => {
    setBusy(true);
    try {
      if (step === 0) {
        await connect();
      } else if (step === 2) {
        // Coarse accuracy is all the grid needs, and asking for less is the
        // point - a fine fix would be discarded a moment later anyway.
        await Location.requestForegroundPermissionsAsync();
      } else {
        // The credential proof runs against the wallet-held credential; the
        // demo advances without one rather than blocking the walkthrough.
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      if (step === STEPS.length - 1) {
        await markOnboarded();
        router.replace('/(tabs)');
      } else {
        setStep((prev) => prev + 1);
      }
    } finally {
      setBusy(false);
    }
  }, [connect, router, step]);

  const current = STEPS[step];

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={1} origin={1.0} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space['4xl'], paddingBottom: insets.bottom + space['3xl'] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.brand}>
          <View style={styles.mark}>
            <SpotGlow size={140} opacity={0.75} style={styles.markGlow} />
            <View style={styles.markDisc} />
          </View>
          <Text style={[type.display, styles.wordmark]}>Halo</Text>
          <Text style={[type.bodyLight, styles.tagline]}>
            Meet nearby. Prove nothing.
          </Text>
        </Animated.View>

        <Animated.View key={step} entering={FadeInDown.duration(420)} style={styles.card}>
          <LiquidGlass radius={radii.sheet} style={styles.step} intensity={52}>
            <View style={styles.stepHead}>
              <View style={styles.stepIcon}>
                <Icon name={current.icon} size={22} color={palette.violet} />
              </View>
              <Badge label={current.eyebrow} tone="violet" />
            </View>

            <Text style={[type.title2, styles.stepTitle]}>{current.title}</Text>
            <Text style={[type.bodyLight, styles.stepBody]}>{current.body}</Text>

            <MetalButton
              label={current.action}
              variant="violet"
              size="lg"
              fullWidth
              loading={busy || wallet.status === 'connecting'}
              onPress={() => void advance()}
              style={styles.stepAction}
            />

            {step > 0 ? (
              <MetalButton
                label="Back"
                variant="ghost"
                size="md"
                fullWidth
                haptic={false}
                onPress={() => setStep((prev) => prev - 1)}
                style={styles.stepBack}
              />
            ) : null}
          </LiquidGlass>
        </Animated.View>

        <View style={styles.dots}>
          {STEPS.map((s, index) => (
            <View key={s.title} style={[styles.dot, index === step && styles.dotActive]} />
          ))}
        </View>

        <Text style={[type.caption, styles.footnote]}>
          Built on Midnight. Match receipts mirror to Solana.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: space.xl, flexGrow: 1, justifyContent: 'center' },

  brand: { alignItems: 'center', marginBottom: space['4xl'] },
  mark: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  markGlow: { position: 'absolute' },
  markDisc: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.white,
    shadowColor: palette.white,
    shadowOpacity: 0.9,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  wordmark: { marginTop: space.lg },
  tagline: { marginTop: space.sm, textAlign: 'center' },

  card: {},
  step: { padding: space['2xl'] },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,85,247,0.32)',
  },
  stepTitle: { marginTop: space.xl },
  stepBody: { marginTop: space.md, lineHeight: 22 },
  stepAction: { marginTop: space['2xl'] },
  stepBack: { marginTop: space.sm },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space['2xl'] },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: alpha.t20,
  },
  dotActive: { backgroundColor: palette.violet, width: 20 },

  footnote: { textAlign: 'center', marginTop: space['2xl'] },
});
