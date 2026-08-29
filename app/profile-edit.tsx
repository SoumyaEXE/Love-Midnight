import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { Card, ScreenHeader, SectionLabel } from '@/components/ui/primitives';
import { MetalButton } from '@/components/ui/MetalButton';
import {
  AboutSection,
  DisclosureSection,
  InterestsSection,
} from '@/components/profile/ProfileForm';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { useHalo } from '@/state/store';
import { isComplete, problems } from '@/state/profile';

/**
 * Editing the profile after onboarding.
 *
 * Same three sections, all on one page - by this point the user knows what
 * they are looking at and does not need to be walked through it.
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
  const [failed, setFailed] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (!isComplete(profile)) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await publishProfile();
      router.back();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not publish');
    } finally {
      setBusy(false);
    }
  }, [profile, publishProfile, router]);

  const found = showErrors ? problems(profile) : {};
  const blocking = Object.values(found).filter(Boolean).length;

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.7} origin={1.15} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + space.sm,
            paddingBottom: insets.bottom + space['5xl'],
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title="Edit profile" onBack={() => router.back()} />

          <SectionLabel>About you</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <AboutSection profile={profile} onChange={saveProfile} showErrors={showErrors} />
            </Card>
          </View>

          <SectionLabel>Interests</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <InterestsSection
                profile={profile}
                onChange={saveProfile}
                showErrors={showErrors}
              />
            </Card>
          </View>

          <SectionLabel>What you show</SectionLabel>
          <View style={styles.section}>
            <Card radius={radii.card}>
              <DisclosureSection
                profile={profile}
                onChange={saveProfile}
                mask={mask}
                onToggleDimension={toggleDimension}
              />
            </Card>
          </View>

          <View style={styles.section}>
            <View style={styles.note}>
              <Icon name="cube" size={15} color={palette.violet} />
              <Text style={[type.caption, styles.noteLabel]}>
                Saving re-commits the record on Midnight and mirrors a receipt to Solana. Your
                answers stay on this device — only the commitment and the list of visible fields
                are published.
              </Text>
            </View>

            {failed ? <Text style={[type.caption, styles.failed]}>{failed}</Text> : null}
            {blocking ? (
              <Text style={[type.caption, styles.failed]}>
                Fix the {blocking === 1 ? 'field' : `${blocking} fields`} marked above first.
              </Text>
            ) : null}

            <MetalButton
              label="Save and re-commit"
              variant="violet"
              size="lg"
              fullWidth
              loading={busy}
              onPress={() => void save()}
              style={styles.save}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ScrollScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  flex: { flex: 1 },
  section: { marginHorizontal: space.xl, marginBottom: space.lg },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  noteLabel: { flex: 1, lineHeight: 17 },
  failed: { marginTop: space.md, color: palette.negative },
  save: { marginTop: space.lg },
});
