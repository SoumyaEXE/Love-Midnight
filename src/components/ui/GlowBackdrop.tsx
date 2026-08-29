import React from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
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

export function GlowBackdrop({
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
export function SpotGlow({
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
