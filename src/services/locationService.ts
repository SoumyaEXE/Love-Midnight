import { Platform } from 'react-native';
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

/**
 * Why a one-off fix did not arrive.
 *
 * Three outcomes rather than a null, because the three need different sentences
 * on screen and the user can only act on one of them. "You blocked this site",
 * "your machine has no way to locate itself" and "nothing came back at all" are
 * the same blank map for entirely different reasons.
 */
export type FixOutcome =
  | { ok: true; coords: Coords }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' };

/**
 * Milliseconds. How long the *machine* may take before we give up on it.
 *
 * There has to be a number here, and the reason is specific to the browser.
 * `expo-location`'s web backend calls `navigator.geolocation.getCurrentPosition`
 * without a `timeout` in its options - both when it prompts for permission and
 * when it reads a position - and the W3C default for that field is `Infinity`.
 * On a device that cannot locate itself at all (a desktop with no GPS and the
 * OS location service switched off) some browsers then call neither the success
 * nor the error callback, ever. The promise does not reject, so a `catch` never
 * runs and a spinner tied to it spins for the rest of the session.
 *
 * A deadline turns that into an answer. Twelve seconds is well past a cold GPS
 * lock and well short of the point where a person concludes the button is dead.
 */
const FIX_DEADLINE = 12_000;

/**
 * Milliseconds, and deliberately much longer.
 *
 * This one spans a dialog a human has to answer, so it is not measuring the
 * machine - it is the backstop for the same never-settles bug happening *after*
 * the user presses Allow. Tripping it is cheap: permission has been granted by
 * then, so tapping again skips the prompt entirely and takes the fast path.
 */
const PROMPT_DEADLINE = 25_000;

/**
 * Resolves to `expired` if `work` has not settled in time.
 *
 * The timer is cleared on the way out so a resolved call does not hold the
 * event loop open for the remainder of the deadline.
 */
async function withDeadline<T>(work: Promise<T>, ms: number, expired: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(expired), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Options for a one-off read.
 *
 * `timeout` is not part of expo's `LocationOptions`, hence the cast - but on
 * web every option is spread straight into the W3C call, so this is the only
 * way to give the browser its own deadline rather than relying solely on the
 * race above. Native has no such field and ignores it, so it is only sent
 * where it means something.
 */
const ONE_SHOT = {
  // Balanced is ~100 m, finer than anything this app displays.
  accuracy: Location.Accuracy.Balanced,
  ...(Platform.OS === 'web' ? { timeout: FIX_DEADLINE } : null),
} as Location.LocationOptions;

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

    // Deadlined for the same reason `requestFix` is. This one runs at boot and
    // nothing is watching it, so a hang here is invisible rather than annoying
    // - but it would also pin an unresolved promise for the whole session.
    const position = await withDeadline(Location.getCurrentPositionAsync(ONE_SHOT), FIX_DEADLINE, null);
    if (!position) return null;

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

/**
 * One position, prompting for permission if it has not been asked yet.
 *
 * The counterpart to `currentFix`, and the split matters on web. There,
 * `getForegroundPermissionsAsync` reports `undetermined` until something
 * actually asks - the Permissions API answers "prompt", not "granted" - so
 * `currentFix` correctly returns null and the map sits on its fallback origin
 * forever. On a handset the sharing toggle eventually asks; in a browser, with
 * no wallet connected, nothing ever did.
 *
 * So this exists to be called from a user gesture, where a permission dialog is
 * expected rather than ambient. It still publishes nothing.
 */
export async function requestFix(): Promise<FixOutcome> {
  try {
    /*
     * Read before asking.
     *
     * `requestForegroundPermissionsAsync` on web only raises a dialog when the
     * browser reports `prompt`; for `granted` and `denied` it answers from the
     * Permissions API immediately. Checking first therefore costs nothing and
     * buys the distinction that matters here: an already-granted user never
     * enters the branch that can block on a dialog, so their wait is bounded by
     * `FIX_DEADLINE` alone rather than by the much longer prompt backstop.
     */
    const existing = await Location.getForegroundPermissionsAsync().catch(() => null);

    if (existing?.status === Location.PermissionStatus.DENIED && !existing.canAskAgain) {
      return { ok: false, reason: 'denied' };
    }

    if (existing?.status !== Location.PermissionStatus.GRANTED) {
      const asked = await withDeadline(
        Location.requestForegroundPermissionsAsync(),
        PROMPT_DEADLINE,
        null,
      );
      if (!asked) return { ok: false, reason: 'timeout' };
      /*
       * `granted` rather than `status`, and that is not a style choice.
       *
       * When the browser raises the dialog, expo's web backend resolves the
       * non-denial error branch as `{ status: GRANTED, granted: false }` - so a
       * device that showed the prompt, was allowed, and then failed to produce
       * a position reports a GRANTED *status* with no permission behind it.
       * Testing `status` alone would read that as success and fall through to a
       * position read that cannot succeed either.
       */
      if (!asked.granted) {
        return { ok: false, reason: asked.status === Location.PermissionStatus.DENIED ? 'denied' : 'unavailable' };
      }
    }

    const position = await withDeadline(Location.getCurrentPositionAsync(ONE_SHOT), FIX_DEADLINE, null);
    if (!position) return { ok: false, reason: 'timeout' };

    return {
      ok: true,
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
    };
  } catch {
    // A rejection here is the browser saying it has no position to give -
    // POSITION_UNAVAILABLE, or no geolocation provider at all.
    return { ok: false, reason: 'unavailable' };
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
