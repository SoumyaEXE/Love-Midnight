import type { VercelRequest, VercelResponse } from '@vercel/node';
import { uidFrom, walletFor } from './firebase';

/**
 * The bits of request handling every endpoint here repeats.
 *
 * Small on purpose. The interesting logic lives in the handlers; this is the
 * envelope around it - method check, auth, JSON body, error shape - so that
 * four endpoints answer identically when something is wrong and a client can
 * have one error path rather than four.
 */

export type Caller = { uid: string; wallet: string };

export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

export function fail(res: VercelResponse, status: number, message: string): void {
  json(res, status, { error: message });
}

/**
 * Parses a JSON body.
 *
 * Vercel usually parses this for us, but not when the client omits or mangles
 * the content type - and a request that arrives as a string then fails on
 * `body.field` with a message about undefined rather than about the body. This
 * accepts both shapes.
 */
export function body(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

/** A trimmed non-empty string from the body, or null. */
export function str(source: Record<string, unknown>, key: string, max = 200): string | null {
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Resolves the caller, or answers and returns null.
 *
 * The identity comes from a verified ID token and nothing else. A handler must
 * never read a wallet out of the request body: the body is written by whoever
 * is calling, and the Admin SDK these handlers use bypasses every database rule
 * that would otherwise have caught the lie.
 */
export async function caller(
  req: VercelRequest,
  res: VercelResponse,
): Promise<Caller | null> {
  const uid = await uidFrom(req.headers.authorization);
  if (!uid) {
    fail(res, 401, 'Missing or invalid Authorization: Bearer <idToken>.');
    return null;
  }

  const wallet = await walletFor(uid);
  if (!wallet) {
    fail(res, 403, 'This session does not own a wallet yet. Register first.');
    return null;
  }

  return { uid, wallet };
}

/** Rejects anything that is not the expected method. */
export function methodIs(
  req: VercelRequest,
  res: VercelResponse,
  method: 'GET' | 'POST',
): boolean {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  fail(res, 405, `Use ${method}.`);
  return false;
}

/** Wraps a handler so a thrown error is one shape rather than a stack trace. */
export function guarded(
  fn: (req: VercelRequest, res: VercelResponse) => Promise<void>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      // Configuration problems are the common case in a fresh deploy and are
      // safe to name; anything else could carry internals, so it does not go
      // to the client.
      const message = error instanceof Error ? error.message : 'Unknown error.';
      const isConfig = message.includes('FIREBASE_');
      console.error('[api]', error);
      fail(res, 500, isConfig ? message : 'Internal error.');
    }
  };
}
