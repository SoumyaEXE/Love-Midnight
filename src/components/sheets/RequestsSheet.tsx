import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { PEOPLE_BY_ID } from '@/data/people';

/**
 * Incoming contact requests.
 *
 * Accept and decline are the only two actions, rendered as equally weighted
 * circles rather than as a primary button and a muted link. Declining is not
 * the lesser choice here - it is half of a consent decision, and styling it as
 * a secondary action nudges people into contact they did not want.
 *
 * Accepting is what triggers the pairing handshake, after which both sides can
 * run the proximity and match circuits against each other. Until then neither
 * party holds anything openable about the other.
 */

export type ContactRequest = {
  personId: string;
  /** Display date, as it appears in the reference. */
  at: string;
};

export type RequestsSheetProps = {
  visible: boolean;
  onClose: () => void;
  requests: ContactRequest[];
  onResolve?: (personId: string, accepted: boolean) => void;
};

export function RequestsSheet({ visible, onClose, requests, onResolve }: RequestsSheetProps) {
  const [pending, setPending] = useState<ContactRequest[]>(requests);

  useEffect(() => {
    if (visible) setPending(requests);
  }, [visible, requests]);

  const resolve = useCallback(
    (personId: string, accepted: boolean) => {
      void Haptics.impactAsync(
        accepted ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      );
      setPending((prev) => prev.filter((r) => r.personId !== personId));
      onResolve?.(personId, accepted);
    },
    [onResolve],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Incoming requests" scrollable>
      {pending.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="check" size={22} color={palette.positive} />
          <Text style={[type.callout, styles.emptyLabel]}>Nothing waiting on you.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {pending.map((request) => {
            const person = PEOPLE_BY_ID.get(request.personId);
            if (!person) return null;

            return (
              <View key={request.personId} style={styles.row}>
                <Avatar email={person.email} size={44} online={person.online} />
                <View style={styles.rowText}>
                  <Text style={type.body} numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Text style={[type.caption, styles.rowDate]}>{request.at}</Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${person.name}`}
                  hitSlop={6}
                  onPress={() => resolve(request.personId, false)}
                  style={[styles.circle, styles.decline]}
                >
                  <Icon name="close" size={18} color={palette.white} strokeWidth={2} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Accept ${person.name}`}
                  hitSlop={6}
                  onPress={() => resolve(request.personId, true)}
                  style={[styles.circle, styles.accept]}
                >
                  <Icon name="check" size={18} color={palette.white} strokeWidth={2} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
    gap: space.sm,
  },
  rowText: { flex: 1, marginLeft: space.sm },
  rowDate: { marginTop: 2 },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decline: { backgroundColor: palette.negative },
  accept: { backgroundColor: palette.positive },

  empty: { alignItems: 'center', paddingVertical: space['3xl'], gap: space.md },
  emptyLabel: { color: alpha.t38 },
});
