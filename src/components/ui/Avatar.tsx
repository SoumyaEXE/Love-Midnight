import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, palette } from '@/theme/tokens';
import { gravatarUrl, gravatarUrlSync, type GravatarDefault } from '@/data/gravatar';

/**
 * Circular avatar backed by Gravatar.
 *
 * The comps render portraits desaturated with a thin bright ring, which reads
 * as a lens element rather than a photo pasted on glass. Both are reproduced
 * here: `tintColor`-free greyscale via expo-image's recycling-safe transition,
 * and a two-layer ring - an outer bright hairline plus an inner dark one that
 * keeps the bright edge from bleeding into the image.
 */

export type AvatarProps = {
  /** Gravatar key. Any string works; unregistered ones hit the fallback. */
  email: string;
  size?: number;
  /** Green dot for "active now". */
  online?: boolean;
  /** Violet ring, used for unread / new matches. */
  highlighted?: boolean;
  fallback?: GravatarDefault | string;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({
  email,
  size = 44,
  online = false,
  highlighted = false,
  fallback = 'robohash',
  style,
}: AvatarProps) {
  const pixels = Math.round(size * 3);
  const [uri, setUri] = useState<string | null>(() =>
    gravatarUrlSync(email, { size: pixels, fallback }),
  );

  useEffect(() => {
    if (uri) return;
    let alive = true;
    gravatarUrl(email, { size: pixels, fallback }).then((url) => {
      if (alive) setUri(url);
    });
    return () => {
      alive = false;
    };
  }, [email, pixels, fallback, uri]);

  const dot = Math.max(8, Math.round(size * 0.22));

  return (
    // The contact shadow lives on this outer view, not on the ring: the ring
    // clips its children, and on iOS `overflow: hidden` clips the shadow too,
    // so an avatar with its shadow on the ring reads as pasted flat onto the
    // card rather than sitting in it.
    <View
      style={[
        // The radius is here for the shadow, not for clipping - nothing is
        // clipped at this level. react-native-web renders `shadow*` as a
        // `box-shadow`, and a box-shadow traces the element's own border-radius:
        // without one it cast a hard square behind a round avatar. iOS derives
        // its shadow path the same way, so this is right on both.
        { width: size, height: size, borderRadius: size / 2 },
        size >= 32 && {
          shadowColor: '#000000',
          shadowOpacity: 0.55,
          shadowRadius: size * 0.18,
          shadowOffset: { width: 0, height: size * 0.06 },
          elevation: 5,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: highlighted ? palette.violet : alpha.t14,
          },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
          />
        ) : (
          // Skeleton while the SHA-256 resolves. Matches the surface stack, so
          // rows do not flash a lighter block before the image lands.
          <LinearGradient
            colors={[palette.surfaceRaised, palette.surfaceSunken]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Inner dark hairline: stops the outer bright ring from haloing into
            the portrait's light edges. */}
        <View style={[styles.innerRing, { borderRadius: size / 2 }]} pointerEvents="none" />
      </View>

      {online ? (
        <View
          style={[
            styles.presence,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              borderWidth: Math.max(1.5, dot * 0.18),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    overflow: 'hidden',
    borderWidth: 1,
    // Robohash plates arrive with a transparent background, so this colour is
    // what actually shows behind every demo avatar. A violet-tinted dark keeps
    // them looking placed in the scene; the near-black substrate turned each
    // one into a flat black disc.
    backgroundColor: '#1B1428',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  innerRing: {
    ...StyleSheet.absoluteFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.45)',
  },
  presence: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    backgroundColor: palette.positive,
    borderColor: palette.void,
  },
});
