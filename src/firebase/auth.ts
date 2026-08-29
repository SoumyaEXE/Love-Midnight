import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FirebaseAuth from 'firebase/auth';
import {
  browserLocalPersistence,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type Persistence,
  type User,
} from 'firebase/auth';
import { firebaseApp } from './config';

/**
 * Session identity for the database rules.
 *
 * The application's identity is the wallet address - that is what keys every
 * record, and that is what the UI shows. But database rules cannot verify a
 * wallet address on their own: anything the client puts in a write is, to the
 * rules, a claim. `auth.uid` is the one value the client cannot forge, so the
 * rules are written against it and the wallet is *bound* to it once, in
 * `users/{wallet}/owner`, by a rule that permits the field to be created and
 * never rewritten. After that binding exists, only the session holding that uid
 * can write anything under that wallet - profile, location, presence,
 * or a message carrying it as `senderId`.
 *
 * Anonymous auth is what supplies the uid. It is not a second account system:
 * there is no sign-up, no credential, and nothing in the UI. It is a per-install
 * key that the rules can check, in the same spirit as the on-device signer in
 * `chain/midnight/connector` - which is why persistence matters. An anonymous
 * user that is not persisted is regenerated on every cold start, and the second
 * launch would arrive with a new uid and find its own wallet already owned.
 */

/**
 * `getReactNativePersistence` exists in the SDK's React Native build, which
 * Metro resolves through the package's `react-native` export condition - but
 * the umbrella `firebase/auth` entry publishes only the web typings, so
 * TypeScript cannot see it. Reaching for it through the namespace keeps the
 * import honest about that, and lets the fallback below be a real branch rather
 * than a crash on a platform where it genuinely is missing.
 *
 * The fallback matters: without persistence, anonymous auth mints a *new* uid
 * on every cold start, and the second launch would find its own wallet already
 * owned by the first. That is a broken install, not a degraded one, so it is
 * reported rather than absorbed.
 */
type PersistenceFactory = (storage: unknown) => Persistence;

const reactNativePersistence = (
  FirebaseAuth as unknown as { getReactNativePersistence?: PersistenceFactory }
).getReactNativePersistence;

/** True when the session will not survive a relaunch. Surfaced by the provider. */
export let persistenceAvailable = true;

let auth: Auth | null = null;

function instance(): Auth {
  if (auth) return auth;

  let persistence: Persistence;
  if (Platform.OS === 'web') {
    persistence = browserLocalPersistence;
  } else if (reactNativePersistence) {
    persistence = reactNativePersistence(AsyncStorage);
  } else {
    persistenceAvailable = false;
    persistence = inMemoryPersistence;
  }

  try {
    auth = initializeAuth(firebaseApp, { persistence });
  } catch {
    // Already initialised - Fast Refresh, or a second caller racing this one.
    auth = getAuth(firebaseApp);
  }

  return auth;
}

/**
 * Resolves to the session uid, signing in anonymously if there is not one yet.
 *
 * Callers await this before their first write. Concurrent callers share one
 * in-flight sign-in rather than racing two.
 */
let pending: Promise<string> | null = null;

export function ensureSession(): Promise<string> {
  if (pending) return pending;

  pending = (async () => {
    const client = instance();
    const existing = client.currentUser;
    if (existing) return existing.uid;

    const credential = await signInAnonymously(client);
    return credential.user.uid;
  })().catch((error: unknown) => {
    // A failed sign-in must not poison every later attempt.
    pending = null;
    throw error;
  });

  return pending;
}

export function currentUid(): string | null {
  return instance().currentUser?.uid ?? null;
}

export function watchSession(handler: (user: User | null) => void): () => void {
  return onAuthStateChanged(instance(), handler);
}
