import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acceptRequest,
  clearRequest,
  declineRequest,
  disconnect,
  sendRequest,
  watchConnections,
  watchIncoming,
  watchRequestTo,
  type IncomingRequest,
} from '@/services/requestService';
import { get, ref } from 'firebase/database';
import { database } from '@/firebase/config';
import { paths, walletKey } from '@/firebase/paths';
import type { RemoteProfile, RequestStatus } from '@/firebase/types';
import { useFirebase } from '@/state/firebase';
import { useHalo } from '@/state/store';

/**
 * The request inbox and the connected set, as one hook.
 *
 * They are fetched together because every screen that cares about one cares
 * about the other: a person is either connected, or has a request outstanding,
 * or is a stranger, and no screen can render the right control without knowing
 * which. Splitting them into two hooks would mean every caller subscribing
 * twice and reconciling two loading states to answer one question.
 *
 * Both subscriptions are gated on ownership. `claimWallet` is asynchronous, so
 * every cold start passes through a state where the address is known but the
 * `users/{wallet}/owner` binding has not landed - and the rules key these reads
 * on that binding, so subscribing early yields a permission error for a record
 * that is about to become readable. Waiting is correct rather than defensive.
 */

export type RequestsState = {
  /** Everything addressed to this user, newest first, all statuses. */
  incoming: IncomingRequest[];
  /** Just the ones awaiting an answer. What the badge counts. */
  pending: IncomingRequest[];
  /** Wallets this user may open a conversation with. */
  connections: Set<string>;
  loading: boolean;
  error: string | null;

  send: (to: string, note?: string) => Promise<void>;
  accept: (from: string) => Promise<void>;
  decline: (from: string) => Promise<void>;
  clear: (from: string) => Promise<void>;
  remove: (other: string) => Promise<void>;
  /** True when a conversation with this wallet is permitted. */
  isConnected: (other: string) => boolean;
};

export function useRequests(): RequestsState {
  const { wallet: walletState } = useHalo();
  const { owned } = useFirebase();

  const address = walletState.status === 'connected' ? walletState.address ?? null : null;
  const ready = Boolean(address && owned);

  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [connections, setConnections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !ready) {
      setIncoming([]);
      setConnections(new Set());
      setLoading(!ready);
      return;
    }

    setLoading(true);
    setError(null);

    const offRequests = watchIncoming(address, {
      onList: (list) => {
        setIncoming(list);
        setLoading(false);
      },
      onError: () => {
        setError('Could not load requests.');
        setLoading(false);
      },
    });

    const offConnections = watchConnections(address, {
      onList: (wallets) => setConnections(new Set(wallets)),
      onError: () => setError('Could not load connections.'),
    });

    return () => {
      offRequests();
      offConnections();
    };
  }, [address, ready]);

  const pending = useMemo(
    () => incoming.filter((r) => r.status === 'pending'),
    [incoming],
  );

  const guard = useCallback(() => {
    if (!address) throw new Error('Connect a wallet first.');
    return address;
  }, [address]);

  const send = useCallback(
    async (to: string, note?: string) => {
      await sendRequest(guard(), to, note);
    },
    [guard],
  );

  const accept = useCallback(async (from: string) => acceptRequest(guard(), from), [guard]);
  const decline = useCallback(async (from: string) => declineRequest(guard(), from), [guard]);
  const clear = useCallback(async (from: string) => clearRequest(guard(), from), [guard]);
  const remove = useCallback(async (other: string) => disconnect(guard(), other), [guard]);

  // Keys are normalised on write, so the lookup has to normalise too - a caller
  // holding a raw bech32m address would otherwise miss its own connection.
  const isConnected = useCallback(
    (other: string) => connections.has(walletKey(other)),
    [connections],
  );

  return {
    incoming,
    pending,
    connections,
    loading,
    error,
    send,
    accept,
    decline,
    clear,
    remove,
    isConnected,
  };
}

/**
 * The status of a request this user sent to one particular wallet.
 *
 * Separate from `useRequests` because it answers a different question against a
 * different node. Requests are keyed by *recipient*, so there is no "my sent
 * requests" collection to subscribe to - a sender may read back only the
 * specific rows they wrote. A screen showing one person can ask about that one
 * pair; a screen showing many cannot ask about all of them, and should not try.
 *
 * Null means no request exists, which is the state that permits sending one.
 */
export function useSentRequestStatus(to: string | null): RequestStatus | null {
  const { wallet: walletState } = useHalo();
  const { owned } = useFirebase();
  const [status, setStatus] = useState<RequestStatus | null>(null);

  const address = walletState.status === 'connected' ? walletState.address ?? null : null;

  useEffect(() => {
    if (!address || !to || !owned) {
      setStatus(null);
      return;
    }
    return watchRequestTo(address, to, {
      onStatus: setStatus,
      // A read that is refused is a request that does not exist as far as this
      // screen is concerned - the send button is the right control either way.
      onError: () => setStatus(null),
    });
  }, [address, to, owned]);

  return status;
}

/**
 * Pending requests, each carrying the sender's published card.
 *
 * `RequestsSheet` needs a name and an avatar to draw a row, and a request
 * carries neither - only a wallet. The card lives at `users/{wallet}/profile`,
 * which is readable per-wallet, so this resolves one profile per pending sender
 * and drops anyone whose card cannot be read.
 *
 * A one-shot `get` rather than a subscription, deliberately. This backs a sheet
 * that is opened, acted on and closed; a name changing while it is open is not
 * worth a listener per sender, and the sheet re-resolves the next time the
 * pending set changes anyway.
 */
export function useRequestCards(): {
  cards: { personId: string; at: string; name: string; avatar: string }[];
  loading: boolean;
} {
  const { pending, loading } = useRequests();
  const [cards, setCards] = useState<
    { personId: string; at: string; name: string; avatar: string }[]
  >([]);

  // The wallet list, as a stable string, so the effect does not re-run on every
  // re-render of an array that happens to have the same contents.
  const key = pending.map((r) => r.from).join(',');

  useEffect(() => {
    let alive = true;
    if (pending.length === 0) {
      setCards([]);
      return;
    }

    void Promise.all(
      pending.map(async (request) => {
        try {
          const snapshot = await get(ref(database, paths.profile(request.from)));
          const profile = snapshot.val() as RemoteProfile | null;
          if (!profile?.name) return null;
          return {
            personId: request.from,
            at: new Date(request.createdAt).toLocaleDateString(),
            name: profile.name,
            avatar: profile.avatar,
          };
        } catch {
          // Unreadable card - the sender may have withdrawn their profile.
          return null;
        }
      }),
    ).then((resolved) => {
      if (alive) setCards(resolved.filter((c) => c !== null));
    });

    return () => {
      alive = false;
    };
  }, [key]);

  return { cards, loading };
}
