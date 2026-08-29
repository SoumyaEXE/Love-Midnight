import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
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
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, shadow, space } from '@/theme/tokens';
import { fontFamily, type } from '@/theme/typography';
import { PEOPLE_BY_ID, THREADS, type Message } from '@/data/people';

/**
 * Conversation.
 *
 * The call-permission banner from the comps is kept because it is the clearest
 * example of Halo's consent model in an ordinary place: escalating to voice
 * requires a fresh `attestAdult` proof from both sides, so the capability is
 * gated by a circuit rather than by a server-side flag.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const person = id ? PEOPLE_BY_ID.get(id) : null;
  const [messages, setMessages] = useState<Message[]>(() => (id ? THREADS[id] ?? [] : []));
  const [draft, setDraft] = useState('');

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    setMessages((prev) => [
      ...prev,
      {
        id: String(prev.length + 1),
        from: 'me',
        body,
        at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setDraft('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [draft]);

  if (!person) {
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
          accessibilityLabel={`${person.name}'s profile`}
          onPress={() => router.push(`/person/${person.id}`)}
          style={styles.headerTitle}
        >
          <Text style={type.title3}>{person.name}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <IconButton name="search" accessibilityLabel="Search conversation" />
          <IconButton name="dots" accessibilityLabel="Conversation options" />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <Text style={[type.micro, styles.day]}>
            Today, {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>

          {messages.map((message, index) => (
            <Animated.View
              key={message.id}
              entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(300)}
              style={[styles.bubbleRow, message.from === 'me' && styles.bubbleRowMine]}
            >
              {message.from === 'them' ? (
                <Avatar email={person.email} size={30} style={styles.bubbleAvatar} />
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

        {/* Call permission. Gated by a circuit, not a flag. */}
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
      </KeyboardAvoidingView>
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
  headerActions: { flexDirection: 'row', gap: space.sm },

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
