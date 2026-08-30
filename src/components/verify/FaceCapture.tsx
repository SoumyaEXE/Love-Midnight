import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MetalButton } from '@/components/ui/MetalButton';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { useHalo } from '@/state/store';
import {
  POSES,
  REVIEW_WINDOW_LABEL,
  reviewCountdown,
  type FaceCheck,
  type FacePose,
  type FaceShot,
} from '@/state/faceCheck';

/**
 * Photo identity check.
 *
 * Three frames of the same face from three angles, then a queue. The angles are
 * the whole point: a single front-on photograph is satisfied by a photograph of
 * a photograph, and asking the head to turn is the cheapest liveness signal
 * there is - a flat print cannot show a cheek.
 *
 * One shot is asked for at a time. Putting three viewfinders on a screen, or
 * one viewfinder and a mode picker, makes the user hold the sequence in their
 * head while also holding their phone at arm's length; a single instruction
 * that changes after each capture asks them to hold nothing.
 *
 * Nothing is sent until all three exist and the user presses the button that
 * says so. Until then every frame is retakeable and lives only in this
 * component's state - see `state/faceCheck` for why it stays there.
 */

type Shots = Partial<Record<FacePose, FaceShot>>;

export function FaceCapture({
  /** Called once the submission is accepted. Lets a host screen move on. */
  onSubmitted,
}: {
  onSubmitted?: () => void;
}) {
  const { faceCheck, submitFaceCheck } = useHalo();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);

  const [shots, setShots] = useState<Shots>({});
  /** Set when the user taps a filled slot, so one angle can be redone alone. */
  const [redoing, setRedoing] = useState<FacePose | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /**
   * Whether the sensor has actually started.
   *
   * A handset opens a real camera session, which takes a moment; the preview is
   * black until it finishes and a shutter fired into that window returns a black
   * frame rather than an error. A browser reattaches one `<video>` element fast
   * enough that this never shows, which is why it took a phone to find.
   */
  const [live, setLive] = useState(false);
  /**
   * Set when the sensor has had long enough and still has not reported in.
   *
   * `onCameraReady` is not guaranteed to arrive on every device, and a button
   * that waits forever for a callback that is never coming is worse than one
   * that lets a probably-warm camera try.
   */
  const [waitedOut, setWaitedOut] = useState(false);

  /**
   * The angle being asked for.
   *
   * A redo wins over the natural order, and null means all three are in hand -
   * which is also what swaps the viewfinder out for the review strip, so there
   * is exactly one value deciding what the screen is for at any moment.
   */
  const target = useMemo(() => {
    if (redoing) return POSES.find((p) => p.pose === redoing) ?? null;
    return POSES.find((p) => !shots[p.pose]) ?? null;
  }, [redoing, shots]);

  const taken = POSES.filter((p) => shots[p.pose]).length;

  /** The viewfinder is on screen. False once all three exist, true again on a redo. */
  const finderUp = target !== null;

  // The camera only exists while the viewfinder does, so its readiness has to
  // die with it - carrying a stale `true` into a remount is exactly the bug
  // this state was added to close.
  useEffect(() => {
    if (finderUp) return;
    setLive(false);
    setWaitedOut(false);
  }, [finderUp]);

  useEffect(() => {
    if (!finderUp || live) return;
    const timer = setTimeout(() => setWaitedOut(true), 6000);
    return () => clearTimeout(timer);
  }, [finderUp, live]);

  /** Safe to fire the shutter: reported ready, or waited long enough to stop asking. */
  const armed = live || waitedOut;

  const capture = useCallback(async () => {
    // Genuine no-ops: there is nothing to shoot, or a shot is already in
    // flight. Everything else that can go wrong says so - a shutter button
    // that quietly does nothing is indistinguishable from a broken one.
    if (!target || capturing || !armed) return;

    setCapturing(true);
    setFailed(null);
    try {
      if (!camera.current) {
        throw new Error('The camera is not attached yet. Give it a moment, then try again.');
      }
      const picture = await camera.current.takePictureAsync({ quality: 0.6 });
      // A camera that hands back nothing is a real outcome on the web, where
      // the video track can end between the tap and the grab. Treating it as a
      // failure beats writing `undefined` into a slot that then looks filled.
      //
      // The size check is the same argument for a handset: a session that has
      // not finished opening answers with a frame that has a URI and no
      // pixels, and a zero-sized shot must not advance the sequence.
      if (!picture?.uri || !picture.width || !picture.height) {
        throw new Error('The camera returned an empty frame. Try again.');
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShots((prev) => ({
        ...prev,
        [target.pose]: {
          pose: target.pose,
          uri: picture.uri,
          width: picture.width,
          height: picture.height,
        },
      }));
      setRedoing(null);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not take that photo.');
    } finally {
      setCapturing(false);
    }
  }, [target, capturing, armed]);

  const submit = useCallback(async () => {
    setSending(true);
    setFailed(null);
    try {
      await submitFaceCheck(POSES.map((p) => shots[p.pose]).filter(Boolean) as FaceShot[]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Dropped rather than kept: the receipt below never shows them, and a
      // face held in memory for a screen that will not display it is a face
      // held for nothing.
      setShots({});
      onSubmitted?.();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Upload failed. Try again.');
    } finally {
      setSending(false);
    }
  }, [shots, submitFaceCheck, onSubmitted]);

  // Already in the queue, or already through it. The capture UI would be
  // offering to do something that has been done.
  if (faceCheck.status !== 'none') return <FaceCheckReceipt check={faceCheck} />;

  if (!permission) {
    return <Text style={[type.callout, styles.muted]}>Checking camera access…</Text>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.gate}>
        <View style={styles.gateIcon}>
          <Icon name="person" size={26} color={palette.violet} />
        </View>
        <Text style={[type.body, styles.gateTitle]}>Halo needs the camera</Text>
        <Text style={[type.callout, styles.gateBody]}>
          {permission.canAskAgain
            ? 'Three photos of your face, taken here and now. Nothing from your photo library is read.'
            : 'Camera access is turned off for Halo. Turn it back on in your device settings, then come back to this screen.'}
        </Text>
        {permission.canAskAgain ? (
          <MetalButton
            label="Allow camera"
            variant="violet"
            size="md"
            fullWidth
            onPress={() => void requestPermission()}
            style={styles.gateAction}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {target ? (
        <View>
          {/* Mounted once for the whole sequence, and deliberately not keyed to
              the pose. Keying it here tore the native camera session down and
              built a new one after every capture, so the second and third taps
              landed on a sensor that had not finished opening: no usable frame,
              and the step counter moved on regardless. Only the caption and the
              pill change between angles now - the camera never blinks. */}
          <View style={styles.viewfinder}>
            <CameraView
              ref={camera}
              facing="front"
              style={StyleSheet.absoluteFill}
              onCameraReady={() => setLive(true)}
              onMountError={() =>
                setFailed('The camera would not start. Close any other app using it, then try again.')
              }
            />

            {/* Every overlay is inert to touch so the viewfinder never eats a
                press meant for anything underneath it. */}
            <View style={styles.oval} pointerEvents="none" />
            <Animated.View
              key={target.pose}
              entering={FadeIn.duration(220)}
              style={styles.stepPill}
              pointerEvents="none"
            >
              <Text style={type.micro}>
                {taken + 1} of {POSES.length} · {target.label}
              </Text>
            </Animated.View>

            {armed ? null : (
              <View style={styles.warming} pointerEvents="none">
                <Text style={[type.caption, styles.warmingText]}>Starting the camera…</Text>
              </View>
            )}
          </View>

          <Animated.Text
            key={target.pose}
            entering={FadeIn.duration(220)}
            style={[type.callout, styles.instruction]}
          >
            {target.instruction}
          </Animated.Text>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(220)} style={styles.ready}>
          <Icon name="check" size={20} color={palette.positive} />
          <Text style={[type.callout, styles.readyText]}>
            All three angles captured. Check them, then send them for review.
          </Text>
        </Animated.View>
      )}

      <View style={styles.strip}>
        {POSES.map((spec, index) => (
          <Slot
            key={spec.pose}
            index={index}
            label={spec.label}
            shot={shots[spec.pose]}
            active={target?.pose === spec.pose}
            onRedo={() => {
              void Haptics.selectionAsync();
              setRedoing(spec.pose);
            }}
          />
        ))}
      </View>

      {failed ? <Text style={[type.caption, styles.failed]}>{failed}</Text> : null}

      <MetalButton
        label={
          target
            ? armed
              ? `Take the ${target.label.toLowerCase()} photo`
              : 'Starting the camera…'
            : 'Upload for review'
        }
        variant="violet"
        size="lg"
        fullWidth
        // Held rather than allowed-and-then-rejected: a shutter that fires into
        // a warming sensor produces a black frame, and a black frame that looks
        // like a successful capture is the worst of the three outcomes.
        disabled={target ? !armed : false}
        loading={capturing || sending}
        onPress={() => void (target ? capture() : submit())}
        style={styles.action}
      />

      <Text style={[type.caption, styles.footnote]}>
        Reviewed by a person, not a model. You will hear back within {REVIEW_WINDOW_LABEL}.
      </Text>
    </View>
  );
}

/**
 * One slot in the three-up strip.
 *
 * A filled slot is a button and an empty one is not, which is the honest
 * mapping: you can redo a photo you have taken and you cannot redo one you have
 * not. Rendering both as pressables and disabling two of them would put three
 * tap targets on screen where only one does anything.
 */
function Slot({
  index,
  label,
  shot,
  active,
  onRedo,
}: {
  index: number;
  label: string;
  shot?: FaceShot;
  active: boolean;
  onRedo: () => void;
}) {
  const frame = (
    <View style={[styles.slotFrame, active && styles.slotFrameActive]}>
      {shot ? (
        <>
          <Image source={{ uri: shot.uri }} style={styles.slotImage} resizeMode="cover" />
          <View style={styles.slotTick}>
            <Icon name="check" size={11} color={palette.void} />
          </View>
        </>
      ) : (
        <Text style={[type.title3, styles.slotNumber]}>{index + 1}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.slot}>
      {shot ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retake the ${label.toLowerCase()} photo`}
          onPress={onRedo}
        >
          {frame}
        </Pressable>
      ) : (
        frame
      )}
      <Text style={[type.micro, active ? styles.slotLabelActive : styles.slotLabel]}>
        {shot ? 'Retake' : label}
      </Text>
    </View>
  );
}

/**
 * The confirmation, and afterwards the status.
 *
 * The same component serves both because they are the same fact at different
 * ages - "sent, decision within a day" reads identically an hour later, and a
 * user who reopens the screen should find the promise they were given rather
 * than a fresh invitation to do it all again.
 */
export function FaceCheckReceipt({ check }: { check: FaceCheck }) {
  const done = check.status === 'verified';

  return (
    <Animated.View entering={FadeIn.duration(280)}>
      <View style={[styles.seal, done ? styles.sealDone : styles.sealPending]}>
        <Icon
          name={done ? 'verified' : 'clock'}
          size={24}
          color={done ? palette.positive : palette.violet}
        />
      </View>

      <Text style={[type.title3, styles.receiptTitle]}>
        {done ? 'Your ID is verified' : 'Photos received'}
      </Text>
      <Text style={[type.callout, styles.receiptBody]}>
        {done
          ? 'A reviewer matched your photos to your profile. The badge is on your card.'
          : `Your ID will be verified within ${REVIEW_WINDOW_LABEL}. You can keep using Halo in the meantime - nothing is on hold.`}
      </Text>

      <View style={styles.receipt}>
        <ReceiptRow label="Photos" value={`${check.shots} angles sent`} />
        <ReceiptRow
          label="Submitted"
          value={check.submittedAt ? formatSubmitted(check.submittedAt) : '—'}
        />
        <ReceiptRow
          label={done ? 'Result' : 'Decision'}
          value={reviewCountdown(check)}
          tone={done ? 'positive' : 'default'}
        />
      </View>
    </Animated.View>
  );
}

function ReceiptRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive';
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={[type.captionStrong, styles.receiptLabel]}>{label}</Text>
      <Text
        style={[type.caption, tone === 'positive' ? styles.receiptPositive : styles.receiptValue]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** "30 Aug, 14:05". Date and time, because a day-old ticket needs both. */
function formatSubmitted(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  muted: { color: alpha.t38 },

  gate: { alignItems: 'center' },
  gateIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,180,254,0.38)',
  },
  gateTitle: { marginTop: space.lg },
  gateBody: { marginTop: space.sm, textAlign: 'center', lineHeight: 20 },
  gateAction: { marginTop: space.xl },

  viewfinder: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 300,
    alignSelf: 'center',
    borderRadius: radii.xl,
    // Clips the camera surface to the radius. Without it the preview paints a
    // hard square through the rounded frame on every platform.
    overflow: 'hidden',
    backgroundColor: palette.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t14,
  },
  /**
   * The head guide.
   *
   * Percentages rather than pixels so it stays proportional between the
   * onboarding panel and the full screen, where the same viewfinder is roughly
   * a third wider.
   */
  oval: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    top: '12%',
    bottom: '12%',
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'rgba(216,180,254,0.7)',
  },
  stepPill: {
    position: 'absolute',
    top: space.md,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(7,6,10,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t14,
  },
  /** Covers the black preview while the session opens, so the wait has a reason. */
  warming: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,6,10,0.72)',
  },
  warmingText: { color: alpha.t56 },

  instruction: { marginTop: space.lg, textAlign: 'center', lineHeight: 20 },

  ready: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radii.md,
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,211,153,0.32)',
  },
  readyText: { flex: 1, lineHeight: 19 },

  strip: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  slot: { flex: 1, alignItems: 'center', gap: 6 },
  slotFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
  },
  slotFrameActive: { borderColor: 'rgba(216,180,254,0.55)' },
  slotImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  slotNumber: { color: alpha.t20 },
  slotTick: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.positive,
  },
  slotLabel: { color: alpha.t38 },
  slotLabelActive: { color: palette.white },

  failed: { marginTop: space.md, color: palette.negative, textAlign: 'center' },
  action: { marginTop: space.xl },
  footnote: { marginTop: space.md, textAlign: 'center', lineHeight: 18 },

  seal: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.lg,
  },
  sealPending: {
    backgroundColor: 'rgba(168,85,247,0.14)',
    borderColor: 'rgba(216,180,254,0.38)',
  },
  sealDone: {
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderColor: 'rgba(52,211,153,0.38)',
  },
  receiptTitle: { textAlign: 'center' },
  receiptBody: { textAlign: 'center', marginTop: space.sm, lineHeight: 20 },

  receipt: {
    marginTop: space.xl,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
    paddingHorizontal: space.lg,
  },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11 },
  receiptLabel: { width: 78 },
  receiptValue: { flex: 1, color: alpha.t56, textAlign: 'right' },
  receiptPositive: { flex: 1, color: palette.positive, textAlign: 'right' },
});
