/**
 * Database keys and paths.
 *
 * Kept in one file so the shape of the tree is legible in a single read, and so
 * the rules in `database.rules.json` can be checked against something other
 * than a grep for string literals.
 *
 * The tree:
 *
 *   owners/{uid}                          the wallet this session owns
 *   users/{wallet}/owner                  auth uid, written once, never rewritten
 *   users/{wallet}/profile                what the user agreed to show
 *   users/{wallet}/verification           {adult, at} - mirrors the local flag
 *   users/{wallet}/interests              tags, when disclosed
 *   users/{wallet}/preferences            {searchRadius, locationSharing}
 *   locations/{wallet}                    {latitude, longitude, accuracy, timestamp, geohash}
 *   presence/{wallet}                     {online, lastSeen}
 *   conversations/{cid}/participants      {wallet: true}
 *   conversations/{cid}/messages/{mid}    {senderId, text, timestamp, type, status}
 *   userConversations/{wallet}/{cid}      the list-screen index
 *
 * `owners` is the reverse of `users/{wallet}/owner`, and it exists for the
 * rules rather than for the app. A rule can read `owners/{auth.uid}` to learn
 * which wallet the caller holds and then use that value as a path segment -
 * which is what makes "only a participant may read this conversation" and
 * "senderId must be the caller's own wallet" expressible at all. Without it the
 * rules would have to iterate `participants`, which they cannot do.
 */

/**
 * Makes a wallet address safe as a database key.
 *
 * RTDB rejects `.`, `#`, `$`, `[`, `]` and `/` in keys. Midnight bech32m
 * addresses are alphanumeric so in practice nothing is replaced, but the
 * deeplink transport returns whatever the wallet app sends and a key that
 * silently fails to write is a bad way to find that out.
 */
export function walletKey(address: string): string {
  return address.replace(/[.#$[\]/]/g, '-');
}

export const paths = {
  ownerOf: (uid: string) => `owners/${uid}`,
  user: (wallet: string) => `users/${walletKey(wallet)}`,
  owner: (wallet: string) => `users/${walletKey(wallet)}/owner`,
  profile: (wallet: string) => `users/${walletKey(wallet)}/profile`,
  verification: (wallet: string) => `users/${walletKey(wallet)}/verification`,
  interests: (wallet: string) => `users/${walletKey(wallet)}/interests`,
  preferences: (wallet: string) => `users/${walletKey(wallet)}/preferences`,

  locations: () => 'locations',
  location: (wallet: string) => `locations/${walletKey(wallet)}`,

  presence: (wallet: string) => `presence/${walletKey(wallet)}`,

  conversation: (id: string) => `conversations/${id}`,
  messages: (id: string) => `conversations/${id}/messages`,
  participants: (id: string) => `conversations/${id}/participants`,

  userConversations: (wallet: string) => `userConversations/${walletKey(wallet)}`,
  userConversation: (wallet: string, id: string) =>
    `userConversations/${walletKey(wallet)}/${id}`,
} as const;

/**
 * Namespace for the demo roster's conversation keys.
 *
 * The roster personas have no wallet and no session, but a message *to* one of
 * them is still a message the user typed and still has to survive being closed.
 * Giving them a reserved prefix lets every conversation in the app take the
 * same path through the database - one storage model, not two - while keeping
 * the key space provably disjoint from real addresses, which are bech32m and
 * cannot contain an underscore.
 */
const DEMO_PREFIX = 'demo_';

export function demoKey(personId: string): string {
  return `${DEMO_PREFIX}${personId}`;
}

export function isDemoKey(key: string): boolean {
  return key.startsWith(DEMO_PREFIX);
}

/** The roster id behind a demo key, or null if this is a real address. */
export function demoPersonId(key: string): string | null {
  return isDemoKey(key) ? key.slice(DEMO_PREFIX.length) : null;
}

/**
 * The conversation both sides compute independently.
 *
 * Sorted, so A→B and B→A land on the same node without either side having to
 * ask a server which of them is "first".
 */
export function conversationId(a: string, b: string): string {
  return [walletKey(a), walletKey(b)].sort().join('_');
}

/** The other participant, given a conversation id and one of its members. */
export function otherParticipant(id: string, self: string): string | null {
  const mine = walletKey(self);
  const parts = id.split('_');
  if (parts.length !== 2) return null;
  if (parts[0] === mine) return parts[1];
  if (parts[1] === mine) return parts[0];
  return null;
}
