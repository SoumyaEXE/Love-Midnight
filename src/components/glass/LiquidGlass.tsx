import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Blur, Canvas, RoundedRect, SweepGradient, rect, rrect, vec } from '@shopify/react-native-skia';
import { interpolate, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { alpha, radius as radii } from '@/theme/tokens';

/**
 * A React Native port of the technique in rdev/liquid-glass-react.
 *
 * The web original refracts its backdrop with an SVG feDisplacementMap fed by a
 * generated displacement texture. React Native has no equivalent: a native blur
 * view cannot hand its sampled backdrop to Skia, and Skia cannot sample pixels
 * outside its own canvas. So the refraction is reconstructed rather than
 * computed, from the four layers that actually carry the read:
 *
 *   1. expo-blur      - the genuine backdrop blur, natively sampled.
 *   2. tint           - a top-lit white wash; light enters from above.
 *   3. specular rim   - a Skia sweep-gradient stroke, blurred. This layer does
 *                       the real work. A lens edge is bright where light enters
 *                       and carries a dimmer bounce on the opposite side, which
 *                       a sweep gradient reproduces and a plain border cannot.
 *   4. edge highlight - a 1px top-edge gradient for the crisp glass lip.
 *
 * `tilt` stands in for the original's pointer elasticity: rotating the sweep's
 * start angle slides the specular around the rim, so a pressed or dragged
 * surface reads as a physical piece of glass catching the light.
 */

export type LiquidGlassProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius. Drives both the clip and the Skia rim geometry. */
  radius?: number;
  /** Backdrop blur strength, 0-100. */
  intensity?: number;
  /**
   * Opacity of the dark substrate painted under the blur, 0-1.
   *
   * This, not `intensity`, is what makes text on glass legible. Blur alone only
   * smears whatever is behind the panel - a bright avatar or a lit radar ring
   * stays bright once blurred, and light body copy sitting on it disappears.
   * The substrate is what guarantees a floor of contrast.
   */
  opacity?: number;
  /** Extra white wash on top of the blur. Raise it over busy backdrops. */
  tint?: number;
  /** Rim brightness. 0 disables the Skia layer entirely. */
  specular?: number;
  /** Violet bleed into the rim, matching the app's single light source. */
  chroma?: number;
  /** Rotates the specular around the rim. Radians. */
  tilt?: SharedValue<number>;
  /** Renders the rim under the children instead of over them. */
  rimBehindContent?: boolean;
};

const RIM_STOPS = [0, 0.09, 0.14, 0.3, 0.52, 0.7, 0.87, 1];

function GlassRim({
  width,
  height,
  radius,
  specular,
  chroma,
  tilt,
}: {
  width: number;
  height: number;
  radius: number;
  specular: number;
  chroma: number;
  tilt?: SharedValue<number>;
}) {
  // A Skia stroke is centred on its path, so half of it falls outside the
  // shape. Insetting by half the width keeps the whole rim inside the clip.
  const strokeWidth = 1.6;
  const inset = strokeWidth / 2;

  const clip = useMemo(
    () =>
      rrect(
        rect(inset, inset, Math.max(width - strokeWidth, 0), Math.max(height - strokeWidth, 0)),
        radius,
        radius,
      ),
    [width, height, radius, inset, strokeWidth],
  );

  const centre = useMemo(() => vec(width / 2, height / 2), [width, height]);

  // Bright at the top-left entry point, a dim bounce at the bottom-right, and
  // near-dark along the two perpendicular edges - the signature of a curved
  // dielectric edge lit by a single source.
  const colors = useMemo(() => {
    const hot = `rgba(255,255,255,${Math.min(specular, 1).toFixed(3)})`;
    const warm = `rgba(216,180,254,${Math.min(specular * chroma, 1).toFixed(3)})`;
    const bounce = `rgba(255,255,255,${Math.min(specular * 0.42, 1).toFixed(3)})`;
    const dark = 'rgba(255,255,255,0.02)';
    return [dark, hot, warm, dark, bounce, dark, hot, dark];
  }, [specular, chroma]);

  // The soft pass is the same ramp at a fifth of the energy, spread wide.
  const haloColors = useMemo(() => {
    const soft = (s: number, c = '255,255,255') => `rgba(${c},${(s * 0.22).toFixed(3)})`;
    return [
      'rgba(255,255,255,0)',
      soft(specular),
      soft(specular * chroma, '216,180,254'),
      'rgba(255,255,255,0)',
      soft(specular * 0.42),
      'rgba(255,255,255,0)',
      soft(specular),
      'rgba(255,255,255,0)',
    ];
  }, [specular, chroma]);

  const rotation = useDerivedValue(() => [{ rotate: tilt ? tilt.value : 0 }], [tilt]);

  return (
    <Canvas style={StyleSheet.flatten([StyleSheet.absoluteFill, { width, height, pointerEvents: 'none' as any }])} pointerEvents="none">
      {/* Wide, soft pass first: the glass body picking up light behind the rim. */}
      <RoundedRect rect={clip} style="stroke" strokeWidth={strokeWidth * 4}>
        <SweepGradient
          c={centre}
          colors={haloColors}
          positions={RIM_STOPS}
          transform={rotation}
        />
        <Blur blur={6} />
      </RoundedRect>

      {/* The rim proper. */}
      <RoundedRect rect={clip} style="stroke" strokeWidth={strokeWidth}>
        <SweepGradient c={centre} colors={colors} positions={RIM_STOPS} transform={rotation} />
        {/* Softens the stroke into a falloff rather than a hard line. */}
        <Blur blur={0.9} />
      </RoundedRect>
    </Canvas>
  );
}

export function LiquidGlass({
  children,
  style,
  radius = radii.card,
  intensity = 64,
  opacity = 0.78,
  tint = 0.06,
  specular = 0.55,
  chroma = 0.75,
  tilt,
  rimBehindContent = false,
}: LiquidGlassProps) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  const rim =
    specular > 0 && size.width > 1 && size.height > 1 ? (
      <GlassRim
        width={size.width}
        height={size.height}
        radius={radius}
        specular={specular}
        chroma={chroma}
        tilt={tilt}
      />
    ) : null;

  return (
    <View
      style={[
        styles.root,
        { borderRadius: radius, backgroundColor: `rgba(16,13,22,${opacity})` },
        style,
      ]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) =>
          Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
            ? prev
            : { width, height },
        );
      }}
    >
      {/*
        Android is left on the default blur method deliberately.

        `dimezisBlurView` needs a `blurTarget` ref pointing at a
        `BlurTargetView` whose canvas it samples. Every glass surface here is a
        descendant of the app root, so any root-level target would contain the
        very BlurViews sampling it - drawing the target requires drawing them,
        which requires the target. That recursion crashed the app on launch.
        Without a target the method silently degrades to 'none', so requesting
        it buys nothing but a warning.

        The fallback is a translucent panel, which is why `opacity` carries the
        contrast here rather than the blur. iOS is unaffected: UIVisualEffectView
        samples the compositor's output and needs no target.
      */}
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top-lit wash. The second stop is near-zero so the bottom of the panel
          stays transparent and the backdrop reads through. */}
      <LinearGradient
        colors={[`rgba(255,255,255,${tint})`, `rgba(255,255,255,${tint * 0.25})`]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {rimBehindContent ? rim : null}
      {children}
      {rimBehindContent ? null : rim}

      {/* The crisp lip along the top edge. Sits above the rim so it stays sharp
          where the blurred sweep would otherwise wash it out. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
        style={[styles.lip, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
        pointerEvents="none"
      />
    </View>
  );
}

/**
 * The same material at panel scale - lower specular, heavier blur. Used for
 * sheets and the tab bar, where a hot rim would compete with content.
 */
export function GlassPanel(props: LiquidGlassProps) {
  return (
    <LiquidGlass intensity={80} opacity={0.86} tint={0.05} specular={0.38} chroma={0.9} {...props} />
  );
}

/** Drives `tilt` from a 0-1 press progress value. */
export function usePressTilt(progress: SharedValue<number>, sweep = 0.9) {
  return useDerivedValue(() => interpolate(progress.value, [0, 1], [0, sweep]), [progress]);
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    // backgroundColor is supplied per-instance from `opacity`.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  lip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.2,
  },
});
