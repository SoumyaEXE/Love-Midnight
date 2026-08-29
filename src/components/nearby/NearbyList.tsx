import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, PressableCard } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { formatDistance } from '@/firebase/geo';
import type { NearbyUser } from '@/firebase/types';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';

/**
 * People discovered through the realtime index, drawn as the roster is drawn.
 *
 * Same card, same avatar, same badge vocabulary as the proved list below it -
 * a second visual language for "people near you" would suggest these are a
 * different kind of thing, and they are not. What differs is the badge: the
 * roster shows the *bucket someone proved*, this shows how far away they
 * actually are, because these positions are measured rather than attested.
 *
 * What is never shown is a coordinate, and there is no coordinate to show: the
 * position behind these rows was snapped to a 250 m grid before it was
 * published. So a row says a city and a distance band - "Kolkata, West Bengal ·
 * 2.5 km away" - which is the most precise statement the underlying data can
 * actually support.
 */

export type NearbyListProps = {
  users: NearbyUser[];
  loading: boolean;
  error: string | null;
  /** False when discovery cannot run at all - see the empty copy below. */
  active: boolean;
  sharing: boolean;
  radiusLabel: string;
  onOpen: (user: NearbyUser) => void;
  onEnableSharing: () => void;
};

export function NearbyList({
  users,
  loading,
  error,
  active,
  sharing,
  radiusLabel,
  onOpen,
  onEnableSharing,
}: NearbyListProps) {
  if (!sharing) {
    return (
      <Empty
        icon="broadcast"
        title="Location sharing is off"
        body="Nobody can find you, and you cannot find anyone. Turn broadcasting on to see who is nearby."
        action={{ label: 'Turn on broadcasting', onPress: onEnableSharing }}
      />
    );
  }

  if (error) {
    return <Empty icon="sad" title="Discovery unavailable" body={error} />;
  }

  if (!active || loading) {
    return (
      <View style={styles.pending}>
        <ActivityIndicator color={palette.violet} />
        <Text style={[type.caption, styles.pendingLabel]}>
          {active ? 'Looking around you…' : 'Waiting for a location fix…'}
        </Text>
      </View>
    );
  }

  if (users.length === 0) {
    return (
      <Empty
        icon="radar"
        title={`Nobody within ${radiusLabel}`}
        body="Verified people sharing their location will appear here as they come into range. Widen your radius in Privacy & Safety."
      />
    );
  }

  return (
    <View style={styles.list}>
      {users.map((user) => (
        <PressableCard
          key={user.wallet}
          radius={radii.lg}
          style={styles.row}
          accessibilityLabel={`Message ${user.profile.name}, ${formatDistance(user.distance)}`}
          onPress={() => onOpen(user)}
        >
          <Avatar email={user.profile.avatar} size={48} online={user.online} />
          <View style={styles.rowText}>
            <Text style={type.body} numberOfLines={1}>
              {user.profile.name}
              {user.profile.age ? `, ${user.profile.age}` : ''}
            </Text>
            {/* Place before distance: "where" is the thing a person reads
                first, and a city is all this app will ever say about it. */}
            <Text style={[type.caption, styles.rowSub]} numberOfLines={1}>
              {user.place ? `${user.place} · ` : ''}
              {formatDistance(user.distance)}
            </Text>
            {user.profile.interests?.length ? (
              <Text style={[type.caption, styles.rowTags]} numberOfLines={1}>
                {user.profile.interests.slice(0, 3).join(' · ')}
              </Text>
            ) : null}
            <Badge label="Verified 18+" tone="metal" icon="verified" style={styles.rowBadge} />
          </View>
          <Icon name="chevron-right" size={18} color={alpha.t28} />
        </PressableCard>
      ))}
    </View>
  );
}

function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: 'radar' | 'broadcast' | 'sad';
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={22} color={alpha.t28} />
      <Text style={[type.calloutStrong, styles.emptyTitle]}>{title}</Text>
      <Text style={[type.caption, styles.emptyBody]}>{body}</Text>
      {action ? (
        <Text
          style={[type.captionStrong, styles.emptyAction]}
          accessibilityRole="button"
          onPress={action.onPress}
        >
          {action.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowText: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  rowSub: { marginTop: 2, color: alpha.t72 },
  rowTags: { marginTop: 1 },
  rowBadge: { marginTop: 7 },

  pending: { alignItems: 'center', paddingVertical: space['2xl'], gap: space.md },
  pendingLabel: { color: alpha.t38 },

  empty: { alignItems: 'center', paddingVertical: space['2xl'], paddingHorizontal: space.lg },
  emptyTitle: { marginTop: space.md },
  emptyBody: { marginTop: space.xs, textAlign: 'center', lineHeight: 18 },
  emptyAction: { marginTop: space.lg, color: palette.violet },
});
