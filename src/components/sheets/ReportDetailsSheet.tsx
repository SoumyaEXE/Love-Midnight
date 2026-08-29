import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Divider } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { PEOPLE_BY_ID } from '@/data/people';
import { DISTANCE_LABEL, type DistanceBucket } from '@/chain/midnight/types';

/**
 * A filed report, read back.
 *
 * Note what the record does *not* contain: the reported user's identity. The
 * report is bound to their personhood handle, so this screen can show you what
 * you filed and let moderation act on it, while nobody in the chain learns who
 * the account belongs to. The Report ID is the only handle you need to follow
 * it up.
 */

export type FiledReport = {
  id: string;
  personId: string;
  reasonTitle: string;
  reasonDetail: string;
  reasonIcon: IconName;
  submitted: string;
  details?: string;
};

export type ReportDetailsSheetProps = {
  report: FiledReport | null;
  visible: boolean;
  onClose: () => void;
};

export function ReportDetailsSheet({ report, visible, onClose }: ReportDetailsSheetProps) {
  if (!report) return null;
  const person = PEOPLE_BY_ID.get(report.personId);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Report details" scrollable>
      {person ? (
        <View style={styles.head}>
          <Avatar email={person.email} size={92} />
          <Text style={[type.title2, styles.name]}>
            {person.name}, {person.age}
          </Text>
          <View style={styles.area}>
            <Icon name="pin" size={13} color={alpha.t56} />
            <Text style={[type.caption, styles.areaLabel]}>
              {DISTANCE_LABEL[person.bucket as DistanceBucket]} area
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={[type.caption, styles.label]}>Reason</Text>
      <View style={styles.reason}>
        <Icon name={report.reasonIcon} size={20} color={palette.violet} />
        <View style={styles.reasonText}>
          <Text style={type.body}>{report.reasonTitle}</Text>
          <Text style={[type.caption, styles.reasonDetail]}>{report.reasonDetail}</Text>
        </View>
      </View>

      <Text style={[type.caption, styles.label]}>Details</Text>
      <View style={styles.details}>
        <Field label="Submitted" value={report.submitted} />
        <Divider style={styles.divider} />
        <Field
          label="Additional information"
          value={report.details?.length ? report.details : 'No additional information'}
        />
        <Divider style={styles.divider} />
        <Field label="Report ID" value={report.id} mono />
      </View>
    </BottomSheet>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={[type.caption, styles.fieldLabel]}>{label}:</Text>
      <Text style={mono ? type.digest : type.calloutStrong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: space.sm },
  name: { marginTop: space.lg },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
  },
  areaLabel: { marginLeft: 5, color: alpha.t56 },

  label: { marginTop: space['2xl'], marginBottom: space.sm },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  reasonText: { flex: 1, marginLeft: space.md },
  reasonDetail: { marginTop: 2 },

  details: {
    padding: space.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  field: { gap: 4 },
  fieldLabel: {},
  divider: { marginVertical: space.md },
});
