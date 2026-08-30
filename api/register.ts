import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, uidFrom } from './_lib/firebase';
import { body, fail, guarded, json, methodIs, str } from './_lib/http';

/**
 * POST /api/register  { wallet, name, avatar, adult }
 *
 * Binds a wallet address to the caller's anonymous uid, and writes the first
 * profile. This is the only endpoint that does not require the caller to
 * already own a wallet, because owning one is what it creates.
 *
 * Why this is worth a round trip when the client could write it directly: the
 * client-side binding is a write-once rule racing whoever gets there first.
 * `users/{wallet}/owner` may be created and never rewritten, which stops a
 * *second* claimant, but two cold starts on the same address genuinely race and
 * the loser gets a permission error at some later, unrelated write. Here the
 * check and the write are one transaction against a single node, so the loser
 * is told immediately and by this endpoint.
 *
 * The uid comes from the verified token, never from the body. A caller may
 * choose which wallet to claim; they may not choose who they are.
 */
export default guarded(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodIs(req, res, 'POST')) return;

  const uid = await uidFrom(req.headers.authorization);
  if (!uid) {
    fail(res, 401, 'Missing or invalid Authorization: Bearer <idToken>.');
    return;
  }

  const input = body(req);
  const wallet = str(input, 'wallet', 120);
  const name = str(input, 'name', 60);
  const avatar = str(input, 'avatar', 120);

  if (!wallet) {
    fail(res, 400, 'A `wallet` address is required.');
    return;
  }
  if (!name || name.length < 2) {
    fail(res, 400, 'A `name` of 2 to 60 characters is required.');
    return;
  }
  if (!avatar) {
    fail(res, 400, 'An `avatar` key is required.');
    return;
  }

  // RTDB rejects these in keys. The client normalises the same way in
  // `firebase/paths.walletKey`; doing it here too means a caller that skipped
  // that step lands on the same node rather than a second one.
  const key = wallet.replace(/[.#$[\]/]/g, '-');

  const ownerRef = db().ref(`users/${key}/owner`);
  const existing = (await ownerRef.get()).val() as string | null;

  if (existing && existing !== uid) {
    fail(res, 409, 'That wallet is already claimed by another session.');
    return;
  }

  const now = Date.now();
  const adult = input.adult === true;

  // One multi-path write, so a half-registered user cannot exist: the forward
  // edge, the reverse edge and the profile land together or not at all.
  const updates: Record<string, unknown> = {
    [`users/${key}/owner`]: uid,
    [`users/${key}/profile/name`]: name,
    [`users/${key}/profile/avatar`]: avatar,
    [`users/${key}/profile/updatedAt`]: now,
    [`owners/${uid}`]: key,
  };

  // Discovery drops anyone without this, so registering without it produces a
  // user who is on the map for nobody. It mirrors the onboarding proof and is
  // never recomputed here.
  if (adult) {
    updates[`users/${key}/verification/adult`] = true;
    updates[`users/${key}/verification/at`] = now;
  }

  await db().ref().update(updates);

  json(res, existing ? 200 : 201, { wallet: key, uid, claimed: !existing });
});
