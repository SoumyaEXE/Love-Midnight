import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The progressive blur under the status bar.
 *
 * Content scrolling up behind the clock, signal and battery is the single
 * clearest tell that an app was not finished. Every polished app puts something
 * there; the good ones put a blur that *ramps* rather than a hard band, because
 * a hard edge just moves the problem down 40 pixels.
 *
 * React Native has no gradient blur: `BlurView` takes one uniform intensity and
 * there is no mask channel to feed it. On iOS a ramp can be faked by stacking
 * layers of decreasing height, because real blur compounds where they overlap
 * and the transitions dissolve into one another.
 *
 * That trick is actively harmful on Android. Without a `blurTarget` (see the
 * note in LiquidGlass) `BlurView` degrades to rendering a plain semi-transparent
 * rectangle, so the stacked layers stop being a blur ramp and become flat
 * rectangles with hard bottom edges - visible bands across the top of every
 * screen.
 *
 * So the platforms are handled honestly rather than uniformly: iOS stacks real
 * blur, Android gets a single many-stop gradient and no BlurView at all. The
 * gradient carries most of the work on both, because blur preserves the
 * brightness of what is behind it - a white avatar scrolling under the clock
 * stays bright and keeps the glyphs unreadable until something darkens it.
 */

export type ScrollScrimProps = {
  /** Extra height below the safe-area inset that the ramp spreads across. */
  falloff?: number;
  /** Per-layer blur. iOS only. */
  intensity?: number;
  /** Strength of the darkening tint, 0-1. */
  tint?: number;
  style?: StyleProp<ViewStyle>;
};

/** iOS only. Each layer's share of the total height, anchored top. */
const BLUR_LAYERS = [1, 0.74, 0.5, 0.28];

/**
 * Eight stops rather than four.
 *
 * A four-stop ramp bands visibly on a near-black ground - the eye is unusually
 * sensitive to gradient discontinuity at low luminance. The curve is eased so
 * the dense part sits behind the glyphs and the tail vanishes before it reaches
 * content.
 */
const STOPS = [1, 0.97, 0.9, 0.78, 0.6, 0.38, 0.16, 0];
const LOCATIONS = [0, 0.16, 0.31, 0.45, 0.58, 0.71, 0.86, 1] as unknown as readonly [
  number,
  number,
  ...number[],
];

export function ScrollScrim({
  falloff = 34,
  intensity = 20,
  tint = 0.94,
  style,
}: ScrollScrimProps) {
  const insets = useSafeAreaInsets();
  const height = insets.top + falloff;

  const colors = STOPS.map(
    (stop) => `rgba(7,6,10,${(stop * tint).toFixed(3)})`,
  ) as unknown as readonly [string, string, ...string[]];

  return (
    <View style={[styles.root, { height }, style]} pointerEvents="none">
      {Platform.OS === 'ios'
        ? BLUR_LAYERS.map((fraction) => (
            <BlurView
              key={fraction}
              intensity={intensity}
              tint="dark"
              style={[styles.layer, { height: height * fraction }]}
              pointerEvents="none"
            />
          ))
        : null}

      {/* Luminance ramp. Dense enough at the very top that status-bar glyphs
          always clear their contrast requirement, gone by the bottom. */}
      <LinearGradient colors={colors} locations={LOCATIONS} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Above screen content, below the tab bar (50) and any modal.
    zIndex: 20,
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
