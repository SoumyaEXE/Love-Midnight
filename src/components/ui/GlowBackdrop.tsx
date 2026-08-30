import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Circle, RadialGradient, Rect, vec, Blur, Group } from '@shopify/react-native-skia';
import { palette } from '@/theme/tokens';

/**
 * The single light source every screen is lit by.
 *
 * The comps are one violet bloom rising from below the device, plus a much
 * weaker secondary above. Everything else in the palette is that bloom at lower
 * energy. Rendering it in Skia rather than stacking LinearGradients matters:
 * banding is extremely visible across a 700px falloff on a near-black ground,
 * and Skia's radial gradient dithers where a layered CSS-style gradient does
 * not.
 */

export type GlowBackdropProps = {
  /** 0-1. Scales the primary bloom. The radar screen runs hotter than lists. */
  intensity?: number;
  /** Where the primary bloom sits, as a fraction of screen height. */
  origin?: number;
  /** Adds the weaker top bloom seen behind the header in the comps. */
  crown?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Skia on web is CanvasKit, a WASM module nothing here loads, so these
 * `Canvas` draws threw `CanvasKit is not defined` on first paint and took the
 * screen down.
 *
 * A runtime branch rather than a `GlowBackdrop.web.tsx` sibling: this module is
 * imported through the `@/` alias, and Expo's tsconfig-paths resolution does not
 * carry platform extensions, so the web bundle loaded the native file regardless
 * of the sibling. See `glass/GlassRim` for the same note.
 */
export function GlowBackdrop(props: GlowBackdropProps) {
  if (Platform.OS === 'web') return <CssGlowBackdrop {...props} />;
  return <SkiaGlowBackdrop {...props} />;
}

export type SpotGlowProps = {
  size: number;
  color?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
};

export function SpotGlow(props: SpotGlowProps) {
  if (Platform.OS === 'web') return <CssSpotGlow {...props} />;
  return <SkiaSpotGlow {...props} />;
}

function SkiaGlowBackdrop({
  intensity = 1,
  origin = 1.02,
  crown = true,
  style,
}: GlowBackdropProps) {
  const { width, height } = useWindowDimensions();

  // The bloom is wider than the screen so its falloff never reveals an edge.
  const primaryRadius = width * 1.15;
  const primaryCentre = vec(width / 2, height * origin);
  const crownCentre = vec(width * 0.5, -height * 0.12);
  const crownRadius = width * 0.85;

  const i = Math.max(0, Math.min(intensity, 1));

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} color={palette.void} />

        {crown ? (
          <Circle c={crownCentre} r={crownRadius}>
            <RadialGradient
              c={crownCentre}
              r={crownRadius}
              colors={[
                `rgba(176,38,255,${(0.2 * i).toFixed(3)})`,
                `rgba(124,34,206,${(0.07 * i).toFixed(3)})`,
                'rgba(7,6,10,0)',
              ]}
              positions={[0, 0.45, 1]}
            />
          </Circle>
        ) : null}

        {/* Primary bloom. Three stops: hot core, violet body, and a long tail
            that has to reach zero before it hits the top of the screen. */}
        <Group>
          <Circle c={primaryCentre} r={primaryRadius}>
            <RadialGradient
              c={primaryCentre}
              r={primaryRadius}
              colors={[
                `rgba(197,60,255,${(0.95 * i).toFixed(3)})`,
                `rgba(160,32,232,${(0.55 * i).toFixed(3)})`,
                `rgba(96,20,160,${(0.16 * i).toFixed(3)})`,
                'rgba(7,6,10,0)',
              ]}
              positions={[0, 0.28, 0.58, 1]}
            />
          </Circle>
          {/* A wide blur over the whole bloom smooths the stop boundaries into
              a continuous falloff. */}
          <Blur blur={18} />
        </Group>
      </Canvas>
    </View>
  );
}

/**
 * A localised bloom placed behind a specific element - the radar core, an
 * avatar, a selected tab. Absolutely positioned by the caller.
 */
function SkiaSpotGlow({
  size,
  color = palette.bloom,
  opacity = 0.6,
  style,
}: {
  size: number;
  color?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const centre = vec(size / 2, size / 2);
  const rgb = hexToRgb(color);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Canvas style={{ width: size, height: size }}>
        <Circle c={centre} r={size / 2}>
          <RadialGradient
            c={centre}
            r={size / 2}
            colors={[
              `rgba(${rgb},${opacity.toFixed(3)})`,
              `rgba(${rgb},${(opacity * 0.35).toFixed(3)})`,
              `rgba(${rgb},0)`,
            ]}
            positions={[0, 0.4, 1]}
          />
        </Circle>
      </Canvas>
    </View>
  );
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/**
 * The bloom in CSS.
 *
 * The native comment explains why Skia was chosen over stacked gradients:
 * banding is very visible across a 700 px falloff on a near-black ground, and
 * Skia dithers where a layered gradient does not. That reasoning is about React
 * Native's gradient primitives, not about browsers - a real `radial-gradient`
 * is dithered by the compositor. The geometry and stops are identical, so both
 * platforms are lit the same way rather than merely similarly.
 */
function CssGlowBackdrop({
  intensity = 1,
  origin = 1.02,
  crown = true,
  style,
}: GlowBackdropProps) {
  const { width } = useWindowDimensions();

  const primaryRadius = width * 1.15;
  const crownRadius = width * 0.85;
  const i = Math.max(0, Math.min(intensity, 1));

  // CSS layers the first entry on top - the reverse of Skia's draw order - so
  // the primary bloom leads and the `void` ground closes the list.
  const layers = [
    `radial-gradient(${primaryRadius}px ${primaryRadius}px at 50% ${(origin * 100).toFixed(2)}%, ` +
      `rgba(197,60,255,${(0.95 * i).toFixed(3)}) 0%, ` +
      `rgba(160,32,232,${(0.55 * i).toFixed(3)}) 28%, ` +
      `rgba(96,20,160,${(0.16 * i).toFixed(3)}) 58%, ` +
      `rgba(7,6,10,0) 100%)`,
    ...(crown
      ? [
          `radial-gradient(${crownRadius}px ${crownRadius}px at 50% -12%, ` +
            `rgba(176,38,255,${(0.2 * i).toFixed(3)}) 0%, ` +
            `rgba(124,34,206,${(0.07 * i).toFixed(3)}) 45%, ` +
            `rgba(7,6,10,0) 100%)`,
        ]
      : []),
    palette.void,
  ];

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: layers.join(', '),
          // Softens the one real discontinuity: the tail meeting the ground.
          filter: 'blur(18px)',
          // Blur samples outside the element and would otherwise reveal a
          // transparent edge where there is nothing to sample.
          transform: 'scale(1.08)',
        }}
      />
    </View>
  );
}

function CssSpotGlow({ size, color = palette.bloom, opacity = 0.6, style }: SpotGlowProps) {
  const rgb = hexToRgb(color);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background:
            `radial-gradient(circle at 50% 50%, ` +
            `rgba(${rgb},${opacity.toFixed(3)}) 0%, ` +
            `rgba(${rgb},${(opacity * 0.35).toFixed(3)}) 40%, ` +
            `rgba(${rgb},0) 100%)`,
        }}
      />
    </View>
  );
}
