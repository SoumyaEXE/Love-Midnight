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
  BioSection,
  CardSection,
  IdentitySection,
  InterestsSection,
  ScoringSection,
} from '@/components/profile/ProfileForm';
import { Icon, type IconName } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { useHalo } from '@/state/store';
import { markOnboarded } from '@/state/onboarding';
import { isComplete, problems } from '@/state/profile';
import type { Proof } from '@/chain/midnight/types';

/**
 * Onboarding.
 *
 * Eight short steps rather than six long ones. The count went up on purpose:
 * the three form steps were carrying twenty-six controls between them, so two
 * of them scrolled and the button that ends a step was below the fold. Splitting
 * them costs two extra taps and buys a form that always fits on the screen it
 * is asked on - which is the difference between answering a question and
 * filling in a form.
 *
 * The two disclosure steps are deliberately placed *before* anything is
 * published rather than filed under settings afterwards. By the time the final
 * step commits the record, the user has already answered "what am I showing?",
 * and the commitment covers that answer - so it is a decision with consequences
 * on the ledger rather than a preference the client is trusted to honour.
 */

type FormKind = 'identity' | 'bio' | 'interests' | 'card' | 'scoring';

type Step = {
  title: string;
  /** One line, or nothing. Anything longer belongs on the privacy screen. */
  body?: string;
  action: string;
  /** Capability steps only. Form steps carry no glyph - see `stepHead`. */
  icon?: IconName;
  form?: FormKind;
};

const STEPS: Step[] = [
  {
    icon: 'wallet',
    title: 'Connect a key',
    body: 'Your wallet signs handshakes and holds your credential. Halo never holds your keys, and never sees where you are.',
    action: 'Connect wallet',
  },
  {
    icon: 'fingerprint',
    title: 'Prove you are over 18',
    body: 'A zero-knowledge proof against your credential. Halo learns one bit. Your date of birth stays in the wallet.',
    action: 'Prove adulthood',
  },
  { title: 'Who you are', action: 'Continue', form: 'identity' },
  { title: 'Your bio', body: 'This is what the matcher reads.', action: 'Continue', form: 'bio' },
  {
    title: 'What you are into',
    body: 'Pick what is actually true.',
    action: 'Continue',
    form: 'interests',
  },
  {
    title: 'On your card',
    body: 'What other people see.',
    action: 'Continue',
    form: 'card',
  },
  {
    title: 'What the matcher scores',
    body: 'A closed dimension leaves the arithmetic on both sides.',
    action: 'Continue',
    form: 'scoring',
  },
  {
    icon: 'broadcast',
    title: 'Turn on proximity',
    body: 'Your fix is snapped to a 250 m grid on this device. Only the commitment leaves.',
    action: 'Publish & finish',
  },
];

const LAST = STEPS.length - 1;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { connect, wallet, profile, saveProfile, publishProfile, mask, toggleDimension } =
    useHalo();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** Set once the record is on chain. Replaces the step card with the receipt. */
  const [done, setDone] = useState<Proof | null>(null);
  const scroller = useRef<ScrollView>(null);

  const current = STEPS[step];

  const goTo = useCallback((next: number) => {
    setShowErrors(false);
    setFailed(null);
    setStep(next);
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const advance = useCallback(async () => {
    // Form steps validate before they will let go, and each one only checks
    // what it actually asked for - a step must never fail on a field that is
    // two steps away and invisible.
    const found = problems(profile);
    if (current.form === 'identity' && (found.name || found.age)) {
      setShowErrors(true);
      return;
    }
    if (current.form === 'interests' && found.interests) {
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
      } else if (step === LAST) {
        // Coarse accuracy is all the grid needs, and asking for less is the
        // point - a fine fix would be discarded a moment later anyway.
        await Location.requestForegroundPermissionsAsync();
        // The commitment, not the profile. If this throws, the user is not
        // pushed into the app with an unpublished record and no idea.
        const proof = await publishProfile();
        await markOnboarded();
        setDone(proof);
        return;
      }

      goTo(step + 1);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, [current.form, profile, step, connect, publishProfile, goTo]);

  const ready = isComplete(profile);
  const finished = done !== null;
  // The brand gets the full stage on paragraph steps and on the receipt; a
  // form step gives that space back to the fields.
  const wide = finished || !current.form;

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
            wide && styles.contentCentred,
            {
              paddingTop: insets.top + (wide ? space['4xl'] : space['2xl']),
              paddingBottom: insets.bottom + space['3xl'],
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* The brand only gets the full stage on the paragraph steps. On a
              form, a 150px logo above the fold is 150px of the answer the user
              is trying to give. */}
          <Animated.View entering={FadeIn.duration(600)} style={styles.brand}>
            <View style={wide ? styles.mark : styles.markSmall}>
              {wide ? <SpotGlow size={150} opacity={0.7} style={styles.markGlow} /> : null}
              <HaloMark size={wide ? 92 : 44} />
            </View>
            {wide ? (
              <>
                <Text style={[type.display, styles.wordmark]}>Halo</Text>
                <Text style={[type.bodyLight, styles.tagline]}>Meet nearby. Prove nothing.</Text>
              </>
            ) : null}
          </Animated.View>

          {done ? (
            <Receipt proof={done} onEnter={() => router.replace('/(tabs)')} />
          ) : (
            <>
              <Animated.View key={step} entering={FadeInDown.duration(320)} style={styles.card}>
                <LiquidGlass radius={radii.sheet} style={styles.step} intensity={52}>
                  {/* A counter and a rule. The violet-filled icon disc that used
                      to sit here had the visual weight of a status badge for
                      what is only a position in a sequence, and on the form
                      steps it was pure decoration above the first field. */}
                  <View style={styles.stepHead}>
                    <Text style={[type.digest, styles.stepCount]}>
                      {String(step + 1).padStart(2, '0')}
                      <Text style={styles.stepCountTotal}>
                        {' / ' + String(STEPS.length).padStart(2, '0')}
                      </Text>
                    </Text>
                    <View style={styles.stepRule} />
                    {current.icon ? (
                      <Icon name={current.icon} size={17} color={alpha.t38} />
                    ) : null}
                  </View>

                  <Text style={[type.title2, styles.stepTitle]}>{current.title}</Text>
                  {current.body ? (
                    <Text style={[type.callout, styles.stepBody]}>{current.body}</Text>
                  ) : null}

                  {current.form ? (
                    <View style={styles.form}>
                      {current.form === 'identity' ? (
                        <IdentitySection
                          profile={profile}
                          onChange={saveProfile}
                          showErrors={showErrors}
                        />
                      ) : current.form === 'bio' ? (
                        <BioSection profile={profile} onChange={saveProfile} />
                      ) : current.form === 'interests' ? (
                        <InterestsSection
                          profile={profile}
                          onChange={saveProfile}
                          showErrors={showErrors}
                        />
                      ) : current.form === 'card' ? (
                        <CardSection profile={profile} onChange={saveProfile} />
                      ) : (
                        <ScoringSection mask={mask} onToggleDimension={toggleDimension} />
                      )}
                    </View>
                  ) : null}

                  {failed ? <Text style={[type.caption, styles.failed]}>{failed}</Text> : null}

                  <MetalButton
                    label={current.action}
                    variant="violet"
                    size="lg"
                    fullWidth
                    disabled={step === LAST && !ready}
                    loading={busy || wallet.status === 'connecting'}
                    onPress={() => void advance()}
                    style={styles.stepAction}
                  />

                  {step === LAST && !ready ? (
                    <Text style={[type.caption, styles.blocked]}>
                      Finish your name, age and interests first.
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
                  <View
                    key={s.title}
                    style={[
                      styles.dot,
                      index < step && styles.dotDone,
                      index === step && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            </>
          )}

          <Text style={[type.caption, styles.footnote]}>
            Built on Midnight. Receipts mirror to Solana.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The confirmation.
 *
 * Onboarding used to end by navigating away the instant the proof resolved,
 * which meant the one moment worth showing - the record actually landing - was
 * a frame the user never saw. This states it, names both chains, and lets them
 * leave when they are ready.
 *
 * The Solana line reads honestly: the memo is built the moment the proof exists,
 * but nothing mirrors it until the bridge submits, so it says "ready" rather
 * than claiming a transaction that has not happened.
 */
function Receipt({ proof, onEnter }: { proof: Proof; onEnter: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.card}>
      <LiquidGlass radius={radii.sheet} style={styles.step} intensity={52}>
        <View style={styles.tickWrap}>
          <SpotGlow size={120} opacity={0.5} style={styles.markGlow} />
          <View style={styles.tick}>
            <Icon name="check" size={26} color={palette.positive} />
          </View>
        </View>

        <Text style={[type.title2, styles.doneTitle]}>Saved on chain</Text>
        <Text style={[type.callout, styles.doneBody]}>
          Your answers stayed on this device. The commitment went out.
        </Text>

        <View style={styles.receipt}>
          <ReceiptRow label="Midnight" value={digest(proof.inputs.commitA)} state="Committed" />
          <ReceiptRow
            label="Solana"
            value={digest(proof.nullifier)}
            state={proof.solanaSignature ? 'Mirrored' : 'Receipt ready'}
          />
        </View>

        <MetalButton
          label="Enter Halo"
          variant="violet"
          size="lg"
          fullWidth
          onPress={onEnter}
          style={styles.stepAction}
        />
      </LiquidGlass>
    </Animated.View>
  );
}

function ReceiptRow({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: string;
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={[type.captionStrong, styles.receiptLabel]}>{label}</Text>
      <Text style={[type.digest, styles.receiptValue]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[type.caption, styles.receiptState]}>{state}</Text>
    </View>
  );
}

/** 0x8f3a…c410. Long enough to compare by eye, short enough for one line. */
function digest(hex: string): string {
  return hex.length <= 14 ? hex : `${hex.slice(0, 6)}…${hex.slice(-4)}`;
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

  stepTitle: { marginTop: space.lg },
  stepBody: { marginTop: space.xs },

  form: { marginTop: space.xl },

  failed: { marginTop: space.lg, color: palette.negative },
  blocked: { marginTop: space.sm, textAlign: 'center' },

  stepAction: { marginTop: space.xl },
  stepBack: { marginTop: space.sm },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space['2xl'] },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: alpha.t20 },
  dotDone: { backgroundColor: alpha.t38 },
  dotActive: { backgroundColor: palette.violet, width: 20 },

  tickWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  tick: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,211,153,0.38)',
  },
  doneTitle: { textAlign: 'center' },
  doneBody: { textAlign: 'center', marginTop: space.xs },

  receipt: {
    marginTop: space.xl,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
    paddingHorizontal: space.lg,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
  },
  receiptLabel: { width: 62 },
  receiptValue: { flex: 1, color: alpha.t56 },
  receiptState: { color: palette.positive },

  footnote: { textAlign: 'center', marginTop: space['2xl'] },
});
