import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { alpha, metal, motion, palette, radius as radii, shadow, text as textColor } from '@/theme/tokens';
import { type } from '@/theme/typography';

/**
 * The machined-metal control from the comps.
 *
 * Six stacked layers give it the physical read. In order, bottom to top:
 *
 *   contact shadow  a dark, offset blur that separates the part from the
 *                   substrate. Without it the button reads as a painted
 *                   rectangle rather than an object resting on a surface.
 *   bevel ring      a 1px gradient frame, bright at the top and dark at the
 *                   bottom. This is the single strongest depth cue - a uniform
 *                   border immediately flattens the whole thing.
 *   face            a three-stop gradient. The midpoint sits at 0.55 rather
 *                   than 0.5 so the falloff is faster below the equator, which
 *                   is how a convex surface actually behaves.
 *   specular        a hot wash across the top third only.
 *   occlusion       a short dark gradient rising from the bottom edge, the
 *                   face shading itself away from the light.
 *   sheen           a diagonal band that sweeps across on press.
 *
 * Pressing scales down, darkens the face, tightens the contact shadow toward
 * the surface, and slides the sheen - four coupled changes, which is what makes
 * it feel pressed rather than merely animated.
 */

export type MetalButtonVariant = 'metal' | 'violet' | 'light' | 'ghost';
export type MetalButtonSize = 'sm' | 'md' | 'lg';

export type MetalButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: MetalButtonVariant;
  size?: MetalButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'leading' | 'trailing';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Adds the violet bloom beneath the part. Default on for `violet`. */
  glow?: boolean;
  haptic?: false | 'light' | 'medium' | 'success';
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
};

const SIZES: Record<MetalButtonSize, { height: number; padding: number; radius: number; gap: number }> = {
  sm: { height: 36, padding: 14, radius: radii.pill, gap: 6 },
  md: { height: 46, padding: 20, radius: radii.pill, gap: 8 },
  lg: { height: 56, padding: 26, radius: radii.pill, gap: 10 },
};

/** expo-linear-gradient requires at least two stops, expressed as a tuple. */
type Stops = readonly [string, string, ...string[]];
type Locations = readonly [number, number, ...number[]];

const FACE_LOCATIONS = metal.faceLocations as unknown as Locations;

const FACES: Record<
  MetalButtonVariant,
  { rest: Stops; pressed: Stops; label: string; ring: Stops }
> = {
  metal: {
    rest: metal.face,
    pressed: metal.facePressed,
    label: textColor.primary,
    ring: ['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.45)'],
  },
  violet: {
    rest: metal.violet,
    pressed: metal.violetPressed,
    label: textColor.onViolet,
    ring: ['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.10)', 'rgba(60,10,90,0.55)'],
  },
  light: {
    rest: metal.light,
    pressed: metal.lightPressed,
    label: textColor.onLight,
    ring: ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.35)', 'rgba(90,80,105,0.35)'],
  },
  ghost: {
    rest: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)'],
    pressed: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.04)'],
    label: textColor.primary,
    ring: ['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.25)'],
  },
};

const HAPTIC_STYLE = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
} as const;

export function MetalButton({
  label,
  onPress,
  variant = 'metal',
  size = 'md',
  icon,
  iconPosition = 'leading',
  disabled = false,
  loading = false,
  fullWidth = false,
  glow,
  haptic = 'light',
  style,
  labelStyle,
  testID,
}: MetalButtonProps) {
  const dims = SIZES[size];
  const face = FACES[variant];
  const withGlow = glow ?? variant === 'violet';
  const inert = disabled || loading;

  const press = useSharedValue(0);

  const animatedRoot = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(press.value, [0, 1], [1, motion.pressScale]) }],
    // The part settles toward the surface, so its shadow shrinks and lifts.
    shadowOpacity: interpolate(press.value, [0, 1], [withGlow ? 0.55 : 0.6, withGlow ? 0.3 : 0.28]),
    shadowRadius: interpolate(press.value, [0, 1], [withGlow ? 22 : 14, 6]),
  }));

  const animatedPressedFace = useAnimatedStyle(() => ({ opacity: press.value }));

  const animatedSheen = useAnimatedStyle(() => ({
    opacity: interpolate(press.value, [0, 0.35, 1], [0, 0.5, 0]),
    transform: [{ translateX: interpolate(press.value, [0, 1], [-dims.height * 2, dims.height * 3]) }],
  }));

  const onPressIn = useCallback(() => {
    press.value = withSpring(1, motion.press);
  }, [press]);

  const onPressOut = useCallback(() => {
    press.value = withTiming(0, { duration: 240 });
  }, [press]);

  const handlePress = useCallback(() => {
    if (inert) return;
    if (haptic === 'success') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (haptic) {
      void Haptics.impactAsync(HAPTIC_STYLE[haptic]);
    }
    onPress?.();
  }, [haptic, inert, onPress]);

  const shadowStyle = useMemo(
    () => (withGlow ? { ...shadow.glow, shadowColor: palette.bloom } : shadow.lift),
    [withGlow],
  );

  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={face.label} />
      ) : (
        <>
          {icon && iconPosition === 'leading' ? <View style={{ marginRight: dims.gap }}>{icon}</View> : null}
          <Text
            numberOfLines={1}
            style={[size === 'sm' ? type.buttonSmall : type.button, { color: face.label }, labelStyle]}
          >
            {label}
          </Text>
          {icon && iconPosition === 'trailing' ? <View style={{ marginLeft: dims.gap }}>{icon}</View> : null}
        </>
      )}
    </>
  );

  return (
    <Animated.View
      style={[
        shadowStyle,
        { borderRadius: dims.radius },
        fullWidth && styles.fullWidth,
        animatedRoot,
        inert && styles.inert,
        style,
      ]}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy: loading }}
        accessibilityLabel={label}
        disabled={inert}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={handlePress}
        style={{ borderRadius: dims.radius }}
      >
        {/* Bevel ring. The 1px padding is what reveals it around the face. */}
        <LinearGradient
          colors={face.ring}
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.ring,
            {
              borderRadius: dims.radius,
              height: dims.height,
              paddingHorizontal: 0,
            },
            fullWidth && styles.fullWidth,
          ]}
        >
          <View
            style={[
              styles.faceClip,
              {
                borderRadius: dims.radius - 1,
                paddingHorizontal: dims.padding,
              },
            ]}
          >
            <LinearGradient
              colors={face.rest}
              locations={FACE_LOCATIONS}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View style={[StyleSheet.absoluteFill, animatedPressedFace]}>
              <LinearGradient
                colors={face.pressed}
                locations={FACE_LOCATIONS}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Specular across the top third. */}
            <LinearGradient
              colors={[
                variant === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.16)',
                'rgba(255,255,255,0)',
              ]}
              style={[StyleSheet.absoluteFill, { bottom: '62%' }]}
              pointerEvents="none"
            />

            {/* Occlusion rising off the bottom edge. */}
            <LinearGradient
              colors={['rgba(0,0,0,0)', variant === 'light' ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.32)']}
              style={[StyleSheet.absoluteFill, { top: '55%' }]}
              pointerEvents="none"
            />

            {/* Sheen band, swept on press. */}
            <Animated.View style={[styles.sheen, { height: dims.height * 2 }, animatedSheen]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            <View style={styles.content}>{content}</View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  inert: { opacity: 0.42 },
  ring: {
    padding: 1,
    overflow: 'hidden',
  },
  faceClip: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: alpha.t04,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheen: {
    position: 'absolute',
    top: -8,
    width: 26,
    transform: [{ rotate: '18deg' }],
  },
});
