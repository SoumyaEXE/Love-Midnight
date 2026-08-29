/**
 * The records that actually live in the database.
 *
 * Declared apart from the local models on purpose. `HaloProfile` is the whole
 * truth and stays on the device; `RemoteProfile` is the subset the user agreed
 * to publish, and the projection between them happens in one place
 * (`services/userService`) so "what did I upload?" has a single answer.
 */

export type RemoteProfile = {
  name: string;
  /** Omitted entirely when withheld - not sent as null. */
  age?: number;
  gender?: string;
  bio?: string;
  interests?: string[];
  /** Gravatar key, so a remote card renders the same avatar the roster does. */
  avatar: string;
  updatedAt: number;
};

export type RemoteVerification = {
  /** The result of the existing onboarding proof. Never recomputed here. */
  adult: boolean;
  at: number;
};

export type RemotePreferences = {
  /** Metres. See `firebase/geo`. */
  searchRadius: number;
  locationSharing: boolean;
};

/**
 * A published position.
 *
 * Not a fix. The coordinates are the centre of the publisher's 250 m grid cell
 * - see `geo.snapToGrid` - so everyone in the same square publishes the same
 * pair, and `accuracy` reports the error that snapping introduced rather than
 * the receiver's own figure. Nothing finer than this exists server-side.
 */
export type RemoteLocation = {
  latitude: number;
  longitude: number;
  /** Metres of uncertainty in the *published* point, not in the fix. */
  accuracy: number | null;
  timestamp: number;
  /** Index key, computed from the snapped point. See `firebase/geo`. */
  geohash: string;
  /**
   * "Kolkata, West Bengal". City and region only, geocoded on the publisher's
   * own device. This is the only place-name anyone else is given.
   */
  place?: string;
};

export type RemotePresence = {
  online: boolean;
  lastSeen: number;
};

export type RemoteUser = {
  owner?: string;
  profile?: RemoteProfile;
  verification?: RemoteVerification;
  interests?: string[];
  preferences?: RemotePreferences;
};

export type MessageType = 'text' | 'image' | 'location' | 'system' | 'reaction';

export type RemoteMessage = {
  id: string;
  /** The sender's wallet. The rules verify it against the session uid. */
  senderId: string;
  text: string;
  timestamp: number;
  type: MessageType;
  status: 'sent' | 'delivered' | 'read';
};

export type RemoteConversationEntry = {
  otherUserId: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  unreadCount: number;
};

/** A discovered person, assembled from three nodes and shown as one card. */
export type NearbyUser = {
  wallet: string;
  profile: RemoteProfile;
  /**
   * Metres between two snapped cells, measured with Haversine. Carries the
   * grid's error on both sides, which is why `formatDistance` refuses to
   * quantify anything under half a kilometre. Never rendered as coordinates.
   */
  distance: number;
  /** "Kolkata, West Bengal", or null if the geocoder had nothing. */
  place: string | null;
  online: boolean;
  lastSeen: number;
  /** When their position was last published. Drives the staleness cut. */
  locatedAt: number;
};
