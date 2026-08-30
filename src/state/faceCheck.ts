import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The face check.
 *
 * A different kind of verification from the one next to it, and the difference
 * is worth naming. The adulthood step proves a claim the user already holds a
 * credential for, in zero knowledge, on the device - Halo learns one bit and
 * nothing else. This one is the opposite trade: it asks for three photographs
 * of a face, which is the most identifying thing a person can hand over, and it
 * settles nothing on its own. A human looks at them later.
 *
 * So the two are kept apart. `Verification` in `state/store` stays the ZK
 * answer; this is a review ticket, and it says so - `pending` means a queue,
 * not a proof.
 *
 * The photographs themselves are deliberately not modelled here. They live in
 * the capture component's own state for as long as the user is looking at them
 * and are dropped on submit. What survives is the fact that a submission
 * happened and when, because that is all any later screen needs in order to
 * tell the truth about where the request stands.
 */

const KEY = 'halo.faceCheck';

/**
 * The three angles, in the order they are asked for.
 *
 * Left and right are named from the subject's own point of view, which is the
 * only frame of reference a person standing in front of a lens can act on
 * without translating. The preview is not mirrored, so the instruction and the
 * image disagree about which side of the screen the head moves towards - that
 * is why the copy says "your left" rather than pointing at anything.
 */
export type FacePose = 'front' | 'left' | 'right';

export type PoseSpec = {
  pose: FacePose;
  /** Names the shot in the thumbnail strip. Two words at most. */
  label: string;
  /** The single instruction shown over the viewfinder. */
  instruction: string;
};

export const POSES: readonly PoseSpec[] = [
  {
    pose: 'front',
    label: 'Front',
    instruction: 'Look straight into the camera. Keep your whole face inside the oval.',
  },
  {
    pose: 'left',
    label: 'Left side',
    instruction: 'Turn your head to your left, so the camera sees your right cheek.',
  },
  {
    pose: 'right',
    label: 'Right side',
    instruction: 'Now turn your head to your right, so the camera sees your left cheek.',
  },
] as const;

/** One captured frame, held in memory only. See the note at the top. */
export type FaceShot = {
  pose: FacePose;
  /** File URI on a handset, a base64 data URI in a browser. */
  uri: string;
  width: number;
  height: number;
};

/**
 * Where the request stands.
 *
 * `none` is "never asked", not "failed" - nothing in the app treats an
 * unsubmitted check as a rejection, and the copy everywhere reflects that.
 */
export type FaceCheckStatus = 'none' | 'pending' | 'verified';

export type FaceCheck = {
  status: FaceCheckStatus;
  /** Epoch ms of the submission the current status refers to. */
  submittedAt: number | null;
  /** How many frames were sent. Shown on the receipt so the user can count. */
  shots: number;
};

export const emptyFaceCheck: FaceCheck = { status: 'none', submittedAt: null, shots: 0 };

/** The promise made on the confirmation screen, in one place. */
export const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REVIEW_WINDOW_LABEL = '24 hours';

/**
 * What is left of the promised window, as a sentence.
 *
 * Rounded up, always. A review that has twenty-five minutes to run reads as
 * "about 1 hour left" rather than "about 0 hours left", and a window that has
 * already elapsed says so plainly instead of counting into negative numbers -
 * an overdue review is a real state and pretending otherwise would be the one
 * lie this screen cannot afford.
 */
export function reviewCountdown(check: FaceCheck, now: number = Date.now()): string {
  if (check.status === 'verified') return 'Verified';
  if (check.status === 'none' || check.submittedAt === null) {
    return `Within ${REVIEW_WINDOW_LABEL}`;
  }

  const left = check.submittedAt + REVIEW_WINDOW_MS - now;
  if (left <= 0) return 'Due now';

  const hours = Math.ceil(left / 3_600_000);
  if (hours > 1) return `About ${hours} hours left`;

  const minutes = Math.max(1, Math.ceil(left / 60_000));
  return `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
}

export async function loadFaceCheck(): Promise<FaceCheck | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FaceCheck>;
    // Validated rather than cast: this value decides what the profile screen
    // claims about the user's identity, and a corrupt preference should read as
    // "never asked" instead of forging a status nobody granted.
    if (parsed.status !== 'pending' && parsed.status !== 'verified') return null;
    return {
      status: parsed.status,
      submittedAt: typeof parsed.submittedAt === 'number' ? parsed.submittedAt : null,
      shots: typeof parsed.shots === 'number' ? parsed.shots : 0,
    };
  } catch {
    return null;
  }
}

export async function persistFaceCheck(check: FaceCheck): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(check));
}

export async function clearFaceCheck(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
