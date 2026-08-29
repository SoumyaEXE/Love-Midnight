import React from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * The mark at the centre of the map, standing in for the viewer.
 *
 * The reference puts two interlocking hearts here in a pink-to-violet ramp -
 * the one place in the whole design where a second hue is allowed, because it
 * is the brand mark rather than an interface element. The previous placeholder
 * was a flat white disc, which read as a blown-out highlight sitting in the
 * middle of the rings rather than as a logo.
 *
 * Drawn as two overlapping heart outlines offset horizontally, sharing a single
 * gradient so the ramp runs continuously across both rather than restarting on
 * each. Stroked rather than filled: at 26px a filled pair loses its interlock
 * and turns into a blob.
 */

export function CoreMark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Defs>
        <LinearGradient id="haloMark" x1="0" y1="0" x2="32" y2="32">
          <Stop offset="0" stopColor="#FF8AD8" />
          <Stop offset="0.5" stopColor="#C963F5" />
          <Stop offset="1" stopColor="#7C4DFF" />
        </LinearGradient>
      </Defs>

      {/* Left heart. The cusp sits at x=11 so the two overlap across the
          middle third of the viewBox. */}
      <Path
        d="M11 24.5C11 24.5 3.5 19.8 3.5 14.2C3.5 11.4 5.6 9.3 8.2 9.3C9.6 9.3 10.5 9.9 11 10.6C11.5 9.9 12.4 9.3 13.8 9.3C16.4 9.3 18.5 11.4 18.5 14.2C18.5 19.8 11 24.5 11 24.5Z"
        stroke="url(#haloMark)"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right heart, same geometry translated. */}
      <Path
        d="M21 24.5C21 24.5 13.5 19.8 13.5 14.2C13.5 11.4 15.6 9.3 18.2 9.3C19.6 9.3 20.5 9.9 21 10.6C21.5 9.9 22.4 9.3 23.8 9.3C26.4 9.3 28.5 11.4 28.5 14.2C28.5 19.8 21 24.5 21 24.5Z"
        stroke="url(#haloMark)"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
