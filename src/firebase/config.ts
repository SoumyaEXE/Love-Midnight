import { Platform } from 'react-native';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { resolveFirebaseConfig } from './env';

/**
 * The single Firebase entry point.
 *
 * Everything that touches Firebase imports the app or the database from here.
 * Initialising in a component - or worse, in several - gives you two apps with
 * two socket connections and two sets of listeners, and the second one silently
 * throws `duplicate-app` in development while working in production, which is
 * the least useful failure mode available.
 *
 * The configuration comes from the environment and from nowhere else. There is
 * no committed fallback: a build without a `.env` fails at startup with the
 * names of the variables it wanted, which is a better morning than a
 * `getDatabase` throwing "Can't determine Firebase Database URL" eleven frames
 * down, or an app that silently talks to whichever project was hardcoded last.
 * The check itself lives in `./env`, where it can be executed and tested - see
 * `scripts/check-firebase-config.mjs`.
 *
 * Every field carries the `EXPO_PUBLIC_` prefix, and that is not laziness about
 * the boundary - it is what the boundary says. These values must reach the
 * client to be of any use: the SDK sends them on every request, so they end up
 * in the bundle wherever they are written down. A Firebase web config
 * identifies a project, it does not authorise anything against it. What stops a
 * stranger holding these from touching your data is `database.rules.json` and
 * the anonymous session behind it.
 *
 * The variables are read as literal member expressions rather than through a
 * loop, because Metro inlines `process.env.EXPO_PUBLIC_*` by static
 * substitution - `process.env[name]` would compile to a lookup on an object
 * that does not exist at runtime.
 */

export const firebaseConfig = resolveFirebaseConfig({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
});

/** Idempotent: Fast Refresh re-evaluates this module without reloading the VM. */
export const firebaseApp: FirebaseApp =
  getApps()[0] ?? initializeApp(firebaseConfig);

export const database: Database = getDatabase(firebaseApp);

/**
 * Analytics, web only.
 *
 * The console snippet calls `getAnalytics(app)` unconditionally. On a handset
 * that throws - the Firebase JS SDK does not implement Analytics outside the
 * browser, and Expo's own Firebase guide says so - so it is loaded lazily,
 * behind a platform check, and behind the SDK's own support probe. A native
 * build never pulls the module into the bundle at all.
 */
export function startAnalytics(): void {
  if (Platform.OS !== 'web') return;

  void import('firebase/analytics')
    .then(async ({ getAnalytics, isSupported }) => {
      if (await isSupported()) getAnalytics(firebaseApp);
    })
    .catch(() => {
      // Analytics is decoration. It must never be able to fail a boot.
    });
}
