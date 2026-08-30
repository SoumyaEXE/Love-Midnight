import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { BandMeter, Chip, Divider, SettingRow, StatRow } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { ReportSheet } from '@/components/sheets/ReportSheet';
import { alpha, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { match } from '@/ai/matching';
import { BAND_LABEL, DISTANCE_LABEL, type MatchBand } from '@/chain/midnight/types';
import { maskFor, VECTORS, type Person } from '@/data/people';

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
 *
 * It is stated as figures rather than as a sentence. The sheet is glanced at,
 * not read, and a band and two counts survive a glance in a way that a line of
 * prose does not.
 */

export type ProfileSheetProps = {
  person: Person | null;
  visible: boolean;
  onClose: () => void;
  /** Consent mask of the signed-in user. */
  mask: number[];
  /** The signed-in user's interest vector. Scored here, on this device. */
  selfVector: number[];
  onWink?: (personId: string) => void;
  onProveMatch?: (personId: string, band: MatchBand) => void;
  winking?: boolean;
  proving?: boolean;
  /**
   * Present when this card is a real discovered account rather than a roster
   * persona, and it changes what the footer can offer.
   *
   * The roster's actions are proofs - `proveProximity` and `proveMatch` run
   * Midnight circuits keyed on a roster id, against fixtures with known
   * vectors. A discovered user has a wallet and no circuit input, so those
   * buttons would fail on a lookup rather than do anything. What a real account
   * supports instead is the consent flow: ask, then talk.
   */
  remote?: {
    /** `null` when no request exists yet, which is what permits sending one. */
    status: 'none' | 'pending' | 'declined' | 'connected';
    onRequest: () => void;
    onMessage: () => void;
    busy?: boolean;
  };
};

const REMOTE_LABEL: Record<'none' | 'pending' | 'declined' | 'connected', string> = {
  none: 'Send request',
  pending: 'Request sent',
  declined: 'Request declined',
  connected: 'Message',
};

export function ProfileSheet({
  person,
  visible,
  onClose,
  mask,
  selfVector,
  onWink,
  onProveMatch,
  remote,
  winking = false,
  proving = false,
}: ProfileSheetProps) {
  const [reporting, setReporting] = useState(false);

  const result = useMemo(() => {
    if (!person) return null;
    const peerVector = VECTORS.get(person.id);
    if (!peerVector) return null;
    return match(selfVector, peerVector, mask, maskFor(person));
  }, [person, mask, selfVector]);

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
          remote ? (
            <MetalButton
              label={REMOTE_LABEL[remote.status]}
              variant="light"
              size="lg"
              fullWidth
              loading={remote.busy}
              // Both terminal-for-the-sender states. The rules admit a
              // *create* and not an overwrite, so re-pressing either would
              // only produce a permission error.
              disabled={remote.status === 'declined' || remote.status === 'pending'}
              onPress={remote.status === 'connected' ? remote.onMessage : remote.onRequest}
            />
          ) : (
            <MetalButton
              label="Send wink"
              variant="light"
              size="lg"
              fullWidth
              loading={winking}
              onPress={() => onWink?.(person.id)}
            />
          )
        }
      >
        <View style={styles.hero}>
          <Avatar email={person.email} size={92} online={person.online} />
          <Text style={[type.title1, styles.name]}>
            {/* A published profile may withhold age, which arrives here as 0.
                Rendering "Name, 0" would be worse than rendering the name. */}
            {person.age > 0 ? `${person.name}, ${person.age}` : person.name}
          </Text>
          <Text style={[type.bodyLight, styles.bio]}>{person.bio}</Text>

          {/* The area, not the address. This chip is the entire disclosure. */}
          <View style={styles.area}>
            <Icon name="pin" size={14} color={alpha.t56} />
            <Text style={[type.caption, styles.areaLabel]}>
              {DISTANCE_LABEL[person.bucket]} · position withheld
            </Text>
          </View>
        </View>

        {result ? (
          <View style={styles.matchBlock}>
            <View style={styles.matchHead}>
              <View style={styles.matchHeadText}>
                <Text style={type.eyebrow}>Compatibility</Text>
                <Text style={[type.title3, styles.matchTitle]}>{BAND_LABEL[result.band]}</Text>
              </View>
              <BandMeter value={result.band} />
            </View>
            <StatRow
              style={styles.matchStats}
              items={[
                { value: `${result.band}/4`, label: 'Band', tone: 'violet' },
                { value: String(result.drivers.length), label: 'Signals' },
                { value: String(result.withheld.length), label: 'Closed', tone: 'muted' },
              ]}
            />

            {result.drivers.length ? (
              <View style={styles.driverTags}>
                {result.drivers.slice(0, 3).map((driver) => (
                  <Chip key={driver.dimension} label={driver.dimension} />
                ))}
              </View>
            ) : null}

            {result.band === 0 ? (
              <Text style={[type.caption, styles.noProof]}>
                Not enough shared signal. The circuit would refuse.
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
            subtitle="Stops appearing on your map"
          />
          <SettingRow
            icon="block"
            title="Block user"
            subtitle="No proofs either way"
          />
          <SettingRow
            icon="flag"
            title="Report user"
            subtitle="Anonymous, bound to their handle"
            tone="negative"
            onPress={() => setReporting(true)}
          />
        </View>
      </BottomSheet>

      {/* Mounted on demand. Two Modals standing by for every profile is two
          native containers to present, and that cost lands on the open. */}
      {reporting ? (
        <ReportSheet
          person={person}
          visible={reporting}
          onClose={() => setReporting(false)}
          onSubmitted={close}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center' },
  name: { marginTop: space.md },
  bio: { marginTop: space.sm, textAlign: 'center', lineHeight: 20 },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
  },
  areaLabel: { marginLeft: 6, color: alpha.t56 },

  // Neutral, like every other block on the sheet. The violet wash made this
  // one panel shout for attention it had not earned; the accent now lives only
  // where it carries meaning, on the meter and on the action.
  matchBlock: {
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  matchHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  matchHeadText: { flex: 1 },
  matchTitle: { marginTop: 5 },
  matchStats: { marginTop: space.lg },
  driverTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.lg },
  matchAction: { marginTop: space.lg },
  noProof: { marginTop: space.md, lineHeight: 17 },

  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  divider: { marginVertical: space.lg },
  actions: { gap: space.sm },
});
