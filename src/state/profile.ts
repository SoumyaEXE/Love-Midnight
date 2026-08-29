import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The user's own profile.
 *
 * Two things are stored here, and keeping them apart is the whole point:
 *
 *   the answers  - name, age, gender, bio, interests. Private by construction.
 *                  They live on this device and are committed, not uploaded.
 *   the audience - which of those answers other people are allowed to see.
 *
 * A conventional app collects the first and quietly decides the second. Halo
 * asks for both in the same breath, because "what did I agree to show?" is a
 * question a user should be able to answer without reading a policy.
 *
 * `show` is not a display filter over a record the server already has. What is
 * hidden here never leaves: the on-chain record is a commitment to the whole
 * profile, and only the fields marked visible are ever opened against it.
 */

export const GENDERS = ['woman', 'man', 'non-binary', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABEL: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  'non-binary': 'Non-binary',
  other: 'Other',
};

/** Fields the user can withhold. Name is not one - see `HaloProfile.name`. */
export const SHOWABLE = ['age', 'gender', 'bio', 'interests', 'area', 'presence'] as const;
export type ShowableField = (typeof SHOWABLE)[number];

export const SHOWABLE_COPY: Record<ShowableField, { title: string; on: string; off: string }> = {
  age: {
    title: 'Age',
    on: 'Your exact age is on your card',
    off: 'Only the 18+ proof is shown',
  },
  gender: {
    title: 'Gender',
    on: 'Shown on your card',
    off: 'Withheld from your card',
  },
  bio: {
    title: 'Bio',
    on: 'Your bio is on your card',
    off: 'Your card shows no bio',
  },
  interests: {
    title: 'Interests',
    on: 'Your tags are listed',
    off: 'Tags hidden — matching still works',
  },
  area: {
    title: 'Distance',
    on: 'People see the bucket you proved',
    off: 'No distance shown, no proofs offered',
  },
  presence: {
    title: 'Active now',
    on: 'A green dot when you are online',
    off: 'You always appear offline',
  },
};

export type HaloProfile = {
  /**
   * Always shown. A name is how someone addresses you, and a card with no
   * name is not a profile - it is an anonymous account, which Halo already
   * supports by simply not creating one.
   */
  name: string;
  age: number | null;
  gender: Gender | null;
  bio: string;
  interests: string[];
  show: Record<ShowableField, boolean>;
};

const KEY = 'halo.profile';

export function emptyProfile(): HaloProfile {
  return {
    name: '',
    age: null,
    gender: null,
    bio: '',
    interests: [],
    show: { age: true, gender: true, bio: true, interests: true, area: true, presence: true },
  };
}

/** The minimum a profile needs before it is worth committing. */
export function isComplete(profile: HaloProfile): boolean {
  return (
    profile.name.trim().length >= 2 &&
    profile.age !== null &&
    profile.age >= 18 &&
    profile.age <= 120 &&
    profile.interests.length > 0
  );
}

/** Per-field validation, so the form can point at the field that is wrong. */
export function problems(profile: HaloProfile): Partial<Record<keyof HaloProfile, string>> {
  const found: Partial<Record<keyof HaloProfile, string>> = {};
  if (profile.name.trim().length < 2) found.name = 'Enter a name people can call you';
  if (profile.age === null) found.age = 'Enter your age';
  else if (profile.age < 18) found.age = 'Halo is 18+';
  else if (profile.age > 120) found.age = 'Enter a real age';
  if (profile.interests.length === 0) found.interests = 'Pick at least one interest';
  return found;
}

/**
 * Deterministic serialisation, for the commitment.
 *
 * Field order is fixed and interests are sorted, so the same profile always
 * produces the same commitment regardless of the order things were typed in.
 * Without that, re-opening the editor and saving without changing anything
 * would rotate the commitment and look, on-chain, like a profile change.
 */
export function canonicalise(profile: HaloProfile): string {
  const show = SHOWABLE.filter((field) => profile.show[field]).join(',');
  return [
    'halo:profile:v1',
    profile.name.trim(),
    profile.age ?? '',
    profile.gender ?? '',
    profile.bio.trim(),
    [...profile.interests].map((t) => t.trim().toLowerCase()).sort().join(','),
    show,
  ].join('|');
}

export async function loadProfile(): Promise<HaloProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HaloProfile>;
    // Merged over a fresh default so a profile saved by an older build, before
    // a field existed, still loads instead of rendering undefined.
    return {
      ...emptyProfile(),
      ...parsed,
      show: { ...emptyProfile().show, ...(parsed.show ?? {}) },
    };
  } catch {
    return null;
  }
}

export async function persistProfile(profile: HaloProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
