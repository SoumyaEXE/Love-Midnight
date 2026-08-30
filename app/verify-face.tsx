import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { MetalButton } from '@/components/ui/MetalButton';
import { Card, ScreenHeader } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { FaceCapture } from '@/components/verify/FaceCapture';
import { useHalo } from '@/state/store';
import { POSES } from '@/state/faceCheck';

/**
 * Photo identity check, on its own screen.
 *
 * The same component onboarding embeds, given the whole viewport. Two audiences
 * end up here: someone who skipped the step during signup, and someone who
 * finished it and wants to know where the review got to. Both are served by the
 * same screen because `FaceCapture` already decides which of those it is
 * looking at - there is no second copy of that rule here.
 *
 * The briefing above the viewfinder only appears before the first capture. Once
 * the camera is live the instruction on the frame is the only thing worth
 * reading, and a paragraph competing with it would be read by nobody.
 */

export default function VerifyFaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { faceCheck } = useHalo();

  const submitted = faceCheck.status !== 'none';

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.75} origin={1.1} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingBottom: insets.bottom + space['5xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Verify your ID"
          subtitle={submitted ? 'Under review' : 'Three photos, one minute'}
          onBack={() => router.back()}
        />

        {submitted ? null : (
          <View style={styles.section}>
            <Card radius={radii.card}>
              <Text style={[type.callout, styles.brief]}>
                We ask for the same face from three angles. A photograph of a photograph can
                manage one of them; it cannot manage a cheek.
              </Text>

              <View style={styles.steps}>
                {POSES.map((spec, index) => (
                  <View key={spec.pose} style={styles.step}>
                    <View style={styles.stepIndex}>
                      <Text style={[type.micro, styles.stepIndexLabel]}>{index + 1}</Text>
                    </View>
                    <Text style={[type.callout, styles.stepText]}>{spec.instruction}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )}

        <View style={styles.section}>
          <LiquidGlass radius={radii.sheet} style={styles.panel} intensity={50}>
            <FaceCapture />
          </LiquidGlass>
        </View>

        {submitted ? (
          <View style={styles.section}>
            <MetalButton
              label="Done"
              variant="violet"
              size="lg"
              fullWidth
              onPress={() => router.back()}
            />
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.privacy}>
              <Icon name="lock" size={14} color={alpha.t38} />
              <Text style={[type.caption, styles.privacyText]}>
                The photos go to the reviewer and nowhere else. They are never shown on your
                card, and nothing from your photo library is read.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <ScrollScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },

  section: { paddingHorizontal: space.xl, marginTop: space.lg },
  panel: { padding: space.xl },

  brief: { lineHeight: 20 },
  steps: { marginTop: space.lg, gap: space.md },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,180,254,0.34)',
  },
  stepIndexLabel: { color: palette.white },
  stepText: { flex: 1, lineHeight: 19 },

  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  privacyText: { flex: 1, lineHeight: 18 },
});
