import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, PressableCard } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { formatDistance } from '@/firebase/geo';
import type { NearbyBlocker } from '@/hooks/useNearbyUsers';
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
  /** What is missing, when discovery is not running. Drives the copy. */
  blocker?: NearbyBlocker;
  /** Opens the wallet connection flow. Shown only for `no-wallet`. */
  onConnectWallet?: () => void;
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
  blocker = 'none',
  sharing,
  radiusLabel,
  onOpen,
  onEnableSharing,
  onConnectWallet,
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

  /*
   * A stalled state names what is actually missing.
   *
   * Only `no-fix` and `claiming` are genuinely transient - the rest need the
   * user to do something, and a spinner over them is a promise that resolves
   * on its own, which these do not. A wallet in particular never arrives by
   * waiting: nothing in this app connects one on the user's behalf.
   */
  if (blocker === 'no-wallet') {
    return (
      <Empty
        icon="broadcast"
        title="No wallet connected"
        body="Discovery is keyed to your wallet address - it is what the database binds your profile, position and messages to. Connect one to appear on the map and to see who is nearby."
        action={
          onConnectWallet
            ? { label: 'Connect wallet', onPress: onConnectWallet }
            : undefined
        }
      />
    );
  }

  if (!active || loading) {
    const label =
      blocker === 'claiming'
        ? 'Registering your wallet…'
        : blocker === 'no-fix'
          ? 'Waiting for a location fix…'
          : 'Looking around you…';
    return (
      <View style={styles.pending}>
        <ActivityIndicator color={palette.violet} />
        <Text style={[type.caption, styles.pendingLabel]}>{label}</Text>
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
              {' · '}
              {presenceLabel(user.online, user.lastSeen)}
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

/**
 * "Active now", or how long ago they were.
 *
 * Driven by the `presence/{wallet}` record, which the server maintains through
 * an armed `onDisconnect` - so "active now" means a socket is genuinely open,
 * not that a client claimed to be online on its way out and then crashed.
 *
 * Coarse on purpose, and increasingly coarse with age. A precise "last seen
 * 3 minutes ago" is a surprisingly strong signal about somebody's routine when
 * it is sampled repeatedly, and none of the value here needs that resolution.
 */
function presenceLabel(online: boolean, lastSeen: number): string {
  if (online) return 'Active now';
  if (!lastSeen) return 'Offline';

  const minutes = Math.floor((Date.now() - lastSeen) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
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
