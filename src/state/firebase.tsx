import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onValue, ref } from 'firebase/database';
import { database, startAnalytics } from '@/firebase/config';
import { ensureSession } from '@/firebase/auth';
import { walletKey } from '@/firebase/paths';
import type { Coords } from '@/firebase/geo';
import { claimWallet, syncUser } from '@/services/userService';
import {
  clearLocation,
  publishLocation,
  watchLocation,
  type LocationError,
  type LocationWatch,
} from '@/services/locationService';
import { trackPresence, type PresenceWatch } from '@/services/presenceService';
import { useHalo } from '@/state/store';
import { isComplete } from '@/state/profile';

/**
 * The realtime session.
 *
 * Sits inside `HaloProvider` and reads from it rather than duplicating it. The
 * wallet address, the profile, the verification flag and the radius all still
 * live in one place; this provider's job is to keep the database agreeing with
 * them, and to own the three subscriptions that must not be started twice:
 * the session, presence, and the location watch.
 *
 * Nothing here creates a second user model. `users/{wallet}` is a projection of
 * the profile that already exists, written by `services/userService`, and the
 * wallet address is the key because it is already the account.
 */

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'error';

export type FirebaseError =
  | { kind: 'auth'; message: string }
  | { kind: 'permission'; message: string }
  | { kind: 'location'; reason: LocationError }
  | { kind: 'network'; message: string };

export type FirebaseSession = {
  /** Anonymous uid backing the rules. Null until sign-in resolves. */
  uid: string | null;
  /** Sanitised wallet key. Null when no wallet is connected. */
  wallet: string | null;
  connection: ConnectionState;
  /** True once this session is the recorded owner of its wallet record. */
  owned: boolean;
  error: FirebaseError | null;
  dismissError: () => void;

  /** Last fix the device produced. Never published beyond `locations/{wallet}`. */
  here: Coords | null;
  /** True while a location watch is running. */
  sharing: boolean;
  /** Epoch ms of the last successful position write. */
  publishedAt: number | null;

  /** Forces a profile / verification / preferences write. */
  sync: () => Promise<void>;
};

const FirebaseContext = createContext<FirebaseSession | null>(null);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const { wallet: walletState, profile, verified, visibility, discovery } = useHalo();

  const address = walletState.status === 'connected' ? walletState.address ?? null : null;
  const wallet = address ? walletKey(address) : null;

  const [uid, setUid] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [owned, setOwned] = useState(false);
  const [error, setError] = useState<FirebaseError | null>(null);
  const [here, setHere] = useState<Coords | null>(null);
  const [sharing, setSharing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<number | null>(null);

  const locationWatch = useRef<LocationWatch | null>(null);
  const presenceWatch = useRef<PresenceWatch | null>(null);

  // Sign in once, and keep the socket's own view of the connection.
  useEffect(() => {
    let alive = true;
    startAnalytics();

    ensureSession()
      .then((id) => {
        if (alive) setUid(id);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setConnection('error');
        setError({
          kind: 'auth',
          message: cause instanceof Error ? cause.message : 'Could not start a session',
        });
      });

    const off = onValue(ref(database, '.info/connected'), (snapshot) => {
      if (!alive) return;
      // Not a reachability check: this goes false during an ordinary reconnect
      // and comes back on its own, which is exactly what the UI should show.
      setConnection(snapshot.val() === true ? 'online' : 'offline');
    });

    return () => {
      alive = false;
      off();
    };
  }, []);

  // Bind the wallet to this session. First writer wins, permanently.
  useEffect(() => {
    if (!uid || !address) {
      setOwned(false);
      return;
    }

    let alive = true;
    claimWallet(address)
      .then((ok) => {
        if (!alive) return;
        setOwned(ok);
        if (!ok) {
          setError({
            kind: 'permission',
            message: 'This address is already registered to another device.',
          });
        }
      })
      .catch(() => {
        if (alive) setOwned(false);
      });

    return () => {
      alive = false;
    };
  }, [uid, address]);

  const sync = useCallback(async () => {
    if (!address || !owned) return;

    try {
      await syncUser({
        wallet: address,
        profile,
        // The wallet key, not an address book entry. Gravatar's fallback is
        // deterministic in its input, so keying on something already unique
        // per account gives every user a distinct avatar without anyone having
        // to upload one - and without an email address existing at all.
        avatar: walletKey(address),
        verification: { adult: verified.ok, at: verified.at ?? Date.now() },
        preferences: {
          searchRadius: discovery.radius,
          locationSharing: visibility.live,
        },
      });
    } catch (cause: unknown) {
      setError({
        kind: 'permission',
        message: cause instanceof Error ? cause.message : 'Could not save your profile',
      });
    }
  }, [address, owned, profile, verified, discovery.radius, visibility.live]);

  // Mirror the record whenever the things it is made of change. Guarded on a
  // complete profile so a half-typed name is never published.
  useEffect(() => {
    if (!owned || !isComplete(profile)) return;
    void sync();
  }, [owned, profile, sync]);

  // Presence, for as long as there is a wallet to attach it to.
  useEffect(() => {
    if (!owned || !address) return;

    presenceWatch.current = trackPresence(address);
    return () => {
      presenceWatch.current?.stop();
      presenceWatch.current = null;
    };
  }, [owned, address]);

  /**
   * Location sharing.
   *
   * One effect owns the watch, keyed on the switch. Turning it off does not
   * merely stop writing - it removes the record, because a stale position left
   * behind is a position that keeps someone discoverable for as long as the
   * freshness window allows.
   *
   * The three states below are kept apart deliberately, and collapsing the
   * first two is a real bug rather than a tidy-up. "We do not own this record"
   * and "we own it and are switching off" both end with no location being
   * shared, but only the second may touch the database: the rules key every
   * write on ownership, so removing a record we have not claimed is a
   * permission error - and `claimWallet` is asynchronous, so *every* cold start
   * passes through the unowned state on its way to the owned one. An earlier
   * version withdrew in both cases and logged a `permission_denied` warning on
   * launch every single time, for a write that had nothing to remove.
   */
  useEffect(() => {
    // Not ours to touch - either the claim has not resolved yet, or it failed.
    // Nothing is published in this state, so there is nothing to withdraw.
    if (!address || !owned) {
      setSharing(false);
      return;
    }

    if (!visibility.live) {
      setSharing(false);
      void clearLocation(address).catch(() => {});
      return;
    }

    let alive = true;
    setSharing(true);

    void watchLocation(address, {
      onFix: (coords) => {
        if (alive) setHere({ latitude: coords.latitude, longitude: coords.longitude });
      },
      onPublish: (at) => {
        if (alive) setPublishedAt(at);
      },
      onError: (reason) => {
        if (!alive) return;
        setSharing(false);
        setError({ kind: 'location', reason });
      },
    }).then((watch) => {
      if (!alive) {
        watch.stop();
        return;
      }
      locationWatch.current = watch;
    });

    return () => {
      alive = false;
      setSharing(false);
      locationWatch.current?.stop();
      locationWatch.current = null;
      void clearLocation(address).catch(() => {});
    };
  }, [owned, address, visibility.live]);

  const value = useMemo<FirebaseSession>(
    () => ({
      uid,
      wallet,
      connection,
      owned,
      error,
      dismissError: () => setError(null),
      here,
      sharing,
      publishedAt,
      sync,
    }),
    [uid, wallet, connection, owned, error, here, sharing, publishedAt, sync],
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebase(): FirebaseSession {
  const value = useContext(FirebaseContext);
  if (!value) throw new Error('useFirebase must be used inside FirebaseProvider');
  return value;
}

export { publishLocation };
