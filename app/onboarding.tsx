import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { HaloMark } from '@/components/brand/HaloMark';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { MetalButton } from '@/components/ui/MetalButton';
import { useKeyboardInset } from '@/components/ui/keyboard';
import {
  BioSection,
  CardSection,
  IdentitySection,
  InterestsSection,
  ScoringSection,
  DeploySection,
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
 * Eight short steps in one fixed frame. Two things about that are deliberate.
 *
 * *Fixed*: the screen does not scroll. Header, progress and the action button
 * are pinned to the same pixels on every step, so moving through the flow never
 * moves the furniture - the only thing that changes is the panel in the middle.
 * The earlier version centred the paragraph steps and top-aligned the form
 * steps, which meant the logo jumped from 92px to 44px and the whole page slid
 * upwards at step three. That reads as a bug even when it is intentional.
 * Content that cannot fit - a form with the keyboard up - scrolls *inside* the
 * panel, which is the one place scrolling costs nothing.
 *
 * *Eight*: the three form steps used to carry twenty-six controls between them,
 * so two of them ran past a screen-height and the button that ends a step was
 * below the fold. Splitting costs two extra taps and buys a form that always
 * fits the screen it is asked on.
 *
 * The two disclosure steps sit *before* anything is published rather than under
 * settings afterwards. By the time the last step commits the record, the user
 * has already answered "what am I showing?", and the commitment covers that
 * answer - a decision with consequences on the ledger rather than a preference
 * the client is trusted to honour.
 */

type FormKind = 'identity' | 'bio' | 'interests' | 'card' | 'scoring' | 'deploy';

/**
 * What a step *does*, as opposed to what it looks like.
 *
 * Added when verification moved. The old `advance` switched on the step's
 * index - `step === 1` meant "prove adulthood" - which made the order of this
 * array and the behaviour of that function two encodings of the same fact, kept
 * in agreement by hand. Reordering under that scheme silently reassigns
 * behaviour to whichever step inherits the index. Naming the action means the
 * array can be reordered freely and nothing follows it.
 */
type StepKind = 'wallet' | 'verify' | 'form' | 'publish';

type Step = {
  kind: StepKind;
  title: string;
  /** One line, or nothing. Anything longer belongs on the privacy screen. */
  body?: string;
  action: string;
  /** Capability steps only. Form steps carry no glyph - see `stepHead`. */
  icon?: IconName;
  form?: FormKind;
};

/**
 * Wallet, then who you are, then the proof, then what you are into.
 *
 * Verification sits immediately after the profile answers and before interests.
 * It used to run second, before the user had told the app anything at all,
 * which asked for a credential proof from someone who had not yet decided they
 * were signing up. Moving it after the identity and bio steps means the proof
 * is the last thing between a filled-in profile and the rest of the flow, and
 * every step after it can assume an adult.
 *
 * The verification step itself is untouched - same copy, same glyph, same
 * proof. Only its position in this array changed.
 */
const STEPS: Step[] = [
  {
    kind: 'wallet',
    icon: 'wallet',
    title: 'Connect a key',
    body: 'Your wallet signs handshakes and holds your credential. Halo never holds your keys, and never sees where you are.',
    action: 'Connect wallet',
  },
  { kind: 'form', title: 'Who you are', action: 'Continue', form: 'identity' },
  {
    kind: 'form',
    title: 'Your bio',
    body: 'This is what the matcher reads.',
    action: 'Continue',
    form: 'bio',
  },
  {
    kind: 'verify',
    icon: 'fingerprint',
    title: 'Prove you are over 18',
    body: 'A zero-knowledge proof against your credential. Halo learns one bit. Your date of birth stays in the wallet.',
    action: 'Prove adulthood',
  },
  {
    kind: 'form',
    title: 'What you are into',
    body: 'Pick what is actually true.',
    action: 'Continue',
    form: 'interests',
  },
  {
    kind: 'form',
    title: 'On your card',
    body: 'What other people see.',
    action: 'Continue',
    form: 'card',
  },
  {
    kind: 'form',
    title: 'What the matcher scores',
    body: 'A closed dimension leaves the arithmetic on both sides.',
    action: 'Continue',
    form: 'scoring',
  },
  {
    kind: 'publish',
    icon: 'broadcast',
    title: 'Turn on proximity',
    body: 'Your fix is snapped to a 250 m grid on this device. Only the commitment leaves.',
    action: 'Continue',
  },
  {
    kind: 'form',
    icon: 'wallet',
    title: 'Deploy Profile',
    body: 'Deploy your metadata to a Midnight contract. A fee of 1 NIGHT token is required.',
    action: 'Pay 1 NIGHT & Deploy',
    form: 'deploy',
  },
];

const LAST = STEPS.length - 1;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    connect,
    wallet,
    profile,
    saveProfile,
    publishProfile,
    mask,
    toggleDimension,
    markVerified,
    contractAddress,
  } =
    useHalo();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** Set once the record is on chain. Replaces the step panel with the receipt. */
  const [done, setDone] = useState<Proof | null>(null);
  const panel = useRef<ScrollView>(null);
  // The frame already pads by the safe-area inset; the keyboard adds the rest.
  const keyboardInset = useKeyboardInset(insets.bottom);

  const current = STEPS[step];

  const goTo = useCallback((next: number) => {
    setShowErrors(false);
    setFailed(null);
    setStep(next);
    // The panel is the only thing that scrolls, so it is the only thing that
    // needs resetting between steps.
    panel.current?.scrollTo({ y: 0, animated: false });
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
      if (current.kind === 'wallet') {
        await connect();
      } else if (current.kind === 'verify') {
        // The credential proof runs against the wallet-held credential; the
        // demo advances without one rather than blocking the walkthrough.
        await new Promise((resolve) => setTimeout(resolve, 900));
        // Recorded, not decided here. The step above is the verification; this
        // only keeps its answer, so a relaunch and the discovery query can both
        // read it instead of asking the user to prove adulthood twice.
        markVerified();
      } else if (step === LAST - 1) {
        // Coarse accuracy is all the grid needs, and asking for less is the
        // point - a fine fix would be discarded a moment later anyway.
        await Location.requestForegroundPermissionsAsync();
      } else if (step === LAST) {
        // Simulate a 1 NIGHT token transaction delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
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
  }, [current.form, current.kind, profile, step, connect, markVerified, publishProfile, goTo]);

  const ready = isComplete(profile);
  const finished = done !== null;

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={1} origin={1.0} />

      <Animated.View style={[styles.flex, keyboardInset]}>
        <View
          style={[
            styles.frame,
            { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg },
          ]}
        >
          {/* Pinned. Identical on every step and on the receipt, which is the
              whole point - nothing above the panel is allowed to move. */}
          <View style={styles.header}>
            <HaloMark size={34} />
            <Text style={[type.title3, styles.wordmark]}>Halo</Text>
            <View style={styles.flex} />
            <Text style={[type.digest, styles.count]}>
              {finished ? 'Done' : String(step + 1).padStart(2, '0')}
              {finished ? null : (
                <Text style={styles.countTotal}>
                  {' / ' + String(STEPS.length).padStart(2, '0')}
                </Text>
              )}
            </Text>
          </View>

          <Progress value={finished ? 1 : (step + 1) / STEPS.length} />

          <View style={styles.stage}>
            <LiquidGlass radius={radii.sheet} style={styles.panel} intensity={52}>
              <ScrollView
                ref={panel}
                // grow, not flex: the panel hugs short content and only becomes
                // scrollable once the content genuinely exceeds the stage.
                contentContainerStyle={styles.panelBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
                overScrollMode="never"
              >
                {finished ? (
                  <Receipt proof={done} contractAddress={contractAddress} profile={profile} />
                ) : (
                  <Animated.View key={step} entering={FadeIn.duration(240)}>
                    <View style={styles.titleRow}>
                      <Text style={[type.title2, styles.title]}>{current.title}</Text>
                      {current.icon ? (
                        <Icon name={current.icon} size={18} color={alpha.t38} />
                      ) : null}
                    </View>
                    {current.body ? (
                      <Text style={[type.callout, styles.body]}>{current.body}</Text>
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
                        ) : current.form === 'scoring' ? (
                          <ScoringSection mask={mask} onToggleDimension={toggleDimension} />
                        ) : (
                          <DeploySection profile={profile} />
                        )}
                      </View>
                    ) : null}
                  </Animated.View>
                )}
              </ScrollView>
            </LiquidGlass>
          </View>

          {/* Pinned. The primary action lands under the same thumb on all eight
              steps, which is most of what makes a flow feel built rather than
              assembled. */}
          <View style={styles.footer}>
            {failed ? <Text style={[type.caption, styles.failed]}>{failed}</Text> : null}
            {!finished && step === LAST && !ready ? (
              <Text style={[type.caption, styles.blocked]}>
                Finish your name, age and interests first.
              </Text>
            ) : null}

            <MetalButton
              label={finished ? 'Enter Halo' : current.action}
              variant="violet"
              size="lg"
              fullWidth
              disabled={!finished && step === LAST && !ready}
              loading={busy || wallet.status === 'connecting'}
              onPress={finished ? () => router.replace('/(tabs)') : () => void advance()}
            />

            {/* Reserved rather than conditional: a back button that appears at
                step two would shove the primary action up 44px on arrival. */}
            <View style={styles.backSlot}>
              {step > 0 && !finished ? (
                <MetalButton
                  label="Back"
                  variant="ghost"
                  size="md"
                  fullWidth
                  haptic={false}
                  onPress={() => goTo(step - 1)}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Step progress.
 *
 * Animated off a measured track width rather than a percentage string: a
 * percentage in an animated style has to be re-parsed on every frame, and on
 * Android it drops to the JS thread to do it.
 */
function Progress({ value }: { value: number }) {
  const width = useSharedValue(0);
  const [track, setTrack] = useState(0);

  useEffect(() => {
    if (track > 0) width.value = withTiming(value * track, { duration: 340 });
  }, [value, track, width]);

  const fill = useAnimatedStyle(() => ({ width: width.value }));
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrack(e.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.track} onLayout={onLayout}>
      <Animated.View style={[styles.trackFill, fill]} />
    </View>
  );
}

/**
 * The confirmation.
 *
 * Onboarding used to navigate away the instant the proof resolved, so the one
 * moment worth showing - the record actually landing - was a frame the user
 * never saw. This states it and names both chains.
 *
 * The Solana line reads honestly: the memo is built the moment the proof
 * exists, but nothing mirrors it until the bridge submits, so it says "ready"
 * rather than claiming a transaction that has not happened.
 */
function Receipt({ proof, contractAddress, profile }: { proof: Proof; contractAddress: string | null; profile: any }) {
  return (
    <Animated.View entering={FadeIn.duration(320)}>
      <View style={styles.tick}>
        <Icon name="check" size={24} color={palette.positive} />
      </View>

      <Text style={[type.title2, styles.doneTitle]}>Contract Deployed</Text>
      <Text style={[type.callout, styles.doneBody]}>
        Paid 1 NIGHT fee. Metadata saved on Midnight via zero-knowledge contract.
      </Text>

      <View style={styles.receipt}>
        <ReceiptRow label="Contract" value={contractAddress || 'mn_contract1...'} state="Deployed" />
        <ReceiptRow label="Midnight" value={digest(proof.inputs.commitA)} state="Committed" />
        <ReceiptRow
          label="Solana"
          value={digest(proof.nullifier)}
          state={proof.solanaSignature ? 'Mirrored' : 'Receipt ready'}
        />
      </View>

      <Text style={[type.captionStrong, { marginTop: space.xl, marginBottom: space.sm, color: alpha.t56 }]}>
        Public Metadata Payload
      </Text>
      <View style={[styles.receipt, { marginTop: 0, paddingVertical: space.md }]}>
        <Text style={[type.caption, { color: alpha.t56, fontFamily: 'monospace' }]}>
          {JSON.stringify(
            {
              name: profile.name,
              age: profile.age,
              interests: profile.interests,
              shown: proof.disclosed.shown,
            },
            null,
            2,
          )}
        </Text>
      </View>
    </Animated.View>
  );
}

function ReceiptRow({ label, value, state }: { label: string; value: string; state: string }) {
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
  frame: { flex: 1, paddingHorizontal: space.xl },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wordmark: { letterSpacing: -0.2 },
  count: { color: alpha.t72, letterSpacing: 1 },
  countTotal: { color: alpha.t28 },

  track: {
    height: 2,
    borderRadius: 1,
    backgroundColor: alpha.t08,
    marginTop: space.lg,
    overflow: 'hidden',
  },
  trackFill: { height: 2, borderRadius: 1, backgroundColor: palette.violet },

  /** Centres the panel in whatever height is left between header and footer. */
  stage: { flex: 1, justifyContent: 'center', paddingVertical: space.xl },
  /** flexShrink lets the panel give way to the keyboard instead of overflowing. */
  panel: { flexShrink: 1 },
  panelBody: { padding: space['2xl'] },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { flex: 1 },
  body: { marginTop: space.sm },
  form: { marginTop: space.xl },

  footer: { gap: space.sm },
  failed: { color: palette.negative, textAlign: 'center' },
  blocked: { textAlign: 'center' },
  /** Height of a `size="md"` MetalButton, held whether or not one is rendered. */
  backSlot: { height: 46 },

  tick: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,211,153,0.38)',
    marginBottom: space.lg,
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
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11 },
  receiptLabel: { width: 62 },
  receiptValue: { flex: 1, color: alpha.t56 },
  receiptState: { color: palette.positive },
});
