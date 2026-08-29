import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { Card, ScreenHeader, SectionLabel } from '@/components/ui/primitives';
import { MetalButton } from '@/components/ui/MetalButton';
import { useKeyboardInset } from '@/components/ui/keyboard';
import {
  BioSection,
  CardSection,
  IdentitySection,
  InterestsSection,
  ScoringSection,
} from '@/components/profile/ProfileForm';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { useHalo } from '@/state/store';
import { isComplete, problems } from '@/state/profile';

/**
 * Editing the profile after onboarding.
 *
 * The same sections onboarding walks through, all on one page - by this point
 * the user knows what they are looking at and does not need to be paced. They
 * are still separate cards rather than one long form, so a change to a single
 * thing is a scroll to one card rather than a hunt through twenty-six controls.
 *
 * Saving re-publishes, and that is the honest behaviour rather than an extra
 * step: the commitment covers both the answers and the disclosure list, so a
 * change that is not re-committed leaves the ledger describing a profile that
 * no longer exists. The button says so.
 */

export default function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, saveProfile, publishProfile, mask, toggleDimension } = useHalo();

  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const keyboardInset = useKeyboardInset(insets.bottom);

  const save = useCallback(async () => {
    if (!isComplete(profile)) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await publishProfile();
      // Confirmed in place rather than by popping the screen. A save that
      // navigates away is indistinguishable from a save that silently failed.
      setSaved(true);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not publish');
    } finally {
      setBusy(false);
    }
  }, [profile, publishProfile]);

  /** Any edit after a save invalidates the confirmation it is sitting under. */
  const edit = useCallback(
    (next: Parameters<typeof saveProfile>[0]) => {
      setSaved(false);
      saveProfile(next);
    },
    [saveProfile],
  );

  const found = showErrors ? problems(profile) : {};
  const blocking = Object.values(found).filter(Boolean).length;

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.7} origin={1.15} />

      <Animated.View style={[styles.flex, keyboardInset]}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + space.sm,
            paddingBottom: insets.bottom + space['5xl'],
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title="Edit profile" onBack={() => router.back()} />

          <SectionLabel>Who you are</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <IdentitySection profile={profile} onChange={edit} showErrors={showErrors} />
            </Card>
          </View>

          <SectionLabel>Bio</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <BioSection profile={profile} onChange={edit} />
            </Card>
          </View>

          <SectionLabel>Interests</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <InterestsSection profile={profile} onChange={edit} showErrors={showErrors} />
            </Card>
          </View>

          <SectionLabel>On your card</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <CardSection profile={profile} onChange={edit} />
            </Card>
          </View>

          <SectionLabel>What the matcher scores</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <ScoringSection
                mask={mask}
                onToggleDimension={(dimension) => {
                  setSaved(false);
                  toggleDimension(dimension);
                }}
              />
            </Card>
          </View>

          <View style={styles.section}>
            {failed ? <Text style={[type.caption, styles.failed]}>{failed}</Text> : null}
            {blocking ? (
              <Text style={[type.caption, styles.failed]}>
                Fix the {blocking === 1 ? 'field' : `${blocking} fields`} marked above first.
              </Text>
            ) : null}

            {saved ? (
              <Animated.View entering={FadeIn.duration(240)} style={styles.saved}>
                <View style={styles.tick}>
                  <Icon name="check" size={14} color={palette.positive} />
                </View>
                <Text style={[type.callout, styles.savedLabel]}>
                  Saved on chain — committed on Midnight, receipt ready for Solana.
                </Text>
              </Animated.View>
            ) : null}

            <MetalButton
              label={saved ? 'Done' : 'Save and re-commit'}
              variant={saved ? 'metal' : 'violet'}
              size="lg"
              fullWidth
              loading={busy}
              onPress={saved ? () => router.back() : () => void save()}
              style={styles.save}
            />
          </View>
        </ScrollView>
      </Animated.View>

      <ScrollScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  flex: { flex: 1 },
  section: { marginHorizontal: space.xl, marginBottom: space.lg },

  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,211,153,0.28)',
  },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52,211,153,0.14)',
  },
  savedLabel: { flex: 1, color: alpha.t72 },

  failed: { marginBottom: space.md, color: palette.negative },
  save: { marginTop: space.lg },
});
