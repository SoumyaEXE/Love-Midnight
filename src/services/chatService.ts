import {
  limitToLast,
  onChildAdded,
  onChildChanged,
  onValue,
  push,
  query,
  ref,
  runTransaction,
  set,
  update,
  type DataSnapshot,
} from 'firebase/database';
import { database } from '@/firebase/config';
import { ensureSession } from '@/firebase/auth';
import { conversationId, paths, walletKey } from '@/firebase/paths';
import type {
  MessageType,
  RemoteConversationEntry,
  RemoteMessage,
} from '@/firebase/types';

/**
 * One-to-one chat.
 *
 * Two structures, deliberately:
 *
 *   conversations/{cid}/messages   the messages themselves, which are only ever
 *                                  read by the two people in the conversation.
 *   userConversations/{wallet}     a per-user index carrying the last line, its
 *                                  time, and an unread count.
 *
 * The index is what makes the chat list cheap. Without it, drawing a list of
 * twenty conversations means opening twenty message nodes and reading the tail
 * of each, which is twenty subscriptions to draw twenty rows. With it, the list
 * is one subscription to one small node.
 *
 * The cost is that a send writes three places at once. That is the trade every
 * realtime chat makes, and the multi-path `update` below makes it atomic, so
 * the index can never claim a message the conversation does not have.
 */

/** How much history a conversation opens with. Older is fetched on demand. */
const WINDOW = 100;

/** Creates the conversation if it does not exist. Idempotent. */
export async function openConversation(self: string, other: string): Promise<string> {
  await ensureSession();

  const id = conversationId(self, other);
  await update(ref(database, paths.participants(id)), {
    [walletKey(self)]: true,
    [walletKey(other)]: true,
  });

  return id;
}

/**
 * Sends a message.
 *
 * `senderId` is written as the caller's wallet, but nothing downstream trusts
 * that: the database rules verify it against the reverse owner index, so a
 * client that writes someone else's address into the field has the write
 * rejected rather than accepted and displayed. See `database.rules.json`.
 */
export async function sendMessage(input: {
  self: string;
  other: string;
  text: string;
  type?: MessageType;
}): Promise<string> {
  await ensureSession();

  const text = input.text.trim();
  if (!text) throw new Error('Empty message');

  // Participants first, as their own write. The index rules check membership
  // against the *pre-write* tree, so a first message that created the
  // conversation and fanned out to the recipient in one update would be
  // refused - the membership it relies on would not exist yet. Idempotent.
  const id = await openConversation(input.self, input.other);
  const selfKey = walletKey(input.self);
  const otherKey = walletKey(input.other);

  const messageRef = push(ref(database, paths.messages(id)));
  const messageId = messageRef.key;
  if (!messageId) throw new Error('Could not allocate a message id');

  const timestamp = Date.now();
  const message: Omit<RemoteMessage, 'id'> = {
    senderId: selfKey,
    text,
    timestamp,
    type: input.type ?? 'text',
    status: 'sent',
  };

  const mine: RemoteConversationEntry = {
    otherUserId: otherKey,
    lastMessage: text,
    lastMessageTimestamp: timestamp,
    // The sender has, by definition, read their own message.
    unreadCount: 0,
  };

  await update(ref(database), {
    [`${paths.messages(id)}/${messageId}`]: message,
    [`${paths.participants(id)}/${selfKey}`]: true,
    [`${paths.participants(id)}/${otherKey}`]: true,
    [paths.userConversation(input.self, id)]: mine,
    // The recipient's row is written field by field so the transaction below
    // owns `unreadCount` outright - overwriting the whole row here would race
    // with it and lose counts under a burst.
    [`${paths.userConversation(input.other, id)}/otherUserId`]: selfKey,
    [`${paths.userConversation(input.other, id)}/lastMessage`]: text,
    [`${paths.userConversation(input.other, id)}/lastMessageTimestamp`]: timestamp,
  });

  // Separate, and a transaction, because two messages arriving at once must
  // increment to two. A read-then-write would settle on one.
  await runTransaction(
    ref(database, `${paths.userConversation(input.other, id)}/unreadCount`),
    (current: number | null) => (current ?? 0) + 1,
  );

  return messageId;
}

/**
 * Subscribes to a conversation.
 *
 * `onChildAdded` rather than `onValue`: the latter re-downloads and re-renders
 * the entire thread every time one message arrives, which on a long
 * conversation is the difference between a keystroke of work and a scroll
 * position that jumps. The initial window arrives as a burst of `added` events,
 * then each new message is one event carrying one message.
 *
 * `onChildChanged` carries status transitions - a message going `sent` to
 * `read` - without touching anything else in the thread.
 */
export function watchMessages(
  id: string,
  handlers: {
    onMessage: (message: RemoteMessage) => void;
    onUpdate?: (message: RemoteMessage) => void;
    onError?: (error: Error) => void;
  },
): () => void {
  const scoped = query(ref(database, paths.messages(id)), limitToLast(WINDOW));

  const read = (snapshot: DataSnapshot): RemoteMessage | null => {
    const value = snapshot.val() as Omit<RemoteMessage, 'id'> | null;
    if (!value || !snapshot.key) return null;
    return { ...value, id: snapshot.key };
  };

  const offAdded = onChildAdded(
    scoped,
    (snapshot) => {
      const message = read(snapshot);
      if (message) handlers.onMessage(message);
    },
    (error) => handlers.onError?.(error),
  );

  const offChanged = onChildChanged(scoped, (snapshot) => {
    const message = read(snapshot);
    if (message) handlers.onUpdate?.(message);
  });

  return () => {
    offAdded();
    offChanged();
  };
}

/** Subscribes to the chat list index. One listener for the whole screen. */
export function watchConversations(
  self: string,
  handlers: {
    onList: (entries: (RemoteConversationEntry & { id: string })[]) => void;
    onError?: (error: Error) => void;
  },
): () => void {
  return onValue(
    ref(database, paths.userConversations(self)),
    (snapshot) => {
      const value = (snapshot.val() ?? {}) as Record<string, RemoteConversationEntry>;
      const entries = Object.entries(value)
        .map(([id, entry]) => ({ ...entry, id }))
        .sort((a, b) => (b.lastMessageTimestamp ?? 0) - (a.lastMessageTimestamp ?? 0));
      handlers.onList(entries);
    },
    (error) => handlers.onError?.(error),
  );
}

/** Called when a conversation is opened, and on each message while it is open. */
export async function markRead(self: string, id: string): Promise<void> {
  await set(ref(database, `${paths.userConversation(self, id)}/unreadCount`), 0);
}

export { conversationId };
