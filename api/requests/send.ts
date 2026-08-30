import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_lib/firebase';
import { body, caller, fail, guarded, json, methodIs, str } from '../_lib/http';

/**
 * POST /api/requests/send  { to, note? }
 *
 * Sends a connection request from the caller's wallet.
 *
 * The database rules already permit a client to write this row directly, and
 * they already enforce the parts that are expressible: only the sender may
 * create it, only as `pending`, and only once. What they cannot enforce is a
 * *rate* - rules see one write at a time and cannot count how many a wallet has
 * sent this hour. That is the reason this endpoint exists.
 *
 * The window is deliberately generous. This is a check against a script
 * blasting every wallet it found in the location index, not a throttle a person
 * could hit by using the app briskly.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;

export default guarded(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodIs(req, res, 'POST')) return;

  const who = await caller(req, res);
  if (!who) return;

  const input = body(req);
  const to = str(input, 'to', 120);
  const note = str(input, 'note', 200);

  if (!to) {
    fail(res, 400, 'A `to` wallet address is required.');
    return;
  }

  const target = to.replace(/[.#$[\]/]/g, '-');
  if (target === who.wallet) {
    fail(res, 400, 'Cannot send a request to yourself.');
    return;
  }

  // A request to a wallet nobody owns would sit unread forever, and is the
  // shape a scripted sweep produces.
  const exists = (await db().ref(`users/${target}/owner`).get()).exists();
  if (!exists) {
    fail(res, 404, 'No such user.');
    return;
  }

  const rowRef = db().ref(`requests/${target}/${who.wallet}`);
  const current = (await rowRef.get()).val() as { status?: string } | null;
  if (current) {
    // Matches the rules, which admit a create and not an overwrite. Answering
    // 409 rather than silently succeeding is what tells a declined sender that
    // the answer was no, instead of leaving them to wonder.
    fail(res, 409, `A request already exists and is ${current.status ?? 'pending'}.`);
    return;
  }

  // Rate check. Counting the caller's own outbound rows is not possible -
  // requests are keyed by recipient, so there is no node listing what one
  // wallet has sent - hence the separate ledger, which only this endpoint
  // writes and no rule needs to understand.
  const now = Date.now();
  const ledgerRef = db().ref(`rateLimits/requests/${who.wallet}`);
  const ledger = ((await ledgerRef.get()).val() ?? {}) as Record<string, number>;
  const recent = Object.values(ledger).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    res.setHeader('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
    fail(res, 429, 'Too many requests sent recently. Try again later.');
    return;
  }

  await db().ref().update({
    [`requests/${target}/${who.wallet}/status`]: 'pending',
    [`requests/${target}/${who.wallet}/createdAt`]: now,
    ...(note ? { [`requests/${target}/${who.wallet}/note`]: note } : {}),
    // Keyed by recipient so a repeat send to the same person replaces its own
    // entry rather than growing the ledger without bound.
    [`rateLimits/requests/${who.wallet}/${target}`]: now,
  });

  json(res, 201, { to: target, status: 'pending', createdAt: now });
});
