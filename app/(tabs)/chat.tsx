import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton, PressableCard, ScreenHeader } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, layout, palette, radius as radii, space } from '@/theme/tokens';
import { fontFamily, type } from '@/theme/typography';
import { CONVERSATIONS, PEOPLE_BY_ID } from '@/data/people';
import { useConversations } from '@/hooks/useConversations';
import { demoKey, demoPersonId } from '@/firebase/paths';

/**
 * Conversation list. Unread rows carry the violet wash from the comps.
 *
 * Two sources, kept apart on purpose. The live section is backed by the
 * `userConversations` index - one subscription, updating in place as messages
 * land - and the section below it is the demo roster the rest of the app
 * already ships. Merging them into one list would mean sorting a real
 * timestamp against the string "Yesterday".
 */
export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const live = useConversations();

  const needle = query.trim().toLowerCase();

  /**
   * Roster rows that have not become real conversations yet.
   *
   * Once a message has actually been sent to a persona, the conversation is in
   * the database and appears in the live section above with a real last line
   * and a real timestamp. Leaving the scripted row in place as well would show
   * the same person twice, disagreeing with itself about what was last said.
   */
  const started = useMemo(
    () => new Set(live.rows.map((row) => row.otherUserId)),
    [live.rows],
  );

  const results = useMemo(() => {
    return CONVERSATIONS.filter((c) => {
      if (started.has(demoKey(c.personId))) return false;
      if (!needle) return true;
      const person = PEOPLE_BY_ID.get(c.personId);
      return (
        person?.name.toLowerCase().includes(needle) || c.preview.toLowerCase().includes(needle)
      );
    });
  }, [needle, started]);

  const liveRows = useMemo(() => {
    if (!needle) return live.rows;
    return live.rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        (row.lastMessage ?? '').toLowerCase().includes(needle),
    );
  }, [live.rows, needle]);

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.7} origin={1.15} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingBottom: layout.tabBarHeight + insets.bottom + space['4xl'],
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Chat" />

        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Icon name="search" size={17} color={alpha.t38} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={alpha.t38}
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search chats"
            />
          </View>
          <IconButton name="sliders" accessibilityLabel="Filter chats" style={styles.searchFilter} />
        </View>

        {liveRows.length > 0 ? (
          <>
            <Text style={[type.eyebrow, styles.sectionLabel]}>Messages</Text>
            <View style={styles.list}>
              {liveRows.map((row) => (
                <PressableCard
                  key={row.id}
                  radius={radii.lg}
                  active={row.unreadCount > 0}
                  style={styles.row}
                  accessibilityLabel={
                    row.unreadCount > 0
                      ? `Chat with ${row.name}, ${row.unreadCount} unread`
                      : `Chat with ${row.name}`
                  }
                  // A roster conversation routes by its roster id, so the
                  // screen can resolve the persona and its scripted opening.
                  onPress={() =>
                    router.push(`/chat/${demoPersonId(row.otherUserId) ?? row.otherUserId}`)
                  }
                >
                  <Avatar
                    email={row.avatar ?? row.otherUserId}
                    size={44}
                    online={row.online}
                  />
                  <View style={styles.rowText}>
                    <Text style={type.body} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text
                      style={[type.callout, row.unreadCount > 0 && styles.previewUnread]}
                      numberOfLines={1}
                    >
                      {row.lastMessage || 'No messages yet'}
                    </Text>
                  </View>
                  <View style={styles.rowMeta}>
                    <Text style={[type.micro, styles.rowTime]}>
                      {formatWhen(row.lastMessageTimestamp)}
                    </Text>
                    {row.unreadCount > 0 ? (
                      <View style={styles.unread}>
                        <Text style={styles.unreadLabel} numberOfLines={1}>
                          {row.unreadCount > 9 ? '9+' : row.unreadCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </PressableCard>
              ))}
            </View>
          </>
        ) : null}

        {liveRows.length > 0 ? (
          <Text style={[type.eyebrow, styles.sectionLabel]}>Demo roster</Text>
        ) : null}

        <View style={styles.list}>
          {results.map((conversation) => {
            const person = PEOPLE_BY_ID.get(conversation.personId);
            if (!person) return null;

            return (
              <View key={conversation.personId}>
                <PressableCard
                  radius={radii.lg}
                  active={conversation.unread}
                  style={styles.row}
                  accessibilityLabel={`Chat with ${person.name}`}
                  onPress={() => router.push(`/chat/${person.id}`)}
                >
                  <Avatar email={person.email} size={44} online={person.online} />
                  <View style={styles.rowText}>
                    <Text style={type.body} numberOfLines={1}>
                      {person.name}
                    </Text>
                    <Text
                      style={[type.callout, conversation.unread && styles.previewUnread]}
                      numberOfLines={1}
                    >
                      {conversation.preview}
                    </Text>
                  </View>
                  <Text style={[type.micro, styles.rowTime]}>{conversation.at}</Text>
                </PressableCard>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <ScrollScrim />
    </View>
  );
}

/** `09:41` today, `Tue` this week, `12 Mar` beyond it. */
function formatWhen(timestamp: number): string {
  if (!timestamp) return '';

  const then = new Date(timestamp);
  const elapsed = Date.now() - timestamp;

  if (elapsed < 24 * 3600_000) {
    return then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (elapsed < 7 * 24 * 3600_000) {
    return then.toLocaleDateString([], { weekday: 'short' });
  }
  return then.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  searchInput: {
    flex: 1,
    marginLeft: space.sm,
    color: palette.white,
    fontFamily: fontFamily.light,
    fontSize: 15,
    // Android centres single-line inputs oddly without this.
    paddingVertical: 0,
  },
  searchFilter: { alignSelf: 'center' },

  list: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowText: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  previewUnread: { color: alpha.t90 },
  rowTime: { color: alpha.t38 },

  sectionLabel: { marginTop: space['2xl'], marginHorizontal: space.xl },
  rowMeta: { alignItems: 'flex-end', gap: 6 },
  unread: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.violet,
  },
  unreadLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: palette.white,
  },
});
