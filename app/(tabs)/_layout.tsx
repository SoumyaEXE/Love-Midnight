import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type View as RNView } from 'react-native';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { usePathname } from 'expo-router';
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
import { layout, motion, palette, radius as radii, space } from '@/theme/tokens';
import { fontFamily } from '@/theme/typography';
import { WINKS } from '@/data/people';
import { useConversations } from '@/hooks/useConversations';

/**
 * Floating glass tab bar, built on the headless `expo-router/ui` Tabs.
 *
 * Structure is load-bearing here, and not obviously so. Expo Router discovers
 * its screens by walking the *authored* element tree under `<Tabs>`, and that
 * walk descends only through fragments and `<TabList>` - a `<TabTrigger>` inside
 * any other wrapper is invisible to it, and the app dies at runtime with
 * "Couldn't find any screens for the navigator", pointing at `<Tabs>` rather
 * than at the wrapper actually responsible.
 *
 * So `<TabList>` *is* the bar: it carries the positioning and geometry, and the
 * glass and selection indicator are absolutely-positioned children of it.
 * Non-trigger children are skipped by the walk but still rendered, which is
 * exactly what this needs. `scripts/check-tab-structure.mjs` guards it.
 */

const TABS: { name: string; href: string; icon: IconName; label: string }[] = [
  { name: 'index', href: '/', icon: 'radar', label: 'Radar' },
  { name: 'winkers', href: '/winkers', icon: 'wink', label: 'Winkers' },
  { name: 'chat', href: '/chat', icon: 'chat-dots', label: 'Chat' },
  { name: 'profile', href: '/profile', icon: 'person', label: 'Profile' },
];

/** Horizontal inset of the indicator capsule inside its slot. */
const INDICATOR_INSET = 8;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [barWidth, setBarWidth] = useState(0);

  const unread = WINKS.filter((w) => w.unread).length;
  // Realtime, from the conversation index rather than from the messages
  // themselves - the badge is exactly the sum the chat list already subscribes
  // to, so it can never disagree with the rows underneath it.
  const { unread: unreadMessages } = useConversations();
  const slotWidth = barWidth / TABS.length;

  /**
   * Focus is derived from the route, not reported upward by the slots.
   *
   * The previous version had each slot fire an `onFocused` callback from an
   * effect. That callback was a fresh closure every render, so the effect
   * re-ran on every render and pushed state back up mid-commit - which made
   * the indicator lag a frame or two behind the tap and occasionally settle on
   * the wrong slot when tabs were switched quickly. Reading the pathname is
   * synchronous and cannot disagree with what is actually on screen.
   */
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => (tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href))),
  );

  const target = useDerivedValue(() => withSpring(activeIndex, motion.spring), [activeIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: target.value * slotWidth + INDICATOR_INSET }],
    opacity: slotWidth > 0 ? 1 : 0,
  }));

  return (
    <Tabs>
      {/* Left at the default (detached).
          `detachInactiveScreens={false}` puts react-native-screens into a mode
          where ScreenContainer keeps every screen in a native container, and on
          Android that container draws over absolutely-positioned JS siblings -
          which made the entire tab bar disappear. Switching already feels
          settled now that the indicator is driven by the route rather than by a
          callback, so this was buying very little. */}
      <TabSlot style={styles.scene} />

      <TabList
        style={[styles.bar, { bottom: Math.max(insets.bottom, space.md) }]}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {/* Ignored by the trigger walk, rendered normally. First, so the
            triggers paint over it. The bar itself stays transparent: giving it
            a background would be what the BlurView samples, and the glass would
            show a flat colour instead of the content behind it. */}
        <GlassPanel radius={radii.pill} style={styles.glass} specular={0.55} opacity={0.5} />

        {/* Violet wash over the glass.
            The reference bar is not dark glass sitting on a violet page - it is
            violet glass, lit from the left. Blur alone cannot produce that: it
            samples whatever is behind, which at the bottom of the screen is
            mostly bloom and mostly dark. The tint is what makes the bar read as
            the same material as the CTA buttons rather than as a hole. */}
        <LinearGradient
          colors={['rgba(190,110,248,0.42)', 'rgba(150,58,232,0.38)', 'rgba(112,30,192,0.42)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tint}
          pointerEvents="none"
        />

        {slotWidth > 0 ? (
          <Animated.View
            style={[
              styles.indicator,
              { width: Math.max(slotWidth - INDICATOR_INSET * 2, 0) },
              indicatorStyle,
            ]}
            pointerEvents="none"
          >
            {/* Softer and more translucent than a solid CTA fill. In the
                reference the selected slot is a lit area of the same glass,
                not a magenta button dropped into the bar. */}
            {/* The selected slot is a brighter pane of the same glass, lifted
                slightly off the bar - a white wash with a bright rim, not a
                differently-coloured button. */}
            <LinearGradient
              colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.14)']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={styles.indicatorFill}
            />
          </Animated.View>
        ) : null}

        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href as never} asChild>
            <TabSlotButton
              icon={tab.icon}
              label={tab.label}
              badge={
                tab.name === 'winkers' && unread > 0
                  ? unread
                  : tab.name === 'chat' && unreadMessages > 0
                    ? unreadMessages
                    : undefined
              }
            />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

type SlotButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  label: string;
  badge?: number;
};

/**
 * `TabTrigger asChild` clones this with `isFocused`, `onPress`, and a ref, so
 * all three are forwarded.
 *
 * The badge is anchored to the icon rather than to the slot. Positioning it as
 * a percentage of slot width - as this did before - moves it as the bar resizes
 * and pushes it past the pill's rounded edge on narrow devices. Anchoring it to
 * a wrapper sized to the icon keeps it in the same place at every width.
 */
const TabSlotButton = forwardRef<RNView, SlotButtonProps>(function TabSlotButton(
  { icon, label, badge, isFocused, onPress, href: _href, style: _injectedStyle, ...rest },
  ref,
) {
  const progress = useDerivedValue(() => withSpring(isFocused ? 1 : 0, motion.spring), [isFocused]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.06]) }],
  }));

  return (
    // Order matters, and getting it wrong is silent.
    //
    // `TabTrigger asChild` injects its own `style` - `{flexDirection: 'row',
    // justifyContent: 'space-between'}` - along with isFocused and onPress.
    // Spreading `rest` *after* `style` let that injected style replace
    // `styles.slot` wholesale, which dropped the flex and the centring: every
    // icon collapsed to its intrinsic size and pinned itself to the top of the
    // bar. It is destructured out above and `rest` is spread first, so the
    // explicit props below always win.
    <Pressable
      {...(rest as PressableProps)}
      ref={ref}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      style={styles.slot}
      onPress={(event) => {
        if (!isFocused) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
    >
      <Animated.View style={[styles.iconWrap, animated]}>
        <Icon
          name={icon}
          size={22}
          color={isFocused ? palette.white : 'rgba(255,255,255,0.66)'}
          strokeWidth={isFocused ? 1.7 : 1.5}
        />

        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel} numberOfLines={1}>
              {badge > 9 ? '9+' : badge}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  scene: { flex: 1 },

  bar: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    height: layout.tabBarHeight,
    // `alignItems: stretch` (the default) lets each slot fill the bar's height,
    // so the whole pill is tappable rather than just the icon's own box.
    alignItems: 'stretch',
    // Explicit stacking on both platforms. Screen content carries elevation of
    // its own (cards at 6, buttons up to 14), and without these the bar can end
    // up painted underneath it.
    zIndex: 50,
    // The bar carries its own bloom, which lifts it off the content behind it
    // rather than letting it read as a hole cut in the screen.
    shadowColor: palette.bloom,
    shadowOpacity: 0.35,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  // Written out rather than spreading StyleSheet.absoluteFill, which React
  // Native 0.86 types as a registered style rather than a plain object.
  glass: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(233,214,255,0.30)',
  },

  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    // Square and centred, so the badge's offsets are measured from the icon and
    // not from a box that changes size with the bar.
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  indicator: {
    position: 'absolute',
    top: 9,
    bottom: 9,
    left: 0,
  },
  indicatorFill: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
  },
  badgeLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 13,
    color: palette.void,
  },
});
