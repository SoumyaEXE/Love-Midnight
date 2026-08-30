import * as Location from 'expo-location';
import { ref, remove, set } from 'firebase/database';
import { database } from '@/firebase/config';
import { ensureSession } from '@/firebase/auth';
import { paths } from '@/firebase/paths';
import {
  geohashFor,
  GRID_UNCERTAINTY,
  haversineMeters,
  snapToGrid,
  type Coords,
} from '@/firebase/geo';
import { placeFor } from './placeService';
import type { RemoteLocation } from '@/firebase/types';

/**
 * Publishing a position.
 *
 * `expo-location`'s watcher is the device geolocation API on this platform -
 * on web it is `navigator.geolocation.watchPosition` underneath, and on a
 * handset it is the platform location manager, which is the thing
 * `navigator.geolocation` is shimmed onto in React Native. Going through
 * expo-location rather than the global gets the permission prompt, the
 * accuracy enum, and a subscription that can actually be removed.
 *
 * Everything interesting here is about *not* writing.
 *
 * A GPS callback fires far more often than anyone's position meaningfully
 * changes - standing still on a phone with a poor fix produces a steady drizzle
 * of updates that differ by a few metres of noise. Writing each one would cost
 * hundreds of database writes a minute, drain the battery for no information,
 * and tell every listener downstream that something changed when nothing did.
 *
 * So a write happens only when one of two things is true:
 *
 *   the fix moved into a different 250 m cell than the one on record, or
 *   `MAX_INTERVAL` has passed since the last write.
 *
 * The second clause is not a fallback, it is a heartbeat: `STALE_AFTER` in the
 * discovery query drops anyone whose record has gone quiet, so a stationary
 * user has to keep saying so or they correctly stop being discoverable.
 */

/**
 * Metres. What the OS is asked to filter on before waking us at all.
 *
 * Deliberately smaller than the grid: the callback is also what feeds the
 * device's own map centre and the discovery query, both of which want the real
 * fix. The coarsening happens on the way out, not on the way in.
 */
const MIN_DISTANCE = 75;

/** Milliseconds. The heartbeat, comfortably inside `STALE_AFTER`. */
const MAX_INTERVAL = 120_000;

/**
 * How old a position may be and still count as "nearby". Two heartbeats plus
 * slack, so one missed write does not blink someone off the map.
 */
export const STALE_AFTER = 5 * 60_000;

export type LocationError =
  | 'permission-denied'
  | 'unavailable'
  | 'write-failed';

export type LocationWatchHandlers = {
  onFix?: (coords: Coords & { accuracy: number | null }) => void;
  onPublish?: (at: number) => void;
  onError?: (error: LocationError) => void;
};

export type LocationWatch = { stop: () => void };

/**
 * Writes one position.
 *
 * The exact fix never reaches the database. It is snapped to the app's 250 m
 * grid first, and it is the *snapped* point that is stored, indexed, and later
 * measured against - so the finest thing any other client can learn is which
 * 250 m square somebody is in, and the finest thing the UI can say is a
 * half-kilometre band and a city name.
 *
 * Exported for the "publish now" path in onboarding.
 */
export async function publishLocation(
  wallet: string,
  coords: Coords & { accuracy?: number | null },
): Promise<number> {
  await ensureSession();

  const cell = snapToGrid(coords);
  // Geocoded from the exact fix, because the answer is a city either way and
  // the geocoder never leaves the device. Failure is fine: the field is simply
  // absent, and the card drops its place line.
  const place = await placeFor(coords);

  const timestamp = Date.now();
  const record: RemoteLocation = {
    latitude: cell.latitude,
    longitude: cell.longitude,
    // The accuracy of the *published* point, not of the receiver. Snapping
    // dominates any modern fix, so this is the honest figure.
    accuracy: Math.max(GRID_UNCERTAINTY, Math.round(coords.accuracy ?? 0)),
    timestamp,
    geohash: geohashFor(cell),
    ...(place ? { place } : {}),
  };

  await set(ref(database, paths.location(wallet)), record);
  return timestamp;
}

/**
 * One position, for the map to centre on. Publishes nothing.
 *
 * Reading a fix and publishing a fix are different concerns, and conflating
 * them was a bug: `here` was only ever assigned inside the sharing watcher, so
 * a user who had not switched sharing on had no fix at all, and the map fell
 * back to its demo origin and drew a New York street grid underneath them.
 * Centring the map is not a disclosure - nothing leaves the device - so it does
 * not need to wait on the switch that governs what does.
 *
 * Deliberately never prompts. `getForegroundPermissionsAsync` only reports what
 * has already been granted; asking here would put a permission dialog on cold
 * start, before the user has touched anything that implies location. The
 * request belongs to the sharing toggle, which is where the user asked for it.
 */
export async function currentFix(): Promise<Coords | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    // No fix is a normal outcome - indoors, airplane mode, a cold GPS. The map
    // has a fallback origin for exactly this.
    return null;
  }
}

/** Stops being discoverable. The record is removed, not flagged. */
export async function clearLocation(wallet: string): Promise<void> {
  await remove(ref(database, paths.location(wallet)));
}

/**
 * Starts a throttled publish loop. Returns a handle; call `stop` on unmount or
 * when sharing is switched off.
 */
export async function watchLocation(
  wallet: string,
  handlers: LocationWatchHandlers = {},
): Promise<LocationWatch> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    handlers.onError?.('permission-denied');
    return { stop: () => {} };
  }

  /** The last cell actually written, not the last fix received. */
  let lastCell: Coords | null = null;
  let lastWriteAt = 0;
  let inFlight = false;
  let stopped = false;

  const consider = async (coords: Coords & { accuracy: number | null }) => {
    if (stopped || inFlight) return;

    const aged = Date.now() - lastWriteAt;
    const cell = snapToGrid(coords);

    // The gate is the *cell*, not the fix. Since only the snapped point is
    // ever published, a fix that lands in the square already on record carries
    // no new information, and writing it would spend a write and wake every
    // listener downstream to tell them nothing changed.
    const sameCell =
      lastCell !== null &&
      cell.latitude === lastCell.latitude &&
      cell.longitude === lastCell.longitude;

    if (sameCell && aged < MAX_INTERVAL) return;

    inFlight = true;
    try {
      const at = await publishLocation(wallet, coords);
      lastCell = cell;
      lastWriteAt = at;
      handlers.onPublish?.(at);
    } catch {
      handlers.onError?.('write-failed');
    } finally {
      inFlight = false;
    }
  };

  let subscription: Location.LocationSubscription;
  try {
    subscription = await Location.watchPositionAsync(
      {
        // Balanced is ~100 m, which is finer than anything this app displays -
        // the closest label it will ever render is "within 100 m". Asking for
        // High would cost battery to produce precision that is thrown away.
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15_000,
        distanceInterval: MIN_DISTANCE,
      },
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        handlers.onFix?.(coords);
        void consider(coords);
      },
      () => handlers.onError?.('unavailable'),
    );
  } catch {
    handlers.onError?.('unavailable');
    return { stop: () => {} };
  }

  return {
    stop: () => {
      stopped = true;
      subscription.remove();
    },
  };
}
