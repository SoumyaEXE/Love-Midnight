import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { Icon, type IconName } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { fontFamily, type } from '@/theme/typography';
import type { Person } from '@/data/people';

/**
 * Report a user.
 *
 * The privacy note in the header is load-bearing rather than reassuring
 * boilerplate: a report is filed against the subject's *personhood handle* -
 * the nullifier from the credential circuit - so moderation can ban an actual
 * person across reinstalls and new accounts without anyone, operator included,
 * learning who they are. That is a property a conventional report flow cannot
 * offer, and it is worth saying on the screen where it applies.
 */

export type ReportReason = {
  id: string;
  icon: IconName;
  title: string;
  detail: string;
};

const REASONS: ReportReason[] = [
  {
    id: 'messages',
    icon: 'sad',
    title: 'Inappropriate messages',
    detail: 'Harassment, insults or offensive content',
  },
  {
    id: 'fake',
    icon: 'user-x',
    title: 'Fake profile',
    detail: 'This user is pretending to be someone else',
  },
  {
    id: 'spam',
    icon: 'percent',
    title: 'Spam or scams',
    detail: 'Advertisement, spam or a financial scam',
  },
  {
    id: 'underage',
    icon: 'eighteen',
    title: 'Underage',
    detail: 'This user is under 18 years old',
  },
  { id: 'other', icon: 'dots', title: 'Other', detail: 'Something else' },
];

export type ReportSheetProps = {
  person: Person | null;
  visible: boolean;
  onClose: () => void;
  onSubmitted?: (report: { personId: string; reason: string; details: string }) => void;
};

export function ReportSheet({ person, visible, onClose, onSubmitted }: ReportSheetProps) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  // Reset on open, so a cancelled report does not persist into the next one.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setSending(false);
    }
  }, [visible]);

  const submit = useCallback(async () => {
    if (!person || !reason) return;
    setSending(true);
    // Stands in for the moderation call. The payload deliberately carries the
    // handle rather than the profile: see `bar()` in credential.compact.
    await new Promise((resolve) => setTimeout(resolve, 700));
    onSubmitted?.({ personId: person.id, reason, details: details.trim() });
    setSending(false);
    onClose();
  }, [person, reason, details, onSubmitted, onClose]);

  if (!person) return null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      scrollable
      footer={
        <>
          <MetalButton
            label="Cancel"
            variant="metal"
            size="lg"
            onPress={onClose}
            style={styles.action}
          />
          <MetalButton
            label="Send report"
            variant="light"
            size="lg"
            disabled={!reason}
            loading={sending}
            onPress={() => void submit()}
            style={styles.action}
          />
        </>
      }
    >
      <View style={styles.head}>
        <Avatar email={person.email} size={64} />
        <Text style={[type.title3, styles.name]}>
          {person.name}, {person.age}
        </Text>
        <Text style={[type.callout, styles.blurb]}>
          Let us know why you’re reporting this user. Your report is anonymous — it is filed
          against their personhood handle, not their profile.
        </Text>
      </View>

      <View style={styles.reasons}>
        {REASONS.map((option) => {
          const selected = reason === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.title}
              onPress={() => setReason(option.id)}
              style={[styles.reason, selected && styles.reasonSelected]}
            >
              <Icon
                name={option.icon}
                size={20}
                color={selected ? palette.violet : alpha.t38}
              />
              <View style={styles.reasonText}>
                <Text style={type.body}>{option.title}</Text>
                <Text style={[type.caption, styles.reasonDetail]}>{option.detail}</Text>
              </View>
              {selected ? <Icon name="check" size={17} color={palette.violet} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={[type.caption, styles.detailsLabel]}>Additional details (optional)</Text>
      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Add any extra information"
        placeholderTextColor={alpha.t38}
        style={styles.input}
        multiline
        maxLength={500}
        accessibilityLabel="Additional details"
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: space.sm },
  name: { marginTop: space.md },
  blurb: { marginTop: space.sm, textAlign: 'center', lineHeight: 19 },

  reasons: { marginTop: space['2xl'], gap: space.sm },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  reasonSelected: {
    backgroundColor: 'rgba(168,85,247,0.16)',
    borderColor: 'rgba(168,85,247,0.42)',
  },
  reasonText: { flex: 1, marginHorizontal: space.md },
  reasonDetail: { marginTop: 2 },

  detailsLabel: { marginTop: space.xl, marginBottom: space.sm },
  input: {
    minHeight: 84,
    padding: space.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
    color: palette.white,
    fontFamily: fontFamily.light,
    fontSize: 15,
    textAlignVertical: 'top',
  },

  action: { flex: 1 },
});
