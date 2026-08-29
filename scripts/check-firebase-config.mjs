/**
 * Exercises the Firebase configuration guard.
 *
 * Run with `npm run check:firebase`. It compiles the real modules with esbuild,
 * so this tests the code the app ships rather than a copy that can drift.
 *
 * Three layers, because each one covers a gap the layer below it cannot:
 *
 *   1. the logic      `firebase/env.ts` in isolation - what counts as missing,
 *                     what the message says, which fields are optional.
 *
 *   2. the wiring     `firebase/config.ts` *evaluated*, with the environment
 *                     substituted the way Metro substitutes it. This is the
 *                     part that was missing: the guard runs at module load, and
 *                     for a while the only evidence it fired was that its
 *                     message appeared in the bundle - which shows the string
 *                     shipped, not that the check runs, because `expo export`
 *                     compiles modules without executing them. esbuild's
 *                     `define` inlines `process.env.EXPO_PUBLIC_*` exactly as
 *                     Metro does, so importing the result reproduces app
 *                     startup: either the config reaches `initializeApp`, or
 *                     the import throws. Both are asserted.
 *
 *   3. your .env      whether the file on this machine would actually boot the
 *                     app. Layers 1 and 2 prove the mechanism; this one answers
 *                     the question anyone running the app actually has.
 */

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'halo-firebase-'));

const COMPLETE = {
  apiKey: 'AIza-test',
  authDomain: 'example.firebaseapp.com',
  databaseURL: 'https://example-default-rtdb.firebaseio.com',
  projectId: 'example',
  storageBucket: 'example.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef',
  measurementId: 'G-TESTING',
};

/** Config key -> the environment variable `config.ts` is expected to read. */
const ENV_NAME = {
  apiKey: 'EXPO_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
  projectId: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'EXPO_PUBLIC_FIREBASE_APP_ID',
  measurementId: 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
};

const failures = [];
const results = [];

async function check(name, run) {
  try {
    await run();
    results.push([true, name]);
  } catch (error) {
    results.push([false, name]);
    failures.push(`${name}\n      ${error.message}`);
  }
}

/** Runs `fn` and returns the thrown error, failing if it does not throw. */
function throws(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw, got none');
}

async function rejects(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection, got none');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// -----------------------------------------------------------------------------
// Layer 2 support: evaluate config.ts with a substituted environment
// -----------------------------------------------------------------------------

/**
 * Replaces the modules `config.ts` reaches for at import time.
 *
 * React Native cannot be parsed by esbuild (Flow syntax), and the Firebase SDK
 * would open a real client. Neither is under test here - what is under test is
 * whether the module's own top-level code runs the guard and hands the result
 * to `initializeApp` - so both are stubbed, and `initializeApp` records what it
 * was given so the assertion can be about the actual value that reached the SDK.
 */
const stubRuntime = {
  name: 'stub-runtime',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^(react-native|firebase\/.*)$/ }, (args) => ({
      path: args.path,
      namespace: 'stub',
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      if (args.path === 'react-native') {
        return { contents: "export const Platform = { OS: 'ios' };", loader: 'js' };
      }
      if (args.path === 'firebase/app') {
        return {
          contents: `
            export const getApps = () => [];
            export const initializeApp = (options) => {
              (globalThis.__initCalls ??= []).push(options);
              return { options };
            };
          `,
          loader: 'js',
        };
      }
      if (args.path === 'firebase/database') {
        return { contents: 'export const getDatabase = () => ({});', loader: 'js' };
      }
      return { contents: 'export default {};', loader: 'js' };
    });
  },
};

let bundleCount = 0;

/**
 * Bundles and imports `firebase/config.ts` with `env` inlined.
 *
 * A key whose value is `undefined` is compiled to the literal `undefined`,
 * which is what Metro emits for a variable that is not set. Each call gets a
 * fresh filename because ESM caches modules by URL, and a cached module would
 * not re-run its top-level code.
 */
async function importConfigWith(env) {
  const define = {};
  for (const [key, name] of Object.entries(ENV_NAME)) {
    const value = env[key];
    define[`process.env.${name}`] = value === undefined ? 'undefined' : JSON.stringify(value);
  }

  const name = `config-${(bundleCount += 1)}`;
  await build({
    entryPoints: ['src/firebase/config.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: join(out, `${name}.js`),
    logLevel: 'error',
    plugins: [stubRuntime],
    alias: { '@': './src' },
    define,
  });

  globalThis.__initCalls = [];
  const module = await import(pathToFileURL(join(out, `${name}.js`)));
  return { module, initCalls: globalThis.__initCalls };
}

// -----------------------------------------------------------------------------
// Layer 3 support: read the .env on this machine
// -----------------------------------------------------------------------------

/**
 * A deliberately small .env reader: `KEY=value`, `#` comments, optional
 * surrounding quotes. It does not implement multi-line values or interpolation,
 * because this repo's .env does not use them and a parser that quietly
 * disagrees with the bundler's would be worse than no check at all.
 */
function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 0) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

try {
  // ---------------------------------------------------------------------------
  // Layer 1 - the logic
  // ---------------------------------------------------------------------------

  await build({
    entryPoints: ['src/firebase/env.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: join(out, 'env.js'),
    logLevel: 'error',
    // No stubs, and that is the point: if this ever fails to bundle, something
    // has given `firebase/env.ts` a dependency and made the guard untestable.
    alias: { '@': './src' },
  });

  const { resolveFirebaseConfig, missingFirebaseKeys } = await import(
    pathToFileURL(join(out, 'env.js'))
  );

  await check('a complete environment resolves', () => {
    const config = resolveFirebaseConfig(COMPLETE);
    assert(config.apiKey === COMPLETE.apiKey, 'apiKey did not survive');
    assert(config.databaseURL === COMPLETE.databaseURL, 'databaseURL did not survive');
    assert(config.measurementId === 'G-TESTING', 'measurementId did not survive');
  });

  await check('a missing required value throws, naming its variable', () => {
    const error = throws(() => resolveFirebaseConfig({ ...COMPLETE, databaseURL: undefined }));
    assert(
      error.message.includes('EXPO_PUBLIC_FIREBASE_DATABASE_URL'),
      `message did not name the variable: ${error.message}`,
    );
  });

  await check('an empty string counts as missing', () => {
    // The `FOO=` line in a .env, which is how most people arrive here.
    const error = throws(() => resolveFirebaseConfig({ ...COMPLETE, apiKey: '' }));
    assert(
      error.message.includes('EXPO_PUBLIC_FIREBASE_API_KEY'),
      `message did not name the variable: ${error.message}`,
    );
  });

  await check('whitespace counts as missing', () => {
    const error = throws(() => resolveFirebaseConfig({ ...COMPLETE, projectId: '   ' }));
    assert(
      error.message.includes('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
      `message did not name the variable: ${error.message}`,
    );
  });

  await check('every missing variable is named at once', () => {
    const error = throws(() =>
      resolveFirebaseConfig({ apiKey: COMPLETE.apiKey, appId: COMPLETE.appId }),
    );
    for (const name of [
      'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    ]) {
      assert(error.message.includes(name), `message omitted ${name}: ${error.message}`);
    }
  });

  await check('the message says how to fix it', () => {
    const error = throws(() => resolveFirebaseConfig({}));
    assert(error.message.includes('.env.example'), 'message does not point at .env.example');
    assert(error.message.includes('--clear'), 'message does not mention the stale-bundle trap');
  });

  await check('an empty environment reports exactly the five required names', () => {
    const missing = missingFirebaseKeys({});
    assert(missing.length === 5, `expected 5 missing, got ${missing.length}: ${missing}`);
  });

  await check('optional values are omitted, not set to undefined', () => {
    const config = resolveFirebaseConfig({
      ...COMPLETE,
      storageBucket: undefined,
      measurementId: '',
    });
    // `'key' in obj` rather than a truthiness test: the SDK checks for the
    // property, and `{ measurementId: undefined }` would satisfy a naive check
    // while still being wrong.
    assert(!('storageBucket' in config), 'storageBucket present despite being unset');
    assert(!('measurementId' in config), 'measurementId present despite being empty');
    assert('messagingSenderId' in config, 'messagingSenderId dropped despite being set');
  });

  await check('optional values missing does not throw', () => {
    const config = resolveFirebaseConfig({
      apiKey: COMPLETE.apiKey,
      authDomain: COMPLETE.authDomain,
      databaseURL: COMPLETE.databaseURL,
      projectId: COMPLETE.projectId,
      appId: COMPLETE.appId,
    });
    assert(config.projectId === 'example', 'projectId did not survive');
  });

  // ---------------------------------------------------------------------------
  // Layer 2 - the wiring, evaluated the way the device evaluates it
  // ---------------------------------------------------------------------------

  await check('[startup] a complete environment reaches initializeApp', async () => {
    const { module, initCalls } = await importConfigWith(COMPLETE);
    assert(initCalls.length === 1, `initializeApp called ${initCalls.length} times, expected 1`);
    assert(
      initCalls[0].databaseURL === COMPLETE.databaseURL,
      `initializeApp got databaseURL ${initCalls[0].databaseURL}`,
    );
    assert(initCalls[0].apiKey === COMPLETE.apiKey, 'initializeApp got the wrong apiKey');
    assert(module.database !== undefined, 'database was not exported');
  });

  await check('[startup] every variable is wired to the right name', async () => {
    // Each value is its own key's name, so a config field wired to the wrong
    // environment variable shows up as a mismatch rather than as a pass.
    const probe = Object.fromEntries(
      Object.entries(ENV_NAME).map(([key, name]) => [key, `value-of-${name}`]),
    );
    const { initCalls } = await importConfigWith(probe);
    for (const [key, name] of Object.entries(ENV_NAME)) {
      assert(
        initCalls[0][key] === `value-of-${name}`,
        `config.${key} was populated from ${initCalls[0][key]}, expected ${name}`,
      );
    }
  });

  await check('[startup] a missing variable throws before initializeApp', async () => {
    const error = await rejects(
      importConfigWith({ ...COMPLETE, databaseURL: undefined }),
    );
    assert(
      error.message.includes('EXPO_PUBLIC_FIREBASE_DATABASE_URL'),
      `startup error did not name the variable: ${error.message}`,
    );
    assert(
      (globalThis.__initCalls ?? []).length === 0,
      'initializeApp ran despite the configuration being incomplete',
    );
  });

  await check('[startup] an empty environment throws', async () => {
    const error = await rejects(importConfigWith({}));
    assert(
      error.message.includes('Firebase is not configured'),
      `unexpected startup error: ${error.message}`,
    );
  });

  // ---------------------------------------------------------------------------
  // Layer 3 - the .env on this machine
  // ---------------------------------------------------------------------------

  await check('[.env] this machine is configured to boot', () => {
    if (!existsSync('.env')) {
      // Legitimate on CI and on a fresh clone. Not a failure - but say so,
      // because "no .env" and "a good .env" must not look the same.
      console.log('        note: no .env present — skipped (copy .env.example to .env)');
      return;
    }

    const file = readEnvFile('.env');
    const values = Object.fromEntries(
      Object.entries(ENV_NAME).map(([key, name]) => [key, file[name]]),
    );

    const missing = missingFirebaseKeys(values);
    assert(missing.length === 0, `.env is missing ${missing.join(', ')}`);

    const url = values.databaseURL;
    assert(
      /^https:\/\/[^/]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(url),
      `EXPO_PUBLIC_FIREBASE_DATABASE_URL does not look like a Realtime Database URL: ${url}`,
    );
    // Catches the commonest paste error: the Firestore/console project URL, or
    // an app URL, in the slot that wants the database instance.
    assert(
      url.includes('-default-rtdb.') || url.includes('-rtdb.'),
      `EXPO_PUBLIC_FIREBASE_DATABASE_URL is missing the "-rtdb" instance segment: ${url}`,
    );
  });

  console.log('');
  for (const [ok, name] of results) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  console.log('');

  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} of ${results.length} checks failed.\n`);
    for (const failure of failures) console.error(`  - ${failure}\n`);
    process.exit(1);
  }

  console.log(
    `OK: ${results.length} checks — the guard fires at module load, every variable is ` +
      'wired to the right name, and this machine can boot.',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
