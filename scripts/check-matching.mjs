/**
 * Sanity-checks the shipped matcher against the demo roster.
 *
 * Run with `npm run check:matching`. It compiles the real modules with esbuild
 * (stubbing expo-crypto, which the scorer does not touch) so this exercises the
 * code the app ships rather than a copy that can silently drift.
 *
 * It fails loudly if the roster collapses into a single band, which is the
 * failure mode an unnormalised score produces and which is invisible in the UI
 * until someone taps "Prove" and gets a refusal.
 */

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'halo-check-'));

/**
 * Replaces the native-only modules with empty stubs.
 *
 * `matching.ts` pulls in the prover for `compatibilityScore` and `bandOf`,
 * which drags `expo-crypto` and `expo-constants` (and through them React
 * Native, whose Flow syntax esbuild cannot parse) into the graph. None of it is
 * reached by the scoring path, so stubbing is sound - and if a future change
 * makes the scorer actually depend on one of these, this script fails loudly
 * rather than quietly testing something else.
 */
const stubNative = {
  name: 'stub-native',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^(react-native|expo-.*|@react-native.*)$/ }, (args) => ({
      path: args.path,
      namespace: 'stub',
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default {}; export const CryptoDigestAlgorithm = {};',
      loader: 'js',
    }));
  },
};

try {
  await build({
    entryPoints: ['src/ai/matching.ts', 'src/data/people.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: out,
    // Flatten: the two entry points live in different directories, so esbuild
    // would otherwise mirror src/ai and src/data under the temp dir.
    entryNames: '[name]',
    logLevel: 'error',
    plugins: [stubNative],
    // Relative rather than derived from import.meta.url: on Windows the URL
    // pathname carries a leading slash ("/C:/...") that esbuild cannot resolve.
    // esbuild resolves aliases against cwd, which is the repo root here.
    alias: { '@': './src' },
  });

  const { match, defaultMask } = await import(pathToFileURL(join(out, 'matching.js')));
  const { PEOPLE, VECTORS, SELF_VECTOR, maskFor } = await import(
    pathToFileURL(join(out, 'people.js'))
  );

  const selfMask = defaultMask();
  const rows = PEOPLE.map((person) => {
    const result = match(SELF_VECTOR, VECTORS.get(person.id), selfMask, maskFor(person));
    return { id: person.id, score: result.score, band: result.band, drivers: result.drivers };
  }).sort((a, b) => b.score - a.score);

  const spread = [0, 0, 0, 0, 0];
  for (const row of rows) spread[row.band] += 1;

  console.log('\n  person      score   band   drivers');
  console.log('  ' + '-'.repeat(64));
  for (const row of rows) {
    console.log(
      `  ${row.id.padEnd(10)} ${String(row.score).padStart(6)}   ${row.band}      ` +
        row.drivers.map((d) => d.dimension).join(', '),
    );
  }
  console.log(`\n  band spread: ${spread.join(' / ')}  (b0..b4)\n`);

  const distinct = spread.filter((n) => n > 0).length;
  if (distinct < 3) {
    console.error(
      `FAIL: roster collapsed into ${distinct} band(s). The score is not discriminating —\n` +
        'check the normalisation in compatibilityScore and the signal weights in matching.ts.',
    );
    process.exit(1);
  }
  console.log(`OK: roster spans ${distinct} bands.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
