/**
 * Polyfills required before anything touches @solana/web3.js.
 *
 * Hermes ships neither `crypto.getRandomValues` nor a global `Buffer`, and
 * web3.js reaches for both during module evaluation - not lazily at call time.
 * So this file must be the first import in the entry layout; importing it later
 * means the failure surfaces as an opaque "Buffer is not defined" from inside
 * a minified dependency.
 */

import 'react-native-get-random-values';
import { Buffer } from 'buffer';

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof import('buffer').Buffer;
}

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

export {};
