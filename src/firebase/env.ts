/**
 * Firebase configuration, resolved from environment values.
 *
 * Deliberately separate from `config.ts`, and deliberately importing nothing.
 *
 * The check used to live inside `config.ts`, next to `initializeApp` and
 * `getDatabase`. That made it unreachable: importing the module to test the
 * guard also constructed the SDK and pulled in React Native, so the only thing
 * that could be verified about it was that the string appeared in the bundle -
 * which is not the same as knowing it fires, and I had briefly mistaken one for
 * the other. A guard nobody can execute is a guard nobody has tested.
 *
 * Pulled out here it is an ordinary function over an ordinary object, so
 * `scripts/check-firebase-config.mjs` can call it with a missing field and
 * assert on what comes back.
 *
 * `config.ts` still reads `process.env.EXPO_PUBLIC_*` as literal member
 * expressions at its call site, because Metro inlines those by static
 * substitution and would not recognise a dynamic lookup.
 */

export type FirebaseConfigKey =
  | 'apiKey'
  | 'authDomain'
  | 'databaseURL'
  | 'projectId'
  | 'storageBucket'
  | 'messagingSenderId'
  | 'appId'
  | 'measurementId';

export type FirebaseEnv = Partial<Record<FirebaseConfigKey, string | undefined>>;

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
};

/** Spelled out rather than derived, so the names are greppable. */
export const ENV_NAME: Record<FirebaseConfigKey, string> = {
  apiKey: 'EXPO_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
  projectId: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'EXPO_PUBLIC_FIREBASE_APP_ID',
  measurementId: 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
};

/**
 * The five the SDK cannot be constructed without.
 *
 * `storageBucket` is omitted because nothing here uses Storage, and
 * `measurementId` because Analytics has been optional since JS SDK v7.20 and
 * does not run on a handset at all.
 */
export const REQUIRED: readonly FirebaseConfigKey[] = [
  'apiKey',
  'authDomain',
  'databaseURL',
  'projectId',
  'appId',
];

/**
 * Which required variables are absent, by environment-variable name.
 *
 * An empty string counts as absent. A `.env` line left as `FOO=` is the most
 * common way to arrive here, and treating it as "set, to nothing" would hand
 * the SDK an empty apiKey and turn a clear failure into an opaque one.
 */
export function missingFirebaseKeys(values: FirebaseEnv): string[] {
  return REQUIRED.filter((key) => !values[key]?.trim()).map((key) => ENV_NAME[key]);
}

/** The message shown when configuration is incomplete. */
export function missingConfigMessage(missing: string[]): string {
  return (
    `Firebase is not configured. Missing ${missing.join(', ')}. ` +
    'Copy .env.example to .env and fill it in, then restart Metro with --clear ' +
    '(env values are inlined at build time, so a running bundler will not pick them up).'
  );
}

/**
 * Builds the config, or throws naming every variable that is missing.
 *
 * All of them at once, not the first one: fixing a `.env` one restart at a time
 * because the error only ever names one field is a miserable way to spend ten
 * minutes.
 */
export function resolveFirebaseConfig(values: FirebaseEnv): FirebaseConfig {
  const missing = missingFirebaseKeys(values);
  if (missing.length > 0) throw new Error(missingConfigMessage(missing));

  const optional = (key: FirebaseConfigKey) => {
    const value = values[key]?.trim();
    // Absent rather than undefined when unset: the SDK checks for the property.
    return value ? { [key]: value } : {};
  };

  return {
    apiKey: values.apiKey!.trim(),
    authDomain: values.authDomain!.trim(),
    databaseURL: values.databaseURL!.trim(),
    projectId: values.projectId!.trim(),
    appId: values.appId!.trim(),
    ...optional('storageBucket'),
    ...optional('messagingSenderId'),
    ...optional('measurementId'),
  };
}
