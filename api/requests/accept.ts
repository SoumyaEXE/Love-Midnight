import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_lib/firebase';
import { body, caller, fail, guarded, json, methodIs, str } from '../_lib/http';

/**
 * POST /api/requests/accept  { from }
 *
 * Accepts a pending request addressed to the caller.
 *
 * This is the endpoint with the strongest reason to exist. A client *can* do
 * this itself, but only as a single multi-path update in one exact ordering:
 * the `connections` rule admits a row only while the matching request still
 * reads `pending`, and in these rules `root` is the pre-write state - so
 * writing the status first, in its own call, causes both connection rows to be
 * rejected and leaves the pair accepted but unconnected. That state is
 * unrecoverable from the client, because the request can never go back to
 * `pending` and the connection can never be written without it.
 *
 * Here the Admin SDK bypasses rules entirely, so the ordering hazard does not
 * exist and the write is one transaction with no way to half-apply.
 *
 * Bypassing rules means this handler owes the authorisation the rules would
 * have done: the acceptor is the *verified caller*, never a wallet from the
 * body, and the request must actually exist and actually be pending.
 */
export default guarded(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodIs(req, res, 'POST')) return;

  const who = await caller(req, res);
  if (!who) return;

  const input = body(req);
  const from = str(input, 'from', 120);
  if (!from) {
    fail(res, 400, 'A `from` wallet address is required.');
    return;
  }

  const sender = from.replace(/[.#$[\]/]/g, '-');

  // Addressed to the caller by construction: the path is keyed on the verified
  // wallet, so there is no request here that belongs to somebody else.
  const rowRef = db().ref(`requests/${who.wallet}/${sender}`);
  const row = (await rowRef.get()).val() as { status?: string } | null;

  if (!row) {
    fail(res, 404, 'No such request.');
    return;
  }
  if (row.status !== 'pending') {
    fail(res, 409, `That request is already ${row.status}.`);
    return;
  }

  // Both directions, because a rule gets one lookup and no way to sort two
  // wallets - the `participants` validator has to find the edge under the
  // caller's own wallet without knowing which side of the pair they are on.
  await db().ref().update({
    [`connections/${who.wallet}/${sender}`]: true,
    [`connections/${sender}/${who.wallet}`]: true,
    [`requests/${who.wallet}/${sender}/status`]: 'accepted',
  });

  json(res, 200, { from: sender, status: 'accepted', connected: true });
});
