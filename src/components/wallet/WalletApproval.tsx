import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GlassPanel } from '@/components/glass/LiquidGlass';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';

/**
 * The wallet, approving the network fee.
 *
 * A deliberate piece of theatre, and worth being plain about what it is. No
 * NIGHT moves: the deploy behind it is simulated, and this is the moment in the
 * flow where a real wallet would take the screen, show the amount, and hand it
 * back. Standing in for that is more honest than the previous version, which
 * charged "1 NIGHT" behind a bare 1.5s spinner - the fee was asserted by a
 * button label and nothing ever showed it being agreed to.
 *
 * When a real transaction exists this component is what it replaces. The shape
 * is already right: it opens once, before anything is published, and the deploy
 * does not proceed until it has closed.
 *
 * It is not dismissible. There is no backdrop press, no grabber, and the back
 * button does nothing for the second it is up - an approval that can be swiped
 * away mid-flight would leave the caller waiting on a sheet the user has
 * already dismissed, and one second is far too short a window to make that
 * choice meaningful anyway.
 */

/** The fee, named once. The button, the payload preview and this sheet share it. */
export const NETWORK_FEE = '1 NIGHT';

/**
 * How long the wallet stays up, in milliseconds.
 *
 * Exported because the caller owns the timing - it holds this open, then
 * publishes - and two components counting to one second separately would drift
 * the moment either is touched.
 */
export const WALLET_HOLD_MS = 1000;

export function WalletApproval({
  visible,
  /** The paying account. Truncated here, not by the caller. */
  address,
  walletName,
}: {
  visible: boolean;
  address?: string | null;
  walletName?: string;
}) {
  const insets = useSafeAreaInsets();
  // Kept mounted past `visible` so the exit animation has something to play on.
  // Unmounting the Modal the instant the flag drops makes the wallet vanish
  // rather than leave.
  const [mounted, setMounted] = useState(false);

  const fade = useSharedValue(0);
  const lift = useSharedValue(28);
  const fill = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      fade.value = withTiming(1, { duration: 200 });
      lift.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
      // Runs the length of the hold, so the second the sheet is up reads as a
      // wallet working rather than as an arbitrary pause.
      fill.value = 0;
      fill.value = withTiming(1, { duration: WALLET_HOLD_MS, easing: Easing.linear });
      return;
    }

    fade.value = withTiming(0, { duration: 190 });
    lift.value = withTiming(20, { duration: 190 }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [visible, fade, lift, fill]);

  const backdrop = useAnimatedStyle(() => ({ opacity: fade.value }));
  const panel = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: lift.value }],
  }));
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdrop]}>
          <BlurView intensity={44} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.tint} />
        </Animated.View>

        <Animated.View style={[styles.panelWrap, { paddingBottom: insets.bottom + space.xl }, panel]}>
          <GlassPanel radius={radii.sheet} intensity={100} opacity={0.965} specular={0} style={styles.panel}>
            {/* The wallet's own chrome, not Halo's. The point of the moment is
                that another application has the screen. */}
            <View style={styles.chrome}>
              <View style={styles.mark}>
                <Icon name="wallet" size={18} color={palette.violet} />
              </View>
              <View style={styles.chromeText}>
                <Text style={type.body}>{walletName ?? 'Midnight Wallet'}</Text>
                <Text style={[type.caption, styles.chromeSub]}>Requested by Halo</Text>
              </View>
              <View style={styles.dot} />
            </View>

            <Text style={[type.title3, styles.title]}>Approve payment</Text>

            <View style={styles.rows}>
              <Row label="Network fee" value={NETWORK_FEE} tone="fee" />
              <Row label="From" value={address ? truncate(address) : 'On-device key'} />
              <Row label="Network" value="Midnight testnet" />
            </View>

            <View style={styles.progress}>
              <View style={styles.track}>
                <Animated.View style={[styles.trackFill, bar]} />
              </View>
              <Text style={[type.caption, styles.progressLabel]}>Approving…</Text>
            </View>
          </GlassPanel>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Row({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'fee' }) {
  return (
    <View style={styles.row}>
      <Text style={[type.captionStrong, styles.rowLabel]}>{label}</Text>
      <Text
        style={[type.digest, tone === 'fee' ? styles.rowFee : styles.rowValue]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** mn_demo1a3f…c410. Long enough to recognise, short enough for one line. */
function truncate(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 12)}…${value.slice(-4)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  tint: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Android's blur degrades to nothing, so the tint is what actually
    // separates the wallet from the screen it rose over.
    backgroundColor: 'rgba(4,3,7,0.66)',
  },

  panelWrap: { width: '100%', paddingHorizontal: space.lg },
  panel: {
    padding: space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t14,
  },

  chrome: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,180,254,0.4)',
  },
  chromeText: { flex: 1 },
  chromeSub: { marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.positive },

  title: { marginTop: space.xl },

  rows: {
    marginTop: space.lg,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
    paddingHorizontal: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11 },
  rowLabel: { width: 88 },
  rowValue: { flex: 1, color: alpha.t56, textAlign: 'right' },
  rowFee: { flex: 1, color: palette.positive, textAlign: 'right' },

  progress: { marginTop: space.xl },
  track: {
    height: 2,
    borderRadius: 1,
    backgroundColor: alpha.t08,
    overflow: 'hidden',
  },
  trackFill: { height: 2, borderRadius: 1, backgroundColor: palette.violet },
  progressLabel: { marginTop: space.sm, textAlign: 'center' },
});
