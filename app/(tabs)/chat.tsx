import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton, PressableCard, ScreenHeader } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, layout, palette, radius as radii, space } from '@/theme/tokens';
import { fontFamily, type } from '@/theme/typography';
import { CONVERSATIONS, PEOPLE_BY_ID } from '@/data/people';

/** Conversation list. Unread rows carry the violet wash from the comps. */
export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return CONVERSATIONS;
    return CONVERSATIONS.filter((c) => {
      const person = PEOPLE_BY_ID.get(c.personId);
      return (
        person?.name.toLowerCase().includes(needle) || c.preview.toLowerCase().includes(needle)
      );
    });
  }, [query]);

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

        <View style={styles.list}>
          {results.map((conversation, index) => {
            const person = PEOPLE_BY_ID.get(conversation.personId);
            if (!person) return null;

            return (
              <Animated.View
                key={conversation.personId}
                entering={FadeInDown.delay(index * 45).duration(360)}
              >
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
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
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
});
