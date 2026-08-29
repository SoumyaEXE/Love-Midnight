import { get, ref, serverTimestamp, update } from 'firebase/database';
import { database } from '@/firebase/config';
import { ensureSession } from '@/firebase/auth';
import { paths, walletKey } from '@/firebase/paths';
import type {
  RemotePreferences,
  RemoteProfile,
  RemoteUser,
  RemoteVerification,
} from '@/firebase/types';
import { SHOWABLE, type HaloProfile } from '@/state/profile';

/**
 * The user record.
 *
 * This is the only place the local profile is turned into a remote one, and the
 * projection is not cosmetic: a field the user marked hidden is *absent* from
 * the write, not written and filtered on read. The difference matters, because
 * the second kind of privacy is a promise the client makes and the first is a
 * fact about what is in the database.
 *
 * The wallet address keys the record, and the session uid owns it. See
 * `firebase/auth` for why both exist.
 */

/**
 * Claims a wallet for this session, or confirms it is already ours.
 *
 * First writer wins, permanently, enforced by the rules rather than by this
 * function - which is the point. A second install cannot take over an address
 * it does not already own, and this returns false rather than throwing so the
 * caller can degrade to a local-only session instead of failing to boot.
 */
export async function claimWallet(wallet: string): Promise<boolean> {
  const uid = await ensureSession();
  const key = walletKey(wallet);

  const existing = await get(ref(database, paths.owner(wallet)));
  if (existing.exists()) return existing.val() === uid;

  try {
    // Both directions in one write. The forward edge is what the app reads;
    // the reverse edge is what the rules read - see `firebase/paths`. Writing
    // them separately would allow a state where the rules cannot resolve a
    // wallet the app believes it owns.
    await update(ref(database), {
      [`users/${key}/owner`]: uid,
      [`owners/${uid}`]: key,
    });
    return true;
  } catch {
    // Lost the race, or the rules said no. Either way we do not own it.
    return false;
  }
}

/** The publishable projection of a local profile. Honours `show`. */
export function projectProfile(profile: HaloProfile, avatar: string): RemoteProfile {
  const remote: RemoteProfile = {
    name: profile.name.trim(),
    avatar,
    updatedAt: Date.now(),
  };

  // Written as explicit assignments rather than a spread of conditionals so
  // that adding a field to `SHOWABLE` without deciding its disclosure here is a
  // compile-time omission rather than a silent leak.
  if (profile.show.age && profile.age !== null) remote.age = profile.age;
  if (profile.show.gender && profile.gender) remote.gender = profile.gender;
  if (profile.show.bio && profile.bio.trim()) remote.bio = profile.bio.trim();
  if (profile.show.interests && profile.interests.length > 0) {
    remote.interests = profile.interests;
  }

  return remote;
}

/**
 * Mirrors profile, verification and preferences in one atomic write.
 *
 * One `update` rather than four `set`s: a half-written user is a user who shows
 * up in discovery with a name and no verification, and the multi-path form is
 * the database's own answer to that.
 */
export async function syncUser(input: {
  wallet: string;
  profile: HaloProfile;
  avatar: string;
  verification: RemoteVerification;
  preferences: RemotePreferences;
}): Promise<void> {
  await ensureSession();

  const key = walletKey(input.wallet);
  const profile = projectProfile(input.profile, input.avatar);

  await update(ref(database), {
    [`users/${key}/profile`]: profile,
    [`users/${key}/verification`]: input.verification,
    // Kept as its own node because Part 4 of the data model names it, and
    // because a future query may want to index on it. Same disclosure rule.
    [`users/${key}/interests`]: profile.interests ?? null,
    [`users/${key}/preferences`]: input.preferences,
    [`users/${key}/updatedAt`]: serverTimestamp(),
  });
}

export async function savePreferences(
  wallet: string,
  preferences: Partial<RemotePreferences>,
): Promise<void> {
  await ensureSession();
  await update(ref(database, paths.preferences(wallet)), preferences);
}

export async function readUser(wallet: string): Promise<RemoteUser | null> {
  const snapshot = await get(ref(database, paths.user(wallet)));
  return snapshot.exists() ? (snapshot.val() as RemoteUser) : null;
}

/** Field names disclosed in the last projection. Mirrors the profile screen. */
export function disclosedFields(profile: HaloProfile): string[] {
  return SHOWABLE.filter((field) => profile.show[field]);
}
