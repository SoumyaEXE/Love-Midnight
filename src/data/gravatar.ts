import * as Crypto from 'expo-crypto';

/**
 * Gravatar URLs for the demo roster.
 *
 * Gravatar's modern endpoint keys on a SHA-256 of the lowercased, trimmed
 * email, which `expo-crypto` can produce natively - no MD5 shim needed. The
 * digest is async, so it is memoised per email and every caller shares one
 * in-flight promise.
 *
 * Note on the fallback: none of the demo emails are registered, so every avatar
 * resolves to whatever `d` names. `robohash` and `identicon` are deterministic
 * and unique per persona, which is what a demo roster needs. Point `d` at a
 * hosted portrait set if the pitch deck needs faces.
 */

export type GravatarDefault =
  | 'robohash'
  | 'identicon'
  | 'monsterid'
  | 'wavatar'
  | 'retro'
  | 'mp'
  | 'blank'
  | '404';

export type GravatarOptions = {
  size?: number;
  /** Fallback style, or an absolute https URL to a custom image. */
  fallback?: GravatarDefault | string;
  /** `force` always uses the fallback, ignoring any registered avatar. */
  forceDefault?: boolean;
  rating?: 'g' | 'pg' | 'r' | 'x';
};

const BASE = 'https://gravatar.com/avatar';
const cache = new Map<string, Promise<string>>();

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): Promise<string> {
  const key = normalise(email);
  let hit = cache.get(key);
  if (!hit) {
    hit = Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
    cache.set(key, hit);
  }
  return hit;
}

export async function gravatarUrl(email: string, options: GravatarOptions = {}): Promise<string> {
  const { size = 256, fallback = 'robohash', forceDefault = false, rating = 'pg' } = options;
  const hash = await hashEmail(email);

  const params = new URLSearchParams({
    s: String(Math.round(size)),
    d: fallback,
    r: rating,
  });
  if (forceDefault) params.set('f', 'y');

  return `${BASE}/${hash}?${params.toString()}`;
}

/**
 * Synchronous best-effort lookup. Returns a URL only if the digest for this
 * email has already resolved, which lets list rows paint instantly on
 * re-render instead of flashing a skeleton every time.
 */
const resolved = new Map<string, string>();

export function gravatarUrlSync(email: string, options: GravatarOptions = {}): string | null {
  const hash = resolved.get(normalise(email));
  if (!hash) return null;
  const { size = 256, fallback = 'robohash', rating = 'pg' } = options;
  return `${BASE}/${hash}?s=${Math.round(size)}&d=${fallback}&r=${rating}`;
}

/** Warms the digest cache. Call once at app start with the whole roster. */
export async function primeGravatars(emails: string[]): Promise<void> {
  await Promise.all(
    emails.map(async (email) => {
      const hash = await hashEmail(email);
      resolved.set(normalise(email), hash);
    }),
  );
}
