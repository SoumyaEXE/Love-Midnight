import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { GlowBackdrop, SpotGlow } from '@/components/ui/GlowBackdrop';
import { HaloMark } from '@/components/brand/HaloMark';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { MetalButton } from '@/components/ui/MetalButton';
import {
  AboutSection,
  DisclosureSection,
  InterestsSection,
} from '@/components/profile/ProfileForm';
import { Icon, type IconName } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { useHalo } from '@/state/store';
import { markOnboarded } from '@/state/onboarding';
import { isComplete, problems } from '@/state/profile';

/**
 * Onboarding.
 *
 * Six steps in two halves. The first two grant capabilities - a key and an
 * adulthood proof - and the last one grants a permission. In between sit the
 * three that build the profile: who you are, what you like, and who is allowed
 * to see it.
 *
 * The disclosure step is deliberately placed *before* anything is published
 * rather than filed under settings afterwards. By the time the final step
 * commits the record, the user has already answered "what am I showing?", and
 * the commitment covers that answer - so it is a decision with consequences on
 * the ledger rather than a preference the client is trusted to honour.
 */

type Step = {
  icon: IconName;
  title: string;
  body: string;
  action: string;
  /** Form steps are taller and scroll; capability steps are a paragraph. */
  form?: 'about' | 'interests' | 'disclosure';
};

const STEPS: Step[] = [
  {
    icon: 'wallet',
    title: 'Connect a key',
    body: 'Your wallet signs pairing handshakes and holds your credential. It never sees where you are, and Halo never holds your keys. Without a Midnight mobile wallet installed, Halo derives a key in this phone’s secure enclave instead.',
    action: 'Connect wallet',
  },
  {
    icon: 'fingerprint',
    title: 'Prove you are over 18',
    body: 'A zero-knowledge proof against an issuer-signed credential. Halo learns one bit — that you are an adult — and a handle that is unique here and meaningless anywhere else. Your date of birth stays in the wallet.',
    action: 'Prove adulthood',
  },
  {
    icon: 'person',
    title: 'About you',
    body: 'The ordinary questions. None of these answers are uploaded — they are committed on this device, and the commitment is what goes to Midnight.',
    action: 'Continue',
    form: 'about',
  },
  {
    icon: 'wink',
    title: 'What you are into',
    body: 'These feed the matcher directly. Pick the ones that are actually true; a tag you do not mean pulls your matches towards people you have nothing to say to.',
    action: 'Continue',
    form: 'interests',
  },
  {
    icon: 'eye-off',
    title: 'What you show',
    body: 'Two different questions: what appears on your card, and what the matching circuit is allowed to score. Hidden fields are not filtered out later — they are never opened.',
    action: 'Continue',
    form: 'disclosure',
  },
  {
    icon: 'broadcast',
    title: 'Turn on proximity',
    body: 'Your GPS fix is snapped to a 250 m grid on this device and committed. What leaves is a commitment. Other people can prove they are near you; nobody — including Halo — can work out where you are.',
    action: 'Enable proximity & publish',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { connect, wallet, profile, saveProfile, publishProfile, mask, toggleDimension } =
    useHalo();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  const current = STEPS[step];

  const goTo = useCallback((next: number) => {
    setShowErrors(false);
    setFailed(null);
    setStep(next);
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const advance = useCallback(async () => {
    // Form steps validate before they will let go. Errors appear under the
    // field that caused them, which is why nothing is alerted here.
    if (current.form === 'about') {
      const found = problems(profile);
      if (found.name || found.age) {
        setShowErrors(true);
        return;
      }
    }
    if (current.form === 'interests' && profile.interests.length === 0) {
      setShowErrors(true);
      return;
    }

    setBusy(true);
    setFailed(null);
    try {
      if (step === 0) {
        await connect();
      } else if (step === 1) {
        // The credential proof runs against the wallet-held credential; the
        // demo advances without one rather than blocking the walkthrough.
        await new Promise((resolve) => setTimeout(resolve, 900));
      } else if (step === STEPS.length - 1) {
        // Coarse accuracy is all the grid needs, and asking for less is the
        // point - a fine fix would be discarded a moment later anyway.
        await Location.requestForegroundPermissionsAsync();
        // The commitment, not the profile. If this throws, the user is not
        // pushed into the app with an unpublished record and no idea.
        await publishProfile();
      }

      if (step === STEPS.length - 1) {
        await markOnboarded();
        router.replace('/(tabs)');
      } else {
        goTo(step + 1);
      }
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, [current.form, profile, step, connect, publishProfile, router, goTo]);

  const ready = isComplete(profile);

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={1} origin={1.0} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={[
            styles.content,
            !current.form && styles.contentCentred,
            {
              paddingTop: insets.top + (current.form ? space['2xl'] : space['4xl']),
              paddingBottom: insets.bottom + space['3xl'],
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* The brand only gets the full stage on the paragraph steps. On a
              form, a 140px logo above the fold is 140px of the answer the user
              is trying to give. */}
          <Animated.View entering={FadeIn.duration(600)} style={styles.brand}>
            <View style={current.form ? styles.markSmall : styles.mark}>
              {current.form ? null : (
                <SpotGlow size={150} opacity={0.7} style={styles.markGlow} />
              )}
              <HaloMark size={current.form ? 44 : 92} />
            </View>
            {current.form ? null : (
              <>
                <Text style={[type.display, styles.wordmark]}>Halo</Text>
                <Text style={[type.bodyLight, styles.tagline]}>Meet nearby. Prove nothing.</Text>
              </>
            )}
          </Animated.View>

          <Animated.View key={step} entering={FadeInDown.duration(380)} style={styles.card}>
            <LiquidGlass radius={radii.sheet} style={styles.step} intensity={52}>
              {/* A counter and a rule, not a violet pill reading "Step two".
                  The pill had the visual weight of a status badge for what is
                  only a position in a sequence. */}
              <View style={styles.stepHead}>
                <View style={styles.stepIcon}>
                  <Icon name={current.icon} size={22} color={palette.violet} />
                </View>
                <View style={styles.stepRule} />
                <Text style={[type.digest, styles.stepCount]}>
                  {String(step + 1).padStart(2, '0')}
                  <Text style={styles.stepCountTotal}>
                    {' / ' + String(STEPS.length).padStart(2, '0')}
                  </Text>
                </Text>
              </View>

              <Text style={[type.title2, styles.stepTitle]}>{current.title}</Text>
              <Text style={[type.bodyLight, styles.stepBody]}>{current.body}</Text>

              {current.form ? (
                <View style={styles.form}>
                  {current.form === 'about' ? (
                    <AboutSection
                      profile={profile}
                      onChange={saveProfile}
                      showErrors={showErrors}
                    />
                  ) : current.form === 'interests' ? (
                    <InterestsSection
                      profile={profile}
                      onChange={saveProfile}
                      showErrors={showErrors}
                    />
                  ) : (
                    <DisclosureSection
                      profile={profile}
                      onChange={saveProfile}
                      mask={mask}
                      onToggleDimension={toggleDimension}
                    />
                  )}
                </View>
              ) : null}

              {step === STEPS.length - 1 ? (
                <View style={styles.publish}>
                  <Icon name="cube" size={15} color={palette.violet} />
                  <Text style={[type.caption, styles.publishLabel]}>
                    Finishing commits your profile record to Midnight and mirrors the receipt to
                    Solana. The commitment crosses; the answers do not.
                  </Text>
                </View>
              ) : null}

              {failed ? <Text style={[type.caption, styles.failed]}>{failed}</Text> : null}

              <MetalButton
                label={current.action}
                variant="violet"
                size="lg"
                fullWidth
                disabled={step === STEPS.length - 1 && !ready}
                loading={busy || wallet.status === 'connecting'}
                onPress={() => void advance()}
                style={styles.stepAction}
              />

              {step === STEPS.length - 1 && !ready ? (
                <Text style={[type.caption, styles.blocked]}>
                  Your profile is not complete yet — go back and finish the name, age and
                  interests.
                </Text>
              ) : null}

              {step > 0 ? (
                <MetalButton
                  label="Back"
                  variant="ghost"
                  size="md"
                  fullWidth
                  haptic={false}
                  onPress={() => goTo(step - 1)}
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
            Built on Midnight. Receipts mirror to Solana.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  contentCentred: { flexGrow: 1, justifyContent: 'center' },

  brand: { alignItems: 'center', marginBottom: space['2xl'] },
  mark: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  markSmall: { alignItems: 'center', justifyContent: 'center' },
  markGlow: { position: 'absolute' },
  wordmark: { marginTop: space.md },
  tagline: { marginTop: space.sm, textAlign: 'center' },

  card: {},
  step: { padding: space['2xl'] },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: alpha.t10 },
  stepCount: { color: alpha.t72, letterSpacing: 1 },
  stepCountTotal: { color: alpha.t28 },
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

  form: { marginTop: space['2xl'] },

  publish: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.xl,
    padding: space.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  publishLabel: { flex: 1, lineHeight: 17 },

  failed: { marginTop: space.lg, color: palette.negative },
  blocked: { marginTop: space.sm, textAlign: 'center' },

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
