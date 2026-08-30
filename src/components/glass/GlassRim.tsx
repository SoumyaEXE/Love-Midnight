import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Blur, Canvas, RoundedRect, SweepGradient, rect, rrect, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

/**
 * The specular rim.
 *
 * Skia on web is CanvasKit - a WASM module that must be fetched and
 * initialised before the first draw. Nothing in this app loads it, so every
 * `Canvas` threw `CanvasKit is not defined` and took the screen down. Loading
 * it would cost several megabytes to draw a decorative edge, so web
 * reconstructs the same ramp in CSS.
 *
 * The split is a runtime branch rather than a `GlassRim.web.tsx` sibling,
 * which is the idiomatic form and was tried first. It does not work here: this
 * module is imported through the `@/` alias, and Expo's tsconfig-paths
 * resolution does not carry platform extensions - so the web bundle loaded the
 * native file anyway and threw exactly as before. A `Platform.OS` check does
 * not depend on resolution at all.
 *
 * Importing Skia on web is safe; only *calling* into it is not. `rect()` and
 * `<Canvas>` both reach for CanvasKit, and neither runs below.
 *
 * A lens edge is bright where light enters and carries a dimmer bounce on the
 * opposite side, which a sweep gradient reproduces and a plain border cannot.
 */

export type GlassRimProps = {
  width: number;
  height: number;
  radius: number;
  specular: number;
  chroma: number;
  tilt?: SharedValue<number>;
};

export function GlassRim(props: GlassRimProps) {
  if (Platform.OS === 'web') return <CssGlassRim {...props} />;
  return <SkiaGlassRim {...props} />;
}

const RIM_STOPS = [0, 0.09, 0.14, 0.3, 0.52, 0.7, 0.87, 1];

function SkiaGlassRim({
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
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
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

/**
 * The rim in CSS: `conic-gradient` is a sweep gradient, and the mask-composite
 * trick strokes it into a ring that follows the border-radius.
 *
 * Same stops and colours as the Skia pass above, and the same two layers - a
 * wide blurred halo under a tight rim.
 *
 * `tilt` is accepted and ignored. On native it rotates the sweep from a
 * Reanimated shared value on the UI thread; reproducing that means driving a
 * DOM style from a worklet every frame, which is a lot of machinery for a press
 * affordance. The rim renders at its resting angle.
 */
function CssGlassRim({ width, height, radius, specular, chroma }: GlassRimProps) {
  const colors = useMemo(() => {
    const hot = `rgba(255,255,255,${Math.min(specular, 1).toFixed(3)})`;
    const warm = `rgba(216,180,254,${Math.min(specular * chroma, 1).toFixed(3)})`;
    const bounce = `rgba(255,255,255,${Math.min(specular * 0.42, 1).toFixed(3)})`;
    const dark = 'rgba(255,255,255,0.02)';
    return [dark, hot, warm, dark, bounce, dark, hot, dark];
  }, [specular, chroma]);

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

  if (width <= 1 || height <= 1) return null;

  // Skia's sweep starts at 3 o'clock, CSS conic at 12 - the -90deg puts the hot
  // stop back at the top-left entry point the ramp was designed around.
  const sweep = (list: string[]) =>
    `conic-gradient(from -90deg, ${list
      .map((color, i) => `${color} ${(RIM_STOPS[i] ?? 1).toFixed(4)}turn`)
      .join(', ')})`;

  // Two masks - one clipped to the content box, one to the whole border box -
  // composited so only the padding band survives. The standard CSS gradient
  // border, and the only form that follows a border-radius without a second
  // element.
  const ring = (background: string, band: number, blur: number): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    borderRadius: radius,
    padding: band,
    background,
    filter: blur ? `blur(${blur}px)` : undefined,
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    maskComposite: 'exclude',
    pointerEvents: 'none',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={ring(sweep(haloColors), 6.4, 6)} />
      <div style={ring(sweep(colors), 1.6, 0.9)} />
    </div>
  );
}
