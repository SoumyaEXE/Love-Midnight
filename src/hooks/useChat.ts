import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { conversationId } from '@/firebase/paths';
import type { RemoteMessage } from '@/firebase/types';
import {
  markRead,
  openConversation,
  sendMessage,
  watchMessages,
} from '@/services/chatService';
import { useHalo } from '@/state/store';
import { useFirebase } from '@/state/firebase';

/**
 * One open conversation.
 *
 * Messages are held in a Map keyed by id and sorted on read. That is not
 * premature: `onChildAdded` delivers the opening window as a burst and can
 * re-deliver a message the client already has after a reconnect, so appending
 * to an array duplicates rows in exactly the situation - flaky network - where
 * a chat most needs to be trustworthy.
 *
 * Unread is cleared on open and on every message that lands while open, which
 * is the definition of "the user is looking at it".
 */

export type ChatState = {
  messages: RemoteMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  send: (text: string) => Promise<void>;
};

export function useChat(otherWallet: string | null): ChatState {
  const { wallet: walletState } = useHalo();
  const { owned } = useFirebase();

  const self = walletState.status === 'connected' ? walletState.address ?? null : null;
  const id = self && otherWallet ? conversationId(self, otherWallet) : null;

  const [byId, setById] = useState<Map<string, RemoteMessage>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Held so the message handler can clear unread without depending on `id`
  // through a closure that would re-subscribe the listener.
  const conversation = useRef<string | null>(null);
  conversation.current = id;

  useEffect(() => {
    if (!id || !self || !otherWallet || !owned) {
      setLoading(false);
      return;
    }

    setById(new Map());
    setLoading(true);
    setError(null);

    let alive = true;
    let off: (() => void) | null = null;

    void openConversation(self, otherWallet)
      .then(() => {
        if (!alive) return;

        off = watchMessages(id, {
          onMessage: (message) => {
            if (!alive) return;
            setById((prev) => {
              if (prev.has(message.id)) return prev;
              const next = new Map(prev);
              next.set(message.id, message);
              return next;
            });
            setLoading(false);
            // The thread is on screen, so nothing in it is unread.
            void markRead(self, id).catch(() => {});
          },
          onUpdate: (message) => {
            if (!alive) return;
            setById((prev) => {
              const next = new Map(prev);
              next.set(message.id, message);
              return next;
            });
          },
          onError: () => {
            if (!alive) return;
            setError('This conversation could not be opened.');
            setLoading(false);
          },
        });

        void markRead(self, id).catch(() => {});
        // An empty conversation never fires `added`, so the spinner has to be
        // retired here rather than in the handler.
        setTimeout(() => {
          if (alive) setLoading(false);
        }, 600);
      })
      .catch(() => {
        if (!alive) return;
        setError('This conversation could not be opened.');
        setLoading(false);
      });

    return () => {
      alive = false;
      off?.();
    };
  }, [id, self, otherWallet, owned]);

  const messages = useMemo(
    () => [...byId.values()].sort((a, b) => a.timestamp - b.timestamp),
    [byId],
  );

  const send = useCallback(
    async (text: string) => {
      if (!self || !otherWallet || !text.trim()) return;

      setSending(true);
      setError(null);
      try {
        await sendMessage({ self, other: otherWallet, text });
      } catch {
        setError('Message not sent. Check your connection and try again.');
      } finally {
        setSending(false);
      }
    },
    [self, otherWallet],
  );

  return { messages, loading, error, sending, send };
}
