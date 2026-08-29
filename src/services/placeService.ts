import * as Location from 'expo-location';
import { localeKey, type Coords } from '@/firebase/geo';

/**
 * "Kolkata, West Bengal".
 *
 * The one thing another user is told about *where* somebody is. It is produced
 * on this device by the platform's own geocoder - no coordinate is sent
 * anywhere to obtain it - and it is deliberately assembled from the coarsest
 * fields the geocoder returns.
 *
 * What is excluded matters more than what is included. `street`,
 * `streetNumber`, `postalCode` and `name` are all in the geocoder's answer, and
 * every one of them would undo the point: "Tower Bridge" is a position, and a
 * postal code in most countries is a few hundred addresses. Only city, region
 * and country are ever read, and the exclusion is written as a whitelist so
 * that a future edit has to opt a field in rather than forget to opt it out.
 */

/** Cached by ~5 km cell: the answer cannot change inside one. */
const cache = new Map<string, string | null>();

/** Bounded, so a long walk cannot grow it without limit. */
const MAX_CACHED = 64;

export async function placeFor(coords: Coords): Promise<string | null> {
  const key = localeKey(coords);

  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let label: string | null = null;
  try {
    const [address] = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    if (address) label = compose(address);
  } catch {
    // The geocoder is a system service and is allowed to be unavailable -
    // offline, throttled, or missing on the device. A card without a place line
    // is a smaller loss than a failed location update.
    label = null;
  }

  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, label);

  return label;
}

/**
 * City and region, or the coarsest pair available.
 *
 * `subregion` and `district` are city-level administrative areas, so they stand
 * in when a fix lands outside a named city. Anything finer is not consulted.
 */
function compose(address: Location.LocationGeocodedAddress): string | null {
  const locality = address.city ?? address.subregion ?? address.district ?? null;
  const area = address.region ?? address.country ?? null;

  if (locality && area && locality !== area) return `${locality}, ${area}`;
  return locality ?? area ?? null;
}

/** Test seam and a reset for "reset identity". */
export function forgetPlaces(): void {
  cache.clear();
}
