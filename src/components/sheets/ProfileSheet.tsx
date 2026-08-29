import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge, Chip, Divider, SettingRow } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { ReportSheet } from '@/components/sheets/ReportSheet';
import { alpha, palette, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { explain, match } from '@/ai/matching';
import { BAND_LABEL, DISTANCE_LABEL, type MatchBand } from '@/chain/midnight/types';
import { maskFor, SELF_VECTOR, VECTORS, type Person } from '@/data/people';

/**
 * A person's profile, as a sheet.
 *
 * The reference presents this as something that rises over the screen you were
 * already on rather than as a destination you navigate to, and that is the right
 * model: you are glancing at someone while still holding your place on the map.
 * A pushed route would lose that context and cost a back-navigation to recover.
 *
 * The compatibility block is the AI-track argument in miniature - the score is
 * computed here, on this device, from two vectors neither the server nor the
 * peer ever sees, and the drivers listed are the literal terms that produced it.
 */

export type ProfileSheetProps = {
  person: Person | null;
  visible: boolean;
  onClose: () => void;
  /** Consent mask of the signed-in user. */
  mask: number[];
  onWink?: (personId: string) => void;
  onProveMatch?: (personId: string, band: MatchBand) => void;
  winking?: boolean;
  proving?: boolean;
};

export function ProfileSheet({
  person,
  visible,
  onClose,
  mask,
  onWink,
  onProveMatch,
  winking = false,
  proving = false,
}: ProfileSheetProps) {
  const [reporting, setReporting] = useState(false);

  const result = useMemo(() => {
    if (!person) return null;
    const peerVector = VECTORS.get(person.id);
    if (!peerVector) return null;
    return match(SELF_VECTOR, peerVector, mask, maskFor(person));
  }, [person, mask]);

  const close = useCallback(() => {
    setReporting(false);
    onClose();
  }, [onClose]);

  if (!person) return null;

  return (
    <>
      <BottomSheet
        visible={visible && !reporting}
        onClose={close}
        scrollable
        footer={
          <MetalButton
            label="Send wink"
            variant="light"
            size="lg"
            fullWidth
            loading={winking}
            onPress={() => onWink?.(person.id)}
          />
        }
      >
        <View style={styles.hero}>
          <Avatar email={person.email} size={112} online={person.online} />
          <Text style={[type.title1, styles.name]}>
            {person.name}, {person.age}
          </Text>
          <Text style={[type.bodyLight, styles.bio]}>{person.bio}</Text>

          {/* The area, not the address. This chip is the entire disclosure. */}
          <View style={styles.area}>
            <Icon name="pin" size={14} color={alpha.t56} />
            <Text style={[type.caption, styles.areaLabel]}>
              {DISTANCE_LABEL[person.bucket]} · exact position withheld
            </Text>
          </View>
        </View>

        {result ? (
          <View style={styles.matchBlock}>
            <View style={styles.matchHead}>
              <Icon name="sparkle" size={17} color={palette.violet} />
              <Text style={[type.calloutStrong, styles.matchTitle]}>
                {BAND_LABEL[result.band]}
              </Text>
              <Badge label={`Band ${result.band}/4`} tone="violet" />
            </View>
            <Text style={[type.caption, styles.matchExplain]}>{explain(result)}</Text>

            {result.band === 0 ? (
              <Text style={[type.caption, styles.noProof]}>
                Not enough shared signal to prove a match — the circuit would refuse.
              </Text>
            ) : (
              <MetalButton
                label={`Prove band ${result.band}`}
                variant="violet"
                size="sm"
                fullWidth
                loading={proving}
                onPress={() => onProveMatch?.(person.id, result.band)}
                style={styles.matchAction}
              />
            )}
          </View>
        ) : null}

        <Text style={[type.calloutStrong, styles.sectionLabel]}>Interests</Text>
        <View style={styles.tags}>
          {person.tags.map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </View>

        <Divider style={styles.divider} />

        <View style={styles.actions}>
          <SettingRow
            icon="eye-off"
            title="Hide user"
            subtitle="They stop appearing on your map"
          />
          <SettingRow
            icon="block"
            title="Block user"
            subtitle="No proofs will be exchanged either way"
          />
          <SettingRow
            icon="flag"
            title="Report user"
            subtitle="Anonymous — bound to their personhood handle"
            tone="negative"
            onPress={() => setReporting(true)}
          />
        </View>
      </BottomSheet>

      <ReportSheet
        person={person}
        visible={reporting}
        onClose={() => setReporting(false)}
        onSubmitted={close}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: space.sm },
  name: { marginTop: space.lg },
  bio: { marginTop: space.md, textAlign: 'center' },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
  },
  areaLabel: { marginLeft: 6, color: alpha.t56 },

  matchBlock: {
    marginTop: space['2xl'],
    padding: space.lg,
    borderRadius: 18,
    backgroundColor: 'rgba(168,85,247,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,85,247,0.24)',
  },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  matchTitle: { flex: 1 },
  matchExplain: { marginTop: space.sm, lineHeight: 18 },
  matchAction: { marginTop: space.lg },
  noProof: { marginTop: space.md, lineHeight: 17 },

  sectionLabel: { marginTop: space['2xl'], marginBottom: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  divider: { marginVertical: space.xl },
  actions: { gap: space.sm },
});
