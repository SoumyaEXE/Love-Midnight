import { useAnimatedKeyboard, useAnimatedStyle, type AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

/**
 * Bottom padding that tracks the keyboard.
 *
 * `KeyboardAvoidingView` is the obvious choice and it does not work here.
 * `behavior="padding"` is iOS-only in practice, and the Android half of it has
 * always relied on the window itself resizing under `adjustResize` - which
 * stops happening the moment an app goes edge-to-edge, as this one does
 * (`android.edgeToEdgeEnabled`). The window then stays full height and the
 * system hands the app an inset instead, so a composer or a text field sits
 * calmly underneath the keyboard with nothing to push it up.
 *
 * Reanimated reads that inset directly on both platforms, which is why this is
 * a shared hook rather than a per-screen `Platform.OS` guess. Padding rather
 * than a transform, so the scroll view above it genuinely shrinks and its
 * content stays reachable instead of being pushed off the top.
 *
 * `reserved` is the padding the layout already carries at the bottom - usually
 * `insets.bottom`. The keyboard's height is measured from the bottom of the
 * window, so without subtracting it the safe-area gap gets counted twice and
 * the field floats above the keys.
 */
export function useKeyboardInset(reserved = 0): AnimatedStyle<ViewStyle> {
  const keyboard = useAnimatedKeyboard();

  return useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, keyboard.height.value - reserved),
  }));
}
