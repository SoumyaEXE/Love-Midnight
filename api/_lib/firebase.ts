import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

/**
 * Firebase Admin, for the serverless functions.
 *
 * Two things about this file are shaped by Vercel rather than by Firebase.
 *
 * The first is that containers are *reused*. A function is not a fresh process
 * per request - a warm container serves many, and module scope persists between
 * them. `initializeApp` called unconditionally therefore succeeds on the cold
 * request and throws `app/duplicate-app` on every warm one after it, which
 * presents as an endpoint that works exactly once and then 500s until the next
 * deploy. Hence the `getApps()` guard.
 *
 * The second is the credential. The private key in a service account JSON
 * contains literal newlines, which do not survive being pasted into an
 * environment-variable field: they arrive as the two characters `\` and `n` and
 * the key fails to parse with an error that names PEM rather than the env var.
 * Base64 sidesteps the whole question - one line in, one JSON object out.
 *
 * And a thing shaped by neither: the Admin SDK bypasses database rules
 * completely. Everything in `database.rules.json` is enforcement for the
 * *client* path, and none of it applies here. Every handler in this directory
 * is therefore responsible for its own authorisation, and the pattern is always
 * the same - verify the caller's ID token, derive the wallet from the verified
 * uid, and never take an identity from the request body.
 */

const ENV_CREDENTIAL = 'FIREBASE_SERVICE_ACCOUNT_B64';
const ENV_DATABASE_URL = 'FIREBASE_DATABASE_URL';

function credentials(): { projectId: string; clientEmail: string; privateKey: string } {
  const raw = process.env[ENV_CREDENTIAL];
  if (!raw) {
    throw new Error(
      `${ENV_CREDENTIAL} is not set. Generate a service account key in the Firebase ` +
        'console (Project settings -> Service accounts), then set it as base64: ' +
        'base64 -w0 serviceAccount.json',
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw new Error(
      `${ENV_CREDENTIAL} is not valid base64-encoded JSON. It should be the whole ` +
        'service account file, base64 encoded - not the private key on its own.',
    );
  }

  const projectId = parsed.project_id as string | undefined;
  const clientEmail = parsed.client_email as string | undefined;
  const privateKey = parsed.private_key as string | undefined;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `${ENV_CREDENTIAL} decoded, but is missing project_id, client_email or private_key.`,
    );
  }

  return { projectId, clientEmail, privateKey };
}

function app(): App {
  // Warm containers already have it. See the note above.
  if (getApps().length > 0) return getApp();

  const databaseURL = process.env[ENV_DATABASE_URL];
  if (!databaseURL) {
    // Admin does not infer this from the project id, and a missing databaseURL
    // fails later at the first read with a message about the default app rather
    // than about configuration.
    throw new Error(`${ENV_DATABASE_URL} is not set (e.g. https://<project>-default-rtdb.firebaseio.com).`);
  }

  return initializeApp({ credential: cert(credentials()), databaseURL });
}

export const db = () => getDatabase(app());
export const auth = () => getAuth(app());

/**
 * The uid behind an `Authorization: Bearer <idToken>` header, or null.
 *
 * The token is the only identity these handlers trust. A wallet address in a
 * request body is a claim by whoever sent the body; a verified uid is not, and
 * `owners/{uid}` turns it into the wallet the caller actually holds.
 */
export async function uidFrom(header: string | undefined): Promise<string | null> {
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  try {
    const decoded = await auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * The wallet a verified uid owns, checked in both directions.
 *
 * `owners/{uid}` is the reverse edge and is never trusted alone - the forward
 * edge at `users/{wallet}/owner` has to agree, or a forged reverse entry would
 * let a caller act as a wallet they do not hold. The client rules take the same
 * precaution; this is the same check, restated where rules do not run.
 */
export async function walletFor(uid: string): Promise<string | null> {
  const reverse = await db().ref(`owners/${uid}`).get();
  const wallet = reverse.val() as string | null;
  if (!wallet) return null;

  const forward = await db().ref(`users/${wallet}/owner`).get();
  return forward.val() === uid ? wallet : null;
}
