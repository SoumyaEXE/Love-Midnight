import React, { useCallback } from 'react';
import {
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
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { alpha, border, motion, palette, radius as radii, shadow, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { Icon, type IconName } from '@/components/icons/Icon';

/**
 * The surfaces and controls that are not glass and not metal.
 *
 * Everything here shares one rule taken from the comps: a raised element is
 * lighter at its top edge than at its bottom, and carries a hairline that is
 * brighter above than below. Applied consistently it is what makes a flat dark
 * palette read as a stack of physical layers rather than as boxes.
 */

// -----------------------------------------------------------------------------
// Card
// -----------------------------------------------------------------------------

export function Card({
  children,
  style,
  radius = radii.card,
  /** Violet wash, used for unread rows. */
  active = false,
  padded = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  active?: boolean;
  padded?: boolean;
}) {
  return (
    <View style={[styles.card, { borderRadius: radius }, padded && styles.cardPadded, style]}>
      <LinearGradient
        colors={
          active
            ? ['rgba(168,85,247,0.22)', 'rgba(124,34,206,0.10)']
            : ['rgba(255,255,255,0.055)', 'rgba(255,255,255,0.015)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Top hairline, brighter than the border it sits on. */}
      <View style={styles.topEdge} pointerEvents="none" />
      {children}
    </View>
  );
}

/** Card that responds to touch. Used for every navigable list row. */
export function PressableCard({
  children,
  onPress,
  style,
  radius = radii.card,
  active = false,
  padded = true,
  accessibilityLabel,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  active?: boolean;
  padded?: boolean;
  accessibilityLabel?: string;
}) {
  const press = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.985]) }],
    opacity: interpolate(press.value, [0, 1], [1, 0.9]),
  }));

  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPressIn={() => {
          press.value = withSpring(1, motion.press);
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 200 });
        }}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
      >
        <Card radius={radius} active={active} padded={padded} style={style}>
          {children}
        </Card>
      </Pressable>
    </Animated.View>
  );
}

// -----------------------------------------------------------------------------
// Chip
// -----------------------------------------------------------------------------

/**
 * The filter pill from the comps' Distance row and Filters sheet.
 *
 * Selected state is a light face with dark text - the inverse of the resting
 * state - rather than a tinted version of it. On a near-black ground a tinted
 * selection is nearly invisible at a glance; a full inversion is not.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.94]) }],
  }));

  const handlePress = useCallback(() => {
    void Haptics.selectionAsync();
    onPress?.();
  }, [onPress]);

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        onPressIn={() => {
          press.value = withSpring(1, motion.press);
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 180 });
        }}
        onPress={handlePress}
        style={[styles.chip, selected ? styles.chipSelected : styles.chipResting]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={14}
            color={selected ? palette.void : alpha.t56}
            style={{ marginRight: 6 }}
          />
        ) : null}
        <Text style={[type.captionStrong, selected ? styles.chipLabelSelected : styles.chipLabel]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// -----------------------------------------------------------------------------
// Screen header
// -----------------------------------------------------------------------------

export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
  style,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={onBack}
          style={styles.back}
        >
          <Icon name="chevron-left" size={24} color={alpha.t72} />
        </Pressable>
      ) : null}

      <View style={styles.headerText}>
        <Text style={type.title2} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.callout, styles.headerSubtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Section label + list row
// -----------------------------------------------------------------------------

export function SectionLabel({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.eyebrow, styles.section, style]}>{children}</Text>;
}

/** The icon-title-subtitle-chevron row from Privacy & Safety. */
export function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  tone = 'default',
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tone?: 'default' | 'violet' | 'negative';
}) {
  const tint =
    tone === 'violet' ? palette.violet : tone === 'negative' ? palette.negative : alpha.t56;

  return (
    <PressableCard onPress={onPress} radius={radii.lg} style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Icon name={icon} size={19} color={tint} />
      </View>
      <View style={styles.settingText}>
        <Text style={type.body} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, styles.settingSubtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <Icon name="chevron-right" size={18} color={alpha.t28} />}
    </PressableCard>
  );
}

// -----------------------------------------------------------------------------
// Badges
// -----------------------------------------------------------------------------

/**
 * Small status pill. `tone` maps to the three states the app ever reports:
 * proved (violet), live (green), and simulated (neutral).
 */
export function Badge({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: 'neutral' | 'violet' | 'positive' | 'negative';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const tint = {
    neutral: alpha.t56,
    violet: palette.violet,
    positive: palette.positive,
    negative: palette.negative,
  }[tone];

  const fill = {
    neutral: 'rgba(255,255,255,0.06)',
    violet: 'rgba(168,85,247,0.16)',
    positive: 'rgba(52,211,153,0.14)',
    negative: 'rgba(251,107,107,0.14)',
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: fill, borderColor: `${tint}33` }, style]}>
      {icon ? <Icon name={icon} size={12} color={tint} style={{ marginRight: 5 }} /> : null}
      <Text style={[type.micro, { color: tint }]}>{label}</Text>
    </View>
  );
}

/** Round icon button. The header's search / options / close affordances. */
export function IconButton({
  name,
  onPress,
  size = 36,
  iconSize = 18,
  color = alpha.t72,
  accessibilityLabel,
  style,
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.9]) }],
    opacity: interpolate(press.value, [0, 1], [1, 0.7]),
  }));

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? name}
        hitSlop={10}
        onPressIn={() => {
          press.value = withSpring(1, motion.press);
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 180 });
        }}
        onPress={onPress}
        style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Icon name={name} size={iconSize} color={color} />
      </Pressable>
    </Animated.View>
  );
}

/** Thin divider. Sits at 8% white, which is one step below the card border. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border.hairline,
    ...shadow.card,
  },
  cardPadded: {
    padding: space.lg,
  },
  topEdge: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha.t14,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipResting: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: alpha.t10,
  },
  chipSelected: {
    backgroundColor: palette.white,
    borderColor: palette.white,
  },
  chipLabel: { color: alpha.t72 },
  chipLabelSelected: { color: palette.void },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  back: {
    marginRight: space.sm,
    marginLeft: -6,
  },
  headerText: { flex: 1 },
  headerSubtitle: { marginTop: 2 },
  headerRight: { marginLeft: space.md },

  section: {
    marginTop: space['2xl'],
    marginBottom: space.md,
    marginHorizontal: space.xl,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingIcon: {
    width: 34,
    alignItems: 'flex-start',
  },
  settingText: { flex: 1, marginRight: space.md },
  settingSubtitle: { marginTop: 2 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },

  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha.t08,
  },
});
