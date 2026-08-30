import {
  endAt,
  onValue,
  orderByChild,
  query,
  ref,
  startAt,
  type Unsubscribe,
} from 'firebase/database';
import { database } from '@/firebase/config';
import { paths, walletKey } from '@/firebase/paths';
import {
  haversineMeters,
  radiusQueryBounds,
  snapToGrid,
  type Coords,
} from '@/firebase/geo';
import type {
  NearbyUser,
  RemoteLocation,
  RemotePresence,
  RemoteUser,
} from '@/firebase/types';
import { STALE_AFTER } from './locationService';

/**
 * Nearby-user discovery.
 *
 * The naive version of this feature - subscribe to every location, recompute
 * every distance whenever anything moves - is correct and does not scale past a
 * demo. This one narrows first and measures second:
 *
 *   1. the radius becomes a handful of geohash string ranges (four to nine),
 *      each run as an indexed range query against `locations`. The database
 *      returns only the cells overlapping the circle.
 *   2. every candidate is then measured exactly, with Haversine, and dropped if
 *      it falls outside the radius - the cells are a jagged superset of the
 *      circle, so this step is not optional.
 *   3. survivors are checked for eligibility, and only then is anything read
 *      about the person: one `users` subscription and one `presence`
 *      subscription per person actually in range, torn down as they leave.
 *
 * Everything is push. There is no polling anywhere in this file; the only timer
 * is a local re-evaluation of *staleness*, which changes with the clock rather
 * than with anything the database could notify us about.
 */

export type NearbyHandlers = {
  onResults: (users: NearbyUser[]) => void;
  onError?: (error: Error) => void;
};

export type NearbyWatch = { stop: () => void };

/** How often freshness is re-checked locally. Not a poll - nothing is fetched. */
const SWEEP_INTERVAL = 30_000;

export function watchNearby(input: {
  self: string;
  center: Coords;
  radius: number;
  handlers: NearbyHandlers;
}): NearbyWatch {
  const selfKey = walletKey(input.self);

  /**
   * Our own position, snapped the same way everyone else's was.
   *
   * Measuring an exact fix against somebody's snapped cell would be more
   * accurate and would make the two of them disagree: A would compute one
   * distance to B and B another to A, from the same pair of people. Snapping
   * both sides makes the measurement symmetric, which is the property that
   * matters when the number is shown to both of them.
   */
  const center = snapToGrid(input.center);

  /** Candidates by wallet, from the geohash queries. Superset of the answer. */
  const located = new Map<string, RemoteLocation>();
  /** One entry per bound, so a bound's result set can be replaced wholesale. */
  const byBound = new Map<number, Set<string>>();

  const users = new Map<string, RemoteUser>();
  const presence = new Map<string, RemotePresence>();
  const detail = new Map<string, Unsubscribe[]>();

  let stopped = false;

  const emit = () => {
    if (stopped) return;

    const now = Date.now();
    const results: NearbyUser[] = [];

    for (const [wallet, location] of located) {
      if (wallet === selfKey) continue;

      // Part 13: a position nobody has refreshed is not a position anyone is at.
      if (now - location.timestamp > STALE_AFTER) continue;

      const distance = haversineMeters(center, location);
      if (distance > input.radius) continue;

      const user = users.get(wallet);
      if (!user?.profile?.name) continue;
      // The verification the user already completed in onboarding. Read, never
      // recomputed, and never substituted with a second notion of "verified".
      if (!user.verification?.adult) continue;
      // Sharing is switched off but the record has not expired yet.
      if (user.preferences?.locationSharing === false) continue;

      const seen = presence.get(wallet);
      results.push({
        wallet,
        profile: user.profile,
        latitude: location.latitude,
        longitude: location.longitude,
        distance,
        place: location.place ?? null,
        online: seen?.online ?? false,
        lastSeen: seen?.lastSeen ?? 0,
        locatedAt: location.timestamp,
      });
    }

    results.sort((a, b) => a.distance - b.distance);
    input.handlers.onResults(results);
  };

  /**
   * Opens or closes the per-person subscriptions so that exactly the people
   * currently in the candidate set are subscribed. This is the cleanup that
   * keeps a long session from accumulating listeners for everyone who has ever
   * walked past.
   */
  const reconcile = () => {
    for (const wallet of located.keys()) {
      if (wallet === selfKey || detail.has(wallet)) continue;

      detail.set(wallet, [
        onValue(ref(database, paths.user(wallet)), (snapshot) => {
          const value = snapshot.val() as RemoteUser | null;
          if (value) users.set(wallet, value);
          else users.delete(wallet);
          emit();
        }),
        onValue(ref(database, paths.presence(wallet)), (snapshot) => {
          const value = snapshot.val() as RemotePresence | null;
          presence.set(wallet, value ?? { online: false, lastSeen: 0 });
          emit();
        }),
      ]);
    }

    for (const [wallet, subs] of detail) {
      if (located.has(wallet)) continue;
      for (const off of subs) off();
      detail.delete(wallet);
      users.delete(wallet);
      presence.delete(wallet);
    }
  };

  const bounds = radiusQueryBounds(center, input.radius);

  const unsubscribes = bounds.map(([start, end], index) =>
    onValue(
      query(
        ref(database, paths.locations()),
        orderByChild('geohash'),
        startAt(start),
        endAt(end),
      ),
      (snapshot) => {
        const seen = new Set<string>();
        const value = (snapshot.val() ?? {}) as Record<string, RemoteLocation>;

        for (const [wallet, location] of Object.entries(value)) {
          if (typeof location?.latitude !== 'number') continue;
          seen.add(wallet);
          located.set(wallet, location);
        }

        // Anyone this bound used to return and no longer does has left its
        // cells. Drop them unless another bound still holds them.
        const previous = byBound.get(index);
        if (previous) {
          for (const wallet of previous) {
            if (seen.has(wallet)) continue;
            const heldElsewhere = [...byBound.entries()].some(
              ([other, set]) => other !== index && set.has(wallet),
            );
            if (!heldElsewhere) located.delete(wallet);
          }
        }
        byBound.set(index, seen);

        reconcile();
        emit();
      },
      (error) => input.handlers.onError?.(error),
    ),
  );

  // Freshness is a function of the clock, so it needs a tick of its own. It
  // touches nothing remote - it only re-runs the filter that is already local.
  const sweep = setInterval(emit, SWEEP_INTERVAL);

  return {
    stop: () => {
      stopped = true;
      clearInterval(sweep);
      for (const off of unsubscribes) off();
      for (const subs of detail.values()) for (const off of subs) off();
      detail.clear();
    },
  };
}
