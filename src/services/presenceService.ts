import { onDisconnect, onValue, ref, serverTimestamp, set } from 'firebase/database';
import { database } from '@/firebase/config';
import { ensureSession } from '@/firebase/auth';
import { paths } from '@/firebase/paths';
import type { RemotePresence } from '@/firebase/types';

/**
 * Online / offline / last seen.
 *
 * The only honest way to do this is to let the server decide. A client that
 * sets `online: false` on its way out is a client that has to survive long
 * enough to do it, which rules out the crash, the tunnel, the battery, and the
 * task switcher - which is to say most of the ways an app actually stops.
 *
 * `onDisconnect` is registered *while connected* and executed by the server
 * when the socket drops, however it drops. The registration is re-armed on
 * every reconnect, because the server discards it once it has fired.
 *
 * `.info/connected` is the local view of the socket. It is not a network
 * reachability check and must not be used as one - it goes false during a
 * normal reconnect and comes back on its own.
 */

export type PresenceWatch = { stop: () => void };

export function trackPresence(wallet: string): PresenceWatch {
  const presenceRef = ref(database, paths.presence(wallet));
  const connectedRef = ref(database, '.info/connected');

  let cancelled = false;

  const unsubscribe = onValue(connectedRef, (snapshot) => {
    if (cancelled || snapshot.val() !== true) return;

    void (async () => {
      try {
        await ensureSession();
        // Armed before the online write, so a socket that dies between the two
        // still leaves a correct record behind.
        await onDisconnect(presenceRef).set({
          online: false,
          lastSeen: serverTimestamp(),
        });
        if (cancelled) return;
        await set(presenceRef, { online: true, lastSeen: serverTimestamp() });
      } catch {
        // Presence is not worth surfacing an error for. If the rules refuse
        // the write, the user simply appears offline.
      }
    })();
  });

  return {
    stop: () => {
      cancelled = true;
      unsubscribe();
      // A deliberate sign-off, for the case the app is closed cleanly. The
      // armed onDisconnect covers everything else.
      void set(presenceRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    },
  };
}

/** Subscribes to one person's presence. Returns the unsubscribe. */
export function watchPresence(
  wallet: string,
  handler: (presence: RemotePresence) => void,
): () => void {
  return onValue(ref(database, paths.presence(wallet)), (snapshot) => {
    const value = snapshot.val() as RemotePresence | null;
    handler(value ?? { online: false, lastSeen: 0 });
  });
}

/** `Active now`, `12m ago`, `Yesterday`. Matches the roster's `lastSeen` copy. */
export function formatLastSeen(presence: RemotePresence): string {
  if (presence.online) return 'Active now';
  if (!presence.lastSeen) return 'Offline';

  const minutes = Math.floor((Date.now() - presence.lastSeen) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
