import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '@/theme/tokens';

/**
 * The Halo mark.
 *
 * A robot plate on a violet disc, ringed and lit from above. It replaces a
 * plain white circle, which read as a placeholder nobody had got round to -
 * and it is the same Robohash artwork the avatars use, so the brand mark and
 * the people on the map are visibly from the same world.
 *
 * The seed is fixed. Robohash is deterministic, so this URL is one specific
 * robot rather than a random one per launch, and changing the seed changes the
 * logo - treat it as the asset name it effectively is.
 */

const SEED = 'halo-midnight';

/**
 * One plate resolution for every rendered size.
 *
 * This used to scale with the display size, which quietly made the mark a
 * *different URL* at every size it was drawn at - so a 44px header mark and a
 * 92px hero mark were two separate downloads and two separate cache entries,
 * and changing size mid-screen dropped back to an empty disc for as long as the
 * new one took to arrive. One URL means one fetch, cached for the app's life.
 * 384px covers every size the app draws at 3x.
 */
const PLATE_PX = 384;

export function haloMarkUrl(size: number = PLATE_PX): string {
  // set1 is the robot set. `bgset` is deliberately omitted: the plate arrives
  // with a transparent background and sits on the violet disc below it, which
  // is what makes it look placed rather than pasted.
  return `https://robohash.org/${SEED}.png?set=set1&size=${size}x${size}`;
}

export function HaloMark({
  size = 96,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const inset = Math.round(size * 0.12);
  /**
   * Robohash is a third-party CDN, so the plate can simply not arrive - on a
   * cold launch offline, or behind a captive portal. Falling back to the bare
   * disc would put the app back to the featureless circle this mark replaced,
   * so a drawn halo stands in. It needs no network and is on-brand enough that
   * most people will never notice which one they got.
   */
  const [failed, setFailed] = useState(false);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          shadowRadius: size * 0.3,
        },
        styles.root,
        style,
      ]}
    >
      <LinearGradient
        colors={['#C548F5', '#7C22CE', '#3A1163']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />

      {/* Top-lit lip, the same one every raised surface in the app carries. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
        style={[styles.lip, { borderRadius: size / 2, height: size * 0.45 }]}
        pointerEvents="none"
      />

      {failed ? (
        <View
          style={{
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: size * 0.25,
            borderWidth: Math.max(1.5, size * 0.055),
            borderColor: 'rgba(255,255,255,0.92)',
          }}
        />
      ) : (
        <Image
          source={{ uri: haloMarkUrl() }}
          style={{ width: size - inset * 2, height: size - inset * 2 }}
          contentFit="contain"
          transition={260}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
          accessibilityLabel="Halo"
        />
      )}

      <View style={[styles.ring, { borderRadius: size / 2 }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: palette.bloom,
    shadowOpacity: 0.75,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  lip: { position: 'absolute', top: 0, left: 0, right: 0 },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(240,214,255,0.5)',
  },
});
