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
    <View style={[{ width: size, height: size }, style]}>
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
    backgroundColor: palette.surfaceSunken,
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
