import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Circle, Group, Path, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { CoreMark } from '@/components/map/CoreMark';
import { alpha, palette, radius as radii } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { buildCityPlan } from '@/components/map/cityPlan';
import { DISTANCE_LABEL, type DistanceBucket } from '@/chain/midnight/types';

/**
 * The map.
 *
 * A conventional dating app drops a pin per person, which is a confession: it
 * can only draw a pin because it is holding a coordinate. Halo holds none. The
 * proximity circuit yields a bucket - closest, nearby, walkable, area - and
 * nothing else, so there is no point to draw.
 *
 * What is drawn instead is an *area*: a soft disc whose radius is the bucket
 * the proof disclosed, with the person's avatar at its centre. The avatar marks
 * the middle of a region, not a position, and the disc is sized so that reads
 * immediately - at "area" it is most of a district wide. Zooming in never
 * sharpens it, because there is nothing sharper underneath.
 *
 * The angle each person sits at is derived from a hash of their id: stable
 * across sessions so the map does not reshuffle, and deliberately meaningless.
 * Deriving it from anything real would leak bearing, and bearing plus a bucket
 * is very close to a coordinate.
 */

export type MapSubject = {
  id: string;
  email: string;
  bucket: DistanceBucket;
  online?: boolean;
  area?: string;
};

export type PrivacyMapProps = {
  width: number;
  height: number;
  subjects: MapSubject[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Widest bucket being broadcast. Areas beyond it dim. */
  maxBucket?: DistanceBucket;
  /** Off when the user has gone invisible. Stops the pulse. */
  live?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Uncertainty radius per bucket, as a fraction of the map's short side. */
const AREA_RADIUS: Record<DistanceBucket, number> = {
  0: 0.16,
  1: 0.24,
  2: 0.33,
  3: 0.44,
};

/** How far from the viewer each bucket sits, as a fraction of the short side. */
const AREA_DISTANCE: Record<DistanceBucket, number> = {
  0: 0.13,
  1: 0.26,
  2: 0.36,
  3: 0.45,
};

const MARKER_SIZE: Record<DistanceBucket, number> = { 0: 48, 1: 42, 2: 37, 3: 33 };

export function PrivacyMap({
  width,
  height,
  subjects,
  selectedId,
  onSelect,
  maxBucket = 3,
  live = true,
  style,
}: PrivacyMapProps) {
  const plan = useMemo(() => buildCityPlan(width, height), [width, height]);
  const short = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;

  const pulse = useSharedValue(0);

  React.useEffect(() => {
    if (!live) {
      pulse.value = withTiming(0, { duration: 500 });
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [live, pulse]);

  const selfPulse = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.14]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.5, 0.16]),
  }));

  const placed = useMemo(() => {
    // Rank within each bucket so a ring's occupants spread around it instead of
    // stacking on one bearing.
    const seen = new Map<number, number>();
    const totals = new Map<number, number>();
    for (const s of subjects) totals.set(s.bucket, (totals.get(s.bucket) ?? 0) + 1);

    return subjects.map((subject) => {
      const rank = seen.get(subject.bucket) ?? 0;
      seen.set(subject.bucket, rank + 1);

      const total = totals.get(subject.bucket) ?? 1;
      const slot = (2 * Math.PI) / total;
      const phase = subject.bucket * 0.85;
      const jitter = ((hash(subject.id) % 1000) / 1000 - 0.5) * slot * 0.6;
      const angle = phase + rank * slot + jitter;

      const distance = AREA_DISTANCE[subject.bucket] * short;

      return {
        subject,
        x: cx + Math.cos(angle) * distance,
        // Squashed vertically: the map is a plan view, and a perfect circle of
        // people reads as a radar again.
        y: cy + Math.sin(angle) * distance * 0.82,
        areaRadius: AREA_RADIUS[subject.bucket] * short * 0.5,
        markerSize: MARKER_SIZE[subject.bucket],
      };
    });
  }, [subjects, short, cx, cy]);

  return (
    <View style={[{ width, height }, styles.root, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} color="#0B0813" />

        {/* Water first, then parks, then blocks, then the street network -
            the order a real cartographic stack draws in. */}
        <Path path={plan.water} style="stroke" strokeWidth={short * 0.075} color="rgba(88,42,168,0.5)" />
        <Path path={plan.parks} style="fill" color="rgba(96,54,180,0.24)" />
        <Path path={plan.blocks} style="fill" color="rgba(150,110,220,0.10)" />
        <Path
          path={plan.streets}
          style="stroke"
          strokeWidth={1}
          strokeCap="round"
          color="rgba(196,168,236,0.13)"
        />
        <Path
          path={plan.arterials}
          style="stroke"
          strokeWidth={2}
          strokeCap="round"
          color="rgba(214,190,246,0.22)"
        />

        {/* Uncertainty areas. Drawn over the plan so the map reads underneath
            them - the point is that the region is fuzzy, not that it is
            occluded. */}
        {placed.map(({ subject, x, y, areaRadius }) => {
          const beyond = subject.bucket > maxBucket;
          const c = vec(x, y);
          const strength = beyond ? 0.3 : 1;
          const selected = selectedId === subject.id;

          return (
            <Group key={`area-${subject.id}`}>
              <Circle c={c} r={areaRadius}>
                <RadialGradient
                  c={c}
                  r={areaRadius}
                  colors={[
                    `rgba(186,104,248,${(0.3 * strength * (selected ? 1.5 : 1)).toFixed(3)})`,
                    `rgba(150,58,232,${(0.16 * strength).toFixed(3)})`,
                    'rgba(124,34,206,0)',
                  ]}
                  positions={[0, 0.55, 1]}
                />
              </Circle>
              <Circle
                c={c}
                r={areaRadius}
                style="stroke"
                strokeWidth={selected ? 1.6 : 1}
                color={`rgba(216,180,254,${(selected ? 0.42 : 0.16) * strength})`}
              />
            </Group>
          );
        })}

        {/* Vignette, drawn in the map's own base colour so it never darkens the
            page behind the map - only the map's own edges. */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(cx, cy)}
            r={Math.max(width, height) * 0.72}
            colors={['rgba(11,8,19,0)', 'rgba(11,8,19,0.45)', 'rgba(11,8,19,0.92)']}
            positions={[0, 0.66, 1]}
          />
        </Rect>
      </Canvas>

      {/* District labels. RN text rather than Skia text - crisper at small
          sizes, and it inherits the Geist scale without loading a font blob. */}
      {plan.districts.map((district) => (
        <Text
          key={district.name}
          style={[
            type.micro,
            styles.district,
            { left: district.x * width, top: district.y * height },
          ]}
        >
          {district.name.toUpperCase()}
        </Text>
      ))}

      {/* The viewer. Centre of the map by construction: every distance shown is
          relative to here, and this is the only position the device knows. */}
      <Animated.View
        style={[styles.selfPulse, { left: cx - 60, top: cy - 60 }, selfPulse]}
        pointerEvents="none"
      />
      <View style={[styles.self, { left: cx - 27, top: cy - 27 }]} pointerEvents="none">
        <CoreMark size={26} />
      </View>

      {/* Markers. */}
      {placed.map(({ subject, x, y, markerSize }) => {
        const beyond = subject.bucket > maxBucket;
        return (
          <Pressable
            key={subject.id}
            accessibilityRole="button"
            accessibilityLabel={`${subject.id}, proved ${DISTANCE_LABEL[subject.bucket]}`}
            hitSlop={10}
            onPress={() => onSelect?.(subject.id)}
            style={[
              styles.marker,
              { left: x - markerSize / 2, top: y - markerSize / 2 },
              beyond && styles.markerBeyond,
            ]}
          >
            <Avatar
              email={subject.email}
              size={markerSize}
              online={subject.online}
              highlighted={selectedId === subject.id}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** FNV-1a. Small, stable, no dependency. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radii.sheet,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  district: {
    position: 'absolute',
    letterSpacing: 1.4,
    color: 'rgba(226,208,255,0.22)',
  },
  selfPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: palette.bloom,
  },
  self: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(163,74,244,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(232,206,255,0.42)',
    shadowColor: palette.bloom,
    shadowOpacity: 0.7,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  marker: { position: 'absolute' },
  markerBeyond: { opacity: 0.35 },
});
