import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '@/firebase/config';
import { demoPersonId, isDemoKey, otherParticipant, paths } from '@/firebase/paths';
import { PEOPLE_BY_ID } from '@/data/people';
import type {
  RemoteConversationEntry,
  RemoteProfile,
  RemotePresence,
} from '@/firebase/types';
import { watchConversations } from '@/services/chatService';
import { useHalo } from '@/state/store';
import { useFirebase } from '@/state/firebase';

/**
 * The chat list.
 *
 * One subscription to `userConversations/{wallet}` draws every row - the name
 * comes from a second small subscription per counterpart, opened as rows appear
 * and closed as they go. Reading the tail of each conversation instead would be
 * one subscription per row against a node that grows without bound, which is
 * the difference between a list that opens instantly and one that does not.
 */

export type ConversationRow = RemoteConversationEntry & {
  id: string;
  name: string;
  avatar: string | null;
  online: boolean;
};

export type ConversationsState = {
  rows: ConversationRow[];
  loading: boolean;
  error: string | null;
  /** Sum of every row's unread count. Feeds the tab badge. */
  unread: number;
};

export function useConversations(): ConversationsState {
  const { wallet: walletState } = useHalo();
  const { owned } = useFirebase();

  const self = walletState.status === 'connected' ? walletState.address ?? null : null;

  const [entries, setEntries] = useState<(RemoteConversationEntry & { id: string })[]>([]);
  const [people, setPeople] = useState<
    Record<string, { profile?: RemoteProfile; presence?: RemotePresence }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!self || !owned) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const off = watchConversations(self, {
      onList: (list) => {
        setEntries(list);
        setLoading(false);
      },
      onError: () => {
        setError('Could not load your conversations.');
        setLoading(false);
      },
    });

    return off;
  }, [self, owned]);

  // One profile + presence subscription per counterpart, torn down with the row.
  // Roster personas are skipped: they have no user record to subscribe to, and
  // opening a listener on a node that will never exist is a listener that will
  // never fire.
  useEffect(() => {
    const wallets = [...new Set(entries.map((entry) => entry.otherUserId))].filter(
      (wallet) => wallet && !isDemoKey(wallet),
    );
    if (wallets.length === 0) return;

    const offs = wallets.flatMap((wallet) => [
      onValue(ref(database, paths.profile(wallet)), (snapshot) => {
        const profile = snapshot.val() as RemoteProfile | null;
        setPeople((prev) => ({ ...prev, [wallet]: { ...prev[wallet], profile: profile ?? undefined } }));
      }),
      onValue(ref(database, paths.presence(wallet)), (snapshot) => {
        const presence = snapshot.val() as RemotePresence | null;
        setPeople((prev) => ({
          ...prev,
          [wallet]: { ...prev[wallet], presence: presence ?? undefined },
        }));
      }),
    ]);

    return () => {
      for (const off of offs) off();
    };
  }, [entries]);

  const rows: ConversationRow[] = entries.map((entry) => {
    // A roster conversation names itself from the roster; a real one from the
    // card its owner published.
    const rosterId = demoPersonId(entry.otherUserId ?? '');
    const persona = rosterId ? PEOPLE_BY_ID.get(rosterId) : undefined;
    if (persona) {
      return {
        ...entry,
        name: persona.name,
        avatar: persona.email,
        online: persona.online,
      };
    }

    /*
     * `otherUserId` is a convenience field on the row, and a row written by an
     * older client - or half-written - may not carry it. The conversation id is
     * the sorted pair of both wallets, so the counterpart is always recoverable
     * from the key even when the field is absent. Falling back to it keeps the
     * avatar and the chat route pointing at a real wallet instead of
     * `undefined`.
     */
    const counterpart = entry.otherUserId ?? (self ? otherParticipant(entry.id, self) : null);
    const person = counterpart ? people[counterpart] : undefined;
    return {
      ...entry,
      otherUserId: counterpart ?? entry.id,
      name: person?.profile?.name ?? 'Someone nearby',
      avatar: person?.profile?.avatar ?? null,
      online: person?.presence?.online ?? false,
    };
  });

  return {
    rows,
    loading,
    error,
    unread: rows.reduce((total, row) => total + (row.unreadCount ?? 0), 0),
  };
}
