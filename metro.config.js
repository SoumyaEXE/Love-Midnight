const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro configuration.
 *
 * Exists for one reason: two packages in `@solana/web3.js`'s dependency tree
 * publish `exports` maps that Metro cannot satisfy for React Native, and each
 * one prints a warning on every bundle.
 *
 *   @noble/hashes    its `exports` declares the subpath `./crypto`, but the
 *                    file behind it is `crypto.js`, and the resolution is
 *                    re-checked against the map under the extended name - which
 *                    is not a key in it.
 *
 *   rpc-websockets   its `exports` declares only `browser` and `node`
 *                    conditions. React Native is neither, and there is no
 *                    `default`, so nothing matches on `platform = android`.
 *
 * Neither is broken: Metro says so itself - "falling back to file-based
 * resolution" - and then resolves both correctly through the legacy `main` and
 * `browser` fields. The cost is noise, and noise on launch is not free: a
 * warning nobody can act on is a warning everybody learns to scroll past,
 * including the next one that matters.
 *
 * So these redirects deliberately point at *exactly* the files the fallback
 * already chose, verified by bundling with and without this file and comparing
 * the output hash - identical. This silences the warnings and changes nothing
 * else. If a future version of either package fixes its `exports`, deleting the
 * matching line here is the whole migration.
 *
 * Package exports stay enabled globally. Turning them off would silence these
 * too, and would also change how every other dependency resolves - including
 * the Firebase SDK, which relies on export conditions to hand React Native its
 * own auth build.
 */

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/** Specifier -> the file the legacy fallback resolves it to. */
const REDIRECTS = new Map([
  ['@noble/hashes/crypto', '@noble/hashes/crypto.js'],
  ['@noble/hashes/crypto.js', '@noble/hashes/crypto.js'],
  ['rpc-websockets', 'rpc-websockets/dist/index.browser.cjs'],
]);

const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const redirect = REDIRECTS.get(moduleName);
  if (redirect) {
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'node_modules', ...redirect.split('/')),
    };
  }

  // `upstream` is undefined unless another plugin has already wrapped the
  // resolver; `context.resolveRequest` is Metro's own. Deferring to whichever
  // exists keeps this composable rather than terminal.
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
