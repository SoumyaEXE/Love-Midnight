import React, { useCallback, useEffect } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GlassPanel } from '@/components/glass/LiquidGlass';
import { IconButton } from '@/components/ui/primitives';
import { alpha, motion, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';

/**
 * Bottom sheet.
 *
 * Rendered in a `Modal` rather than as an absolutely-positioned sibling, which
 * matters for two reasons: it escapes the tab bar's stacking context so the
 * scrim actually covers the bar, and it gets the hardware back button on
 * Android for free.
 *
 * The panel is dragged by a real gesture, not a tap-to-dismiss backdrop with a
 * decorative handle. A sheet with a handle you cannot pull is worse than one
 * with no handle at all - it advertises an affordance and then refuses it.
 * Releasing past a third of the panel's height, or with enough downward
 * velocity, commits the dismissal; anything less springs back.
 */

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Pinned to the bottom, outside the scrollable body. */
  footer?: React.ReactNode;
  /**
   * Lets tall content scroll inside the sheet, capped at 82% of the screen.
   *
   * When on, the drag gesture is bound to the grabber and title only - a pan
   * attached to the whole panel fights the inner ScrollView, and the sheet ends
   * up either impossible to dismiss or impossible to scroll.
   */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  scrollable = false,
  style,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const translateY = useSharedValue(0);
  const height = useSharedValue(600);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = height.value;
      translateY.value = withSpring(0, SPRING);
      progress.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) });
    } else {
      progress.value = withTiming(0, { duration: 180 });
    }
  }, [visible, translateY, progress, height]);

  // Android's back button should close the sheet, not the screen behind it.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(height.value, { duration: 200 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
    progress.value = withTiming(0, { duration: 200 });
  }, [translateY, progress, height, onClose]);

  const drag = Gesture.Pan()
    .onUpdate((e) => {
      // Rubber-band upward drags rather than allowing the sheet to detach from
      // the bottom edge.
      translateY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.18;
    })
    .onEnd((e) => {
      const committed = e.translationY > height.value * 0.33 || e.velocityY > 900;
      if (committed) {
        translateY.value = withTiming(height.value, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
        progress.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withSpring(0, motion.spring);
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
          >
            <BlurView
              intensity={26}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.backdropTint} />
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[styles.panelWrap, panelStyle]}
          onLayout={(e) => {
            height.value = e.nativeEvent.layout.height;
          }}
        >
          <GlassPanel
            radius={radii.sheet}
            intensity={90}
            opacity={0.93}
            specular={0.45}
            style={[styles.panel, { paddingBottom: insets.bottom + space.xl }, style]}
          >
            {/* Only the handle and title are draggable when the body scrolls. */}
            <GestureDetector gesture={drag}>
              <View>
                <View style={styles.grabber} />

                {title ? (
                  <View style={styles.head}>
                    <Text style={type.title3}>{title}</Text>
                    <IconButton
                      name="close"
                      size={32}
                      iconSize={16}
                      accessibilityLabel="Close"
                      onPress={dismiss}
                    />
                  </View>
                ) : null}
              </View>
            </GestureDetector>

            {scrollable ? (
              <ScrollView
                style={{ maxHeight: screenHeight * 0.62 }}
                contentContainerStyle={styles.scrollBody}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </GlassPanel>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdropTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,3,7,0.5)',
  },
  panelWrap: { width: '100%' },
  panel: {
    paddingTop: space.md,
    paddingHorizontal: space.xl,
    // Square off the bottom so the sheet meets the screen edge cleanly.
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: alpha.t20,
    marginBottom: space.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  scrollBody: { paddingBottom: space.sm },
  footer: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space['2xl'],
  },
});
