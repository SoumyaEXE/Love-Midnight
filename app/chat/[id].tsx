import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { LiquidGlass } from '@/components/glass/LiquidGlass';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/primitives';
import { useKeyboardInset } from '@/components/ui/keyboard';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, shadow, space } from '@/theme/tokens';
import { fontFamily, type } from '@/theme/typography';
import { PEOPLE_BY_ID, THREADS, type Message } from '@/data/people';
import { useChat } from '@/hooks/useChat';
import { usePresence } from '@/hooks/usePresence';
import { useRemoteProfile } from '@/hooks/useRemoteProfile';
import { useHalo } from '@/state/store';
import { demoKey, demoPersonId, walletKey } from '@/firebase/paths';

/**
 * Conversation.
 *
 * The route parameter is either a roster id or a wallet address, and which one
 * it is decides where the messages come from: the demo thread for the former,
 * the realtime conversation node for the latter. Everything below that fork -
 * bubbles, composer, keyboard handling - is shared, because the two differ in
 * their source and in nothing a reader of the screen should care about.
 *
 * The call-permission banner from the comps is parked - see the commented
 * block below the thread for what it was and why it is not on screen.
 *
 * The composer tracks the keyboard through `useKeyboardInset` rather than a
 * `KeyboardAvoidingView`. That component leans on the window resizing under
 * Android's `adjustResize`, which stops happening once an app goes edge-to-edge
 * as this one does - so the field it is meant to lift ends up underneath the
 * keys, which is exactly where a message composer must never be.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { wallet: walletState } = useHalo();

  // Accepts either form of roster route - the bare id the tab bar and roster
  // screens use, and the `demo_` key a stored conversation carries - so a link
  // from either place lands on the same screen with the persona resolved.
  const person = id ? (PEOPLE_BY_ID.get(id) ?? PEOPLE_BY_ID.get(demoPersonId(id) ?? '')) : null;

  /**
   * The counterpart's database key, whoever they are.
   *
   * Both kinds of conversation store their messages the same way. A roster
   * persona has no wallet, so it gets a reserved `demo_` key - what matters is
   * that a message the user typed is written to the database and is still there
   * tomorrow, and that there is one storage path rather than one that persists
   * and one that quietly does not.
   */
  const counterpart = person ? demoKey(person.id) : (id ?? null);

  const chat = useChat(counterpart);
  // Only a real account has a published card or a presence record to read.
  const { profile: remoteProfile } = useRemoteProfile(person ? null : counterpart);
  const { label: presenceLabel } = usePresence(person ? null : counterpart);

  const [draft, setDraft] = useState('');
  // The composer already pads by the safe-area inset, so the keyboard only
  // owes the difference.
  const keyboardInset = useKeyboardInset(insets.bottom);

  const selfKey =
    walletState.status === 'connected' && walletState.address
      ? walletKey(walletState.address)
      : null;

  /**
   * The thread: fixture messages first, stored messages after.
   *
   * The roster's opening lines are scripted - they are what the comps show, and
   * the personas behind them have no session to send anything. They cannot be
   * seeded into the database either: the rules require a message's `senderId`
   * to be the caller's own wallet, which is exactly the check that stops one
   * account writing words into another's mouth, and it should not be weakened
   * to make a fixture look real. So they render as a read-only prelude, and
   * everything the user actually sends lives in the database underneath.
   */
  const seeded: Message[] = person
    ? (THREADS[person.id] ?? []).map((message) => ({ ...message, id: `seed-${message.id}` }))
    : [];

  const stored: Message[] = chat.messages.map((message) => ({
    id: message.id,
    from: message.senderId === selfKey ? 'me' : 'them',
    body: message.text,
    at: new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  const messages: Message[] = [...seeded, ...stored];

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body) return;

    setDraft('');
    // Optimism is left to the database: the write echoes back through the same
    // `onChildAdded` listener every other client receives, so the bubble that
    // appears is the message that actually landed rather than a local guess
    // that has to be reconciled if the write is refused.
    void chat.send(body);

    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [draft, chat]);

  const title = person?.name ?? remoteProfile?.name ?? 'Nearby';
  const avatarKey = person?.email ?? remoteProfile?.avatar ?? counterpart ?? '';

  if (!counterpart) {
    return (
      <View style={styles.root}>
        <GlowBackdrop intensity={0.6} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.85} origin={1.04} crown={false} />

      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <IconButton name="chevron-left" accessibilityLabel="Back" onPress={() => router.back()} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}'s profile`}
          disabled={!person}
          onPress={person ? () => router.push(`/person/${person.id}`) : undefined}
          style={styles.headerTitle}
        >
          <Text style={type.title3}>{title}</Text>
          {/* Presence only for real conversations - the roster's `online` flag
              is a fixture, and dressing it up as live status would be a lie
              told in the one place the app is claiming to be realtime. */}
          {person ? null : (
            <Text style={[type.micro, styles.headerPresence]}>{presenceLabel}</Text>
          )}
        </Pressable>
        <View style={styles.headerActions}>
          <IconButton name="search" accessibilityLabel="Search conversation" />
          <IconButton name="dots" accessibilityLabel="Conversation options" />
        </View>
      </View>

      <Animated.View style={[styles.flex, keyboardInset]}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          // The keyboard shrinks this view from the bottom, and a shrinking
          // scroll view keeps its offset - so without this the last message
          // slides out of sight the moment someone taps the composer.
          onLayout={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <Text style={[type.micro, styles.day]}>
            Today, {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>

          {chat.loading && messages.length === 0 ? (
            <ActivityIndicator color={palette.violet} style={styles.loading} />
          ) : null}

          {!chat.loading && messages.length === 0 ? (
            <Text style={[type.caption, styles.emptyThread]}>
              No messages yet. Say something.
            </Text>
          ) : null}

          {messages.map((message, index) => (
            <Animated.View
              key={message.id}
              entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(300)}
              style={[styles.bubbleRow, message.from === 'me' && styles.bubbleRowMine]}
            >
              {message.from === 'them' ? (
                <Avatar email={avatarKey} size={30} style={styles.bubbleAvatar} />
              ) : null}

              <View style={styles.bubbleGroup}>
                {message.from === 'me' ? (
                  <LinearGradient
                    colors={['#D243E8', '#A62BE0']}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={[styles.bubble, styles.bubbleMine]}
                  >
                    <Text style={styles.bubbleText}>{message.body}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.bubbleTheirs]}>
                    <Text style={styles.bubbleText}>{message.body}</Text>
                  </View>
                )}
                <Text
                  style={[type.micro, styles.time, message.from === 'me' && styles.timeMine]}
                >
                  {message.at}
                </Text>
              </View>
            </Animated.View>
          ))}
        </ScrollView>

        {/* Call permission, parked.

            It is the clearest illustration of the consent model in an ordinary
            place - escalating to voice needs a fresh `attestAdult` from both
            sides, so the capability is gated by a circuit rather than by a
            server flag - but it sits between the thread and the composer with
            nothing behind it, and a banner that cannot be actioned or
            dismissed is furniture. Restore it when the call flow exists.

        <View style={styles.bannerWrap}>
          <LiquidGlass radius={radii.lg} style={styles.banner} intensity={50}>
            <Icon name="phone" size={19} color={alpha.t72} />
            <View style={styles.bannerText}>
              <Text style={type.calloutStrong}>Allow calls with {person.name}?</Text>
              <Text style={[type.caption, styles.bannerSub]}>
                Both sides re-prove adulthood. No numbers are exchanged.
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={alpha.t38} />
          </LiquidGlass>
        </View>
        */}

        {chat.error ? (
          <Text style={[type.caption, styles.sendError]}>{chat.error}</Text>
        ) : null}

        <View style={[styles.composerWrap, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.composer}>
            <Icon name="paperclip" size={19} color={alpha.t38} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={alpha.t38}
              style={styles.input}
              multiline
              onSubmitEditing={send}
              accessibilityLabel="Message"
            />
            <Icon name="smiley" size={19} color={alpha.t38} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={send}
            style={styles.send}
          >
            <Icon name="arrow-right" size={20} color={palette.void} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    gap: space.md,
  },
  headerTitle: { flex: 1 },
  headerPresence: { marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: space.sm },

  loading: { marginVertical: space.xl },
  emptyThread: { textAlign: 'center', marginVertical: space.xl },
  sendError: {
    color: palette.negative,
    textAlign: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
  },

  thread: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  day: { alignSelf: 'center', marginVertical: space.lg },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.lg },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleAvatar: { marginRight: space.sm },
  bubbleGroup: { maxWidth: '78%' },
  bubble: {
    paddingHorizontal: space.lg,
    paddingVertical: 11,
    borderRadius: radii.lg,
  },
  bubbleTheirs: {
    backgroundColor: palette.surfaceRaised,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
  },
  bubbleMine: {
    borderBottomRightRadius: 6,
    ...shadow.glowSoft,
  },
  bubbleText: {
    fontFamily: fontFamily.light,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
    color: palette.white,
  },
  time: { marginTop: 5, marginLeft: 4 },
  timeMine: { textAlign: 'right', marginRight: 4 },

  bannerWrap: { paddingHorizontal: space.xl, paddingBottom: space.md },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
  },
  bannerText: { flex: 1, marginHorizontal: space.md },
  bannerSub: { marginTop: 2 },

  composerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  composer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
    gap: space.md,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    color: palette.white,
    fontFamily: fontFamily.light,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
    ...shadow.lift,
  },
});
