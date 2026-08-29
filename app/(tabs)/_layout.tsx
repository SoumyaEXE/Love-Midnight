import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type View as RNView } from 'react-native';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import { GlassPanel } from '@/components/glass/LiquidGlass';
import { Icon, type IconName } from '@/components/icons/Icon';
import { alpha, layout, motion, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { WINKS } from '@/data/people';

/**
 * Floating glass tab bar, built on the headless `expo-router/ui` Tabs.
 *
 * The headless API is what makes this shape possible: the default bottom-tabs
 * navigator owns its own container and insets, and fighting it to get a bar
 * that floats clear of the bottom edge means overriding half its layout. Here
 * the bar is just a view we position, and `TabTrigger asChild` hands each slot
 * its own focus state.
 *
 * Two details carry the look. The selection indicator *slides* between slots
 * rather than cross-fading, so the bar reads as one object with a moving light
 * inside it. And it floats over content, which is only legible because it is
 * genuine backdrop glass - a solid bar in the same position would look
 * detached.
 */

const TABS: { name: string; href: string; icon: IconName; label: string }[] = [
  { name: 'index', href: '/', icon: 'radar', label: 'Radar' },
  { name: 'winkers', href: '/winkers', icon: 'wink', label: 'Winkers' },
  { name: 'chat', href: '/chat', icon: 'chat-dots', label: 'Chat' },
  { name: 'profile', href: '/profile', icon: 'person', label: 'Profile' },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [slotWidth, setSlotWidth] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const unread = WINKS.filter((w) => w.unread).length;

  // Springing toward the focused index means a fast double-tap across the bar
  // produces one continuous travel rather than a queue of animations.
  const target = useDerivedValue(
    () => withSpring(focusedIndex, motion.spring),
    [focusedIndex],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: target.value * slotWidth }],
    opacity: slotWidth > 0 ? 1 : 0,
  }));

  return (
    <Tabs>
      <TabSlot style={styles.scene} />

      <View
        style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}
        pointerEvents="box-none"
      >
        <GlassPanel radius={radii.pill} style={styles.bar} specular={0.5}>
          <TabList
            style={styles.slots}
            onLayout={(e) => setSlotWidth(e.nativeEvent.layout.width / TABS.length)}
          >
            {slotWidth > 0 ? (
              <Animated.View
                style={[styles.indicator, { width: slotWidth }, indicatorStyle]}
                pointerEvents="none"
              >
                <LinearGradient
                  colors={['rgba(192,38,211,0.85)', 'rgba(124,34,206,0.7)']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.indicatorFill}
                />
              </Animated.View>
            ) : null}

            {TABS.map((tab, index) => (
              <TabTrigger key={tab.name} name={tab.name} href={tab.href as never} asChild>
                <TabSlotButton
                  icon={tab.icon}
                  label={tab.label}
                  badge={tab.name === 'winkers' && unread > 0 ? unread : undefined}
                  onFocused={() => setFocusedIndex(index)}
                />
              </TabTrigger>
            ))}
          </TabList>
        </GlassPanel>
      </View>
    </Tabs>
  );
}

type SlotButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  label: string;
  badge?: number;
  onFocused: () => void;
};

/**
 * `TabTrigger asChild` clones this with `isFocused`, `onPress`, and a ref, so
 * it has to forward all three. Focus is reported upward rather than held here,
 * because the sliding indicator lives in the parent and needs the index.
 */
const TabSlotButton = forwardRef<RNView, SlotButtonProps>(function TabSlotButton(
  { icon, label, badge, isFocused, onFocused, onPress, href: _href, ...rest },
  ref,
) {
  React.useEffect(() => {
    if (isFocused) onFocused();
  }, [isFocused, onFocused]);

  const progress = useDerivedValue(
    () => withSpring(isFocused ? 1 : 0, motion.spring),
    [isFocused],
  );

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.08]) }],
  }));

  return (
    <Pressable
      ref={ref}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      accessibilityLabel={label}
      style={styles.slot}
      onPress={(event) => {
        if (!isFocused) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      {...(rest as PressableProps)}
    >
      <Animated.View style={animated}>
        <Icon name={icon} size={22} color={isFocused ? palette.white : alpha.t38} strokeWidth={1.5} />
      </Animated.View>

      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  scene: { flex: 1 },
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
  },
  bar: {
    height: layout.tabBarHeight,
    justifyContent: 'center',
    // The bar carries its own bloom, which lifts it off the content behind it
    // rather than letting it read as a hole cut in the screen.
    shadowColor: palette.bloom,
    shadowOpacity: 0.35,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  slots: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  indicator: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: 0,
    paddingHorizontal: 10,
  },
  indicatorFill: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: '26%',
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
  },
  badgeLabel: {
    ...type.micro,
    color: palette.void,
    fontSize: 10,
    lineHeight: 13,
  },
});
