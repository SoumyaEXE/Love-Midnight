import React, { useCallback, useEffect } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
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
  useAnimatedScrollHandler,
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
 * Dismissal is a real drag, on the whole sheet - not just on the grabber.
 * Binding the pan to the handle alone made a 38x4 target the only way out of a
 * full-height profile, which in practice meant the sheet could not be dragged
 * closed at all. The body pan instead defers to the ScrollView: it only takes
 * over once the content is scrolled to the top and the drag is downward, which
 * is the behaviour every native sheet has and the only one that does not
 * either swallow scrolling or refuse dismissal.
 */

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Pinned to the bottom, outside the scrollable body. */
  footer?: React.ReactNode;
  /**
   * Lets tall content scroll inside the sheet.
   *
   * The cap lives on the *panel*, not on the ScrollView: a fixed maxHeight on
   * the body meant the header and footer were added on top of it, so a tall
   * profile pushed its "Send wink" button past the bottom of the screen. With
   * the cap on the panel and `flexShrink` on the body, the chrome claims its
   * height first and the scroll area takes exactly what is left - the footer is
   * always on screen, however long the content is.
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

  const translateY = useSharedValue(screenHeight);
  const height = useSharedValue(screenHeight);
  const progress = useSharedValue(0);

  // Body-pan bookkeeping. `owned` is set the moment the pan decides the drag
  // belongs to the sheet rather than to the ScrollView; `origin` records the
  // translation at that instant so handing over mid-gesture does not jump.
  const scrollY = useSharedValue(0);
  const owned = useSharedValue(false);
  const origin = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Always start fully off-screen. Seeding from the last measured height
      // meant the first open began at a stale 600px and the panel flashed
      // half-open before the spring caught it.
      translateY.value = screenHeight;
      translateY.value = withSpring(0, SPRING);
      progress.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) });
    } else {
      progress.value = withTiming(0, { duration: 180 });
    }
  }, [visible, translateY, progress, screenHeight]);

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

  const settle = useCallback(
    (offset: number, velocity: number) => {
      'worklet';
      if (offset > height.value * 0.28 || velocity > 800) {
        translateY.value = withTiming(height.value, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
        progress.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withSpring(0, motion.spring);
      }
    },
    [translateY, progress, height, onClose],
  );

  /** The handle and title. Always draggable, in either direction. */
  const headerDrag = Gesture.Pan()
    .onUpdate((e) => {
      // Rubber-band upward drags rather than letting the sheet detach from the
      // bottom edge.
      translateY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.18;
    })
    .onEnd((e) => settle(e.translationY, e.velocityY));

  /**
   * The body. Runs alongside the ScrollView and only claims the gesture once
   * the content is already at the top and the finger is heading down - at any
   * other moment the drag is a scroll, and stealing it is what makes a sheet
   * feel broken.
   */
  const bodyDrag = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .failOffsetX([-24, 24])
    .onBegin(() => {
      owned.value = false;
    })
    .onUpdate((e) => {
      if (!owned.value) {
        if (scrollY.value > 0.5 || e.translationY <= 0) return;
        owned.value = true;
        origin.value = e.translationY;
      }
      translateY.value = Math.max(0, e.translationY - origin.value);
    })
    .onEnd((e) => {
      if (!owned.value) return;
      owned.value = false;
      settle(e.translationY - origin.value, e.velocityY);
    });

  /**
   * Composing the pan with `Gesture.Native()` is what lets both recognise at
   * once: the native half binds to the ScrollView underneath the detector, so
   * the two cooperate instead of one cancelling the other. Declaring the
   * relation by ref needs a real gesture handler on the other end, which a
   * plain RN ScrollView is not.
   */
  const bodyGesture = Gesture.Simultaneous(bodyDrag, Gesture.Native());

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const body = scrollable ? (
    <GestureDetector gesture={bodyGesture}>
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        bounces={false}
      >
        {children}
      </Animated.ScrollView>
    </GestureDetector>
  ) : (
    children
  );

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
            <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
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
            intensity={100}
            // Near-opaque. The sheet sits over a live map and a lit list; at
            // 0.93 the brightest of that read straight through the blur and
            // fought the body copy.
            opacity={0.965}
            // No Skia rim on sheets. GlassRim allocates a canvas the size of
            // the whole panel and blurs a sweep gradient across it, which is
            // several frames of work at exactly the moment the sheet is
            // springing up. At this opacity almost none of it is visible
            // anyway; the static lip below carries the same read for free.
            specular={0}
            style={[
              styles.panel,
              {
                paddingBottom: insets.bottom + space.xl,
                maxHeight: screenHeight - insets.top - space['3xl'],
              },
              style,
            ]}
          >
            <GestureDetector gesture={headerDrag}>
              <View style={styles.handle}>
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

            {body}

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
    // Android's blur degrades to nothing, so the tint is what actually
    // separates the sheet from the screen it rose over.
    backgroundColor: 'rgba(4,3,7,0.62)',
  },
  panelWrap: { width: '100%' },
  panel: {
    paddingTop: 0,
    paddingHorizontal: space.xl,
    // Square off the bottom so the sheet meets the screen edge cleanly.
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t14,
  },
  // A generous grab region rather than a 4px bar. The handle is the one part
  // of the sheet that is always draggable, so it should be thumb-sized.
  handle: { paddingTop: space.md, paddingBottom: space.sm },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: alpha.t20,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    marginBottom: space.lg,
  },
  // `flexShrink` rather than `flex: 1`: a short sheet should hug its content
  // instead of stretching to the cap.
  scroll: { flexShrink: 1 },
  scrollBody: { paddingTop: space.sm, paddingBottom: space.sm },
  footer: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xl,
  },
});
