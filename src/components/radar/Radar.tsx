import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Blur,
  Canvas,
  Circle,
  Group,
  RadialGradient,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import { palette } from '@/theme/tokens';
import { Avatar } from '@/components/ui/Avatar';
import type { DistanceBucket } from '@/chain/midnight/types';

/**
 * The proximity radar.
 *
 * A conventional dating app puts people on a map, which is a confession: it can
 * only draw a pin because it holds a coordinate. Halo cannot draw a pin. The
 * circuit yields a bucket - closest, nearby, walkable, area - and nothing else,
 * so the radar is the honest visualisation of exactly what the app knows.
 *
 * The rings are drawn as four overlapping circles at slightly different centres
 * and radii rather than as concentric ones. That asymmetry is doing real work:
 * perfectly concentric rings read as a precise measurement, which would imply a
 * precision the proof does not provide. Offsetting them reads as an uncertain
 * region, which is what a bucket actually is.
 *
 * An avatar's angle is derived from a hash of its id, so a person sits in the
 * same direction every session. That stability is deliberately *not* meaningful
 * - it is a rendering seed, not a bearing. Deriving the angle from anything
 * real would leak direction, and direction plus a bucket is close to a position.
 */

export type RadarSubject = {
  id: string;
  email: string;
  bucket: DistanceBucket;
  online?: boolean;
};

export type RadarProps = {
  size: number;
  subjects: RadarSubject[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  /** Widest bucket currently being broadcast. Rings beyond it dim out. */
  maxBucket?: DistanceBucket;
  /** Off when the user has gone invisible. Stops the sweep. */
  live?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Ring geometry: radius as a fraction of half the canvas, plus its offset. */
const RINGS = [
  { r: 0.3, dx: 0.0, dy: 0.0, opacity: 0.55 },
  { r: 0.52, dx: -0.03, dy: 0.02, opacity: 0.4 },
  { r: 0.74, dx: 0.04, dy: -0.02, opacity: 0.26 },
  { r: 0.96, dx: -0.02, dy: 0.03, opacity: 0.14 },
] as const;

export function Radar({
  size,
  subjects,
  onSelect,
  selectedId,
  maxBucket = 3,
  live = true,
  style,
}: RadarProps) {
  const half = size / 2;
  const centre = useMemo(() => vec(half, half), [half]);

  // One slow rotation plus one breath. Both are continuous rather than
  // triggered, because the radar is showing an ongoing state, not an event.
  const spin = useSharedValue(0);
  const breath = useSharedValue(0);

  React.useEffect(() => {
    if (!live) {
      spin.value = withTiming(spin.value, { duration: 0 });
      breath.value = withTiming(0, { duration: 600 });
      return;
    }
    spin.value = withRepeat(withTiming(1, { duration: 48_000, easing: Easing.linear }), -1, false);
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [live, spin, breath]);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
    opacity: interpolate(breath.value, [0, 1], [0.88, 1]),
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [1, 1.06]) }],
  }));

  const positions = useMemo(
    () => subjects.map((subject) => ({ subject, ...placement(subject, size) })),
    [subjects, size],
  );

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, canvasStyle]} pointerEvents="none">
        <Canvas style={{ width: size, height: size }}>
          {RINGS.map((ring, index) => {
            const beyond = index > maxBucket;
            const c = vec(half + ring.dx * size, half + ring.dy * size);
            const r = ring.r * half;
            const opacity = ring.opacity * (beyond ? 0.35 : 1);

            return (
              <Group key={ring.r}>
                <Circle c={c} r={r}>
                  <RadialGradient
                    c={c}
                    r={r}
                    colors={[
                      `rgba(168,85,247,${(opacity * 0.85).toFixed(3)})`,
                      `rgba(124,34,206,${(opacity * 0.55).toFixed(3)})`,
                      `rgba(88,20,150,${(opacity * 0.2).toFixed(3)})`,
                    ]}
                    positions={[0, 0.65, 1]}
                  />
                </Circle>
                {/* A light blur on the outer rings dissolves their edge, so the
                    boundary between buckets stays soft. A hard edge would
                    suggest a threshold you can stand precisely on. */}
                <Blur blur={index >= 2 ? 8 : 3} />
              </Group>
            );
          })}
        </Canvas>
      </Animated.View>

      {/* Core. Sits outside the rotating group so the mark stays upright. */}
      <Animated.View style={[styles.core, { left: half - 34, top: half - 34 }, coreStyle]} pointerEvents="none">
        <View style={styles.coreDisc}>
          <View style={styles.coreMark} />
        </View>
      </Animated.View>

      {positions.map(({ subject, x, y, avatarSize }, index) => (
        <Animated.View
          key={subject.id}
          entering={FadeIn.delay(index * 70).duration(420)}
          style={[styles.subject, { left: x - avatarSize / 2, top: y - avatarSize / 2 }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${subject.id}`}
            hitSlop={8}
            onPress={() => onSelect?.(subject.id)}
            style={[
              subject.bucket > maxBucket && styles.beyondRange,
              selectedId === subject.id && styles.selected,
            ]}
          >
            <Avatar
              email={subject.email}
              size={avatarSize}
              online={subject.online}
              highlighted={selectedId === subject.id}
            />
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * Places a subject on the radar.
 *
 * Radius comes from the bucket - the only real signal available. Angle comes
 * from a hash of the id, so placement is stable across renders without
 * encoding anything. Avatars shrink with distance, which is what sells the
 * depth in the comps.
 */
function placement(subject: RadarSubject, size: number): { x: number; y: number; avatarSize: number } {
  const half = size / 2;

  // Sit between rings rather than on them, so nobody appears to be balanced on
  // a boundary.
  const radii = [0.17, 0.41, 0.63, 0.85];
  const radius = radii[subject.bucket] * half;

  const angle = (hash(subject.id) % 360) * (Math.PI / 180);
  const sizes = [58, 46, 38, 32];

  return {
    x: half + Math.cos(angle) * radius,
    y: half + Math.sin(angle) * radius * 0.92, // slight squash, matching the comps
    avatarSize: sizes[subject.bucket],
  };
}

/** FNV-1a. Small, stable, and no dependency. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const styles = StyleSheet.create({
  core: {
    position: 'absolute',
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreDisc: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.32)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    shadowColor: palette.bloom,
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  coreMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.white,
    shadowColor: palette.white,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  subject: {
    position: 'absolute',
  },
  beyondRange: {
    opacity: 0.35,
  },
  selected: {
    shadowColor: palette.bloom,
    shadowOpacity: 0.9,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
});
