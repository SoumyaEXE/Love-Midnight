import { onValue, ref, set, update, type Unsubscribe } from 'firebase/database';
import { database } from '@/firebase/config';
import { ensureSession } from '@/firebase/auth';
import { walletKey } from '@/firebase/paths';
import type { RequestStatus, ConnectionRequest } from '@/firebase/types';

/**
 * Connection requests - the consent step between finding somebody and talking
 * to them.
 *
 * Discovery puts a stranger on the map. Before this existed, that was already
 * enough to message them: `conversationId()` is a sorted join of two wallets
 * that either side can compute offline, so anyone who could see you could open
 * a thread with you. The database now refuses that - see the `participants`
 * validator in `database.rules.json` - and this file is the path that gets a
 * pair through it legitimately.
 *
 * The shape is deliberately asymmetric, because the two halves are not the same
 * act. A request is *keyed by its recipient* (`requests/{to}/{from}`) so that
 * an inbox is one subscription rather than a scan, and so the rules can say
 * "only the recipient may change a status" by looking at the path alone. The
 * accepted edge is stored in *both* directions (`connections/{a}/{b}` and
 * `connections/{b}/{a}`), because a rule gets one lookup and no way to sort two
 * wallets - the `participants` validator has to find the edge under the
 * caller's own wallet without knowing which side of the pair they are on.
 */

/** How a request looks to the sender before the recipient has answered. */
export const PENDING: RequestStatus = 'pending';

function path(...parts: string[]): string {
  return parts.join('/');
}

/**
 * Sends a request. Fails if one already exists for this pair.
 *
 * The rules permit the sender to *create* this row and nothing more: the
 * `!data.exists()` clause means a second send is refused rather than silently
 * resetting a request the recipient already declined. That is the cheap half of
 * spam control and it is enforced server-side, so a modified client gets the
 * same answer this one does.
 */
export async function sendRequest(
  from: string,
  to: string,
  note?: string,
): Promise<void> {
  await ensureSession();

  const self = walletKey(from);
  const other = walletKey(to);
  if (self === other) throw new Error('Cannot send a request to yourself.');

  const record: ConnectionRequest = {
    status: PENDING,
    createdAt: Date.now(),
    ...(note?.trim() ? { note: note.trim().slice(0, 200) } : {}),
  };

  await set(ref(database, path('requests', other, self)), record);
}

/**
 * Accepts a request, in one atomic write.
 *
 * The single `update()` is not a style preference, it is the only ordering that
 * works. In these rules `root` is the state *before* the write, and the
 * `connections` rule admits a row only while the matching request still reads
 * `pending`. Written as three separate calls with the status first, `root` no
 * longer says `pending` by the time the connection rows are attempted and both
 * are rejected - leaving the pair accepted but unconnected, which is the one
 * state nothing recovers from on its own because the request can never return
 * to `pending`.
 *
 * Batched, every path is evaluated against the same pre-write root, so the
 * status is still `pending` for all three and either all of it lands or none
 * of it does.
 */
export async function acceptRequest(self: string, from: string): Promise<void> {
  await ensureSession();

  const me = walletKey(self);
  const them = walletKey(from);

  await update(ref(database), {
    [path('connections', me, them)]: true,
    [path('connections', them, me)]: true,
    [path('requests', me, them, 'status')]: 'accepted' satisfies RequestStatus,
  });
}

/**
 * Declines a request.
 *
 * The row is kept rather than deleted, and that is what makes the decline
 * stick: the sender may only create a request that does not exist, so a row
 * sitting at `declined` is what stops them immediately sending another. Use
 * `clearRequest` to let somebody try again.
 */
export async function declineRequest(self: string, from: string): Promise<void> {
  await ensureSession();
  await set(
    ref(database, path('requests', walletKey(self), walletKey(from), 'status')),
    'declined' satisfies RequestStatus,
  );
}

/** Removes a request entirely, which permits the sender to try once more. */
export async function clearRequest(self: string, from: string): Promise<void> {
  await ensureSession();
  await set(ref(database, path('requests', walletKey(self), walletKey(from))), null);
}

/** Breaks a connection. Both rows, since both exist. */
export async function disconnect(self: string, other: string): Promise<void> {
  await ensureSession();

  const me = walletKey(self);
  const them = walletKey(other);

  await update(ref(database), {
    [path('connections', me, them)]: null,
    [path('connections', them, me)]: null,
  });
}

export type IncomingRequest = ConnectionRequest & { from: string };

/**
 * The inbox. One subscription for every request addressed to this wallet.
 *
 * Declined rows are included, because the screen showing them is also the
 * screen that can clear them. Callers wanting only the actionable ones filter
 * on `status === 'pending'`.
 */
export function watchIncoming(
  self: string,
  handlers: {
    onList: (requests: IncomingRequest[]) => void;
    onError?: (error: Error) => void;
  },
): Unsubscribe {
  return onValue(
    ref(database, path('requests', walletKey(self))),
    (snapshot) => {
      const value = (snapshot.val() ?? {}) as Record<string, ConnectionRequest>;
      const list = Object.entries(value)
        .map(([from, record]) => ({ ...record, from }))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      handlers.onList(list);
    },
    (error) => handlers.onError?.(error),
  );
}

/**
 * The wallets this user is connected to.
 *
 * This is what gates the compose box: the `participants` validator will refuse
 * a conversation with anyone absent from here, so the UI checks the same set
 * rather than letting a write fail and surfacing a permission error as if it
 * were a bug.
 */
export function watchConnections(
  self: string,
  handlers: {
    onList: (wallets: string[]) => void;
    onError?: (error: Error) => void;
  },
): Unsubscribe {
  return onValue(
    ref(database, path('connections', walletKey(self))),
    (snapshot) => {
      const value = (snapshot.val() ?? {}) as Record<string, boolean>;
      handlers.onList(Object.keys(value).filter((k) => value[k] === true));
    },
    (error) => handlers.onError?.(error),
  );
}

/**
 * One pair's request, from the sender's side.
 *
 * Requests are keyed by recipient, so there is no "my sent requests" node to
 * subscribe to - a sender can read back only the specific rows they wrote, and
 * only because the rules grant `$from` a read on its own row. That is enough
 * for the screen that needs it: a profile knows which wallet it is showing, so
 * it asks about that one pair rather than enumerating.
 */
export function watchRequestTo(
  self: string,
  to: string,
  handlers: {
    onStatus: (status: RequestStatus | null) => void;
    onError?: (error: Error) => void;
  },
): Unsubscribe {
  return onValue(
    ref(database, path('requests', walletKey(to), walletKey(self), 'status')),
    (snapshot) => handlers.onStatus((snapshot.val() as RequestStatus | null) ?? null),
    (error) => handlers.onError?.(error),
  );
}
