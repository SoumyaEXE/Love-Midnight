import { geohashForLocation, geohashQueryBounds } from 'geofire-common';

/**
 * Distance, and the indexing that keeps it from costing a full table scan.
 *
 * Two separate jobs, and conflating them is the usual mistake:
 *
 *   the *index* narrows the candidate set. A geohash is a prefix code for a
 *   cell on the globe, so "everyone within 5 km" becomes a handful of string
 *   range queries the database can answer from an index rather than a download
 *   of every user followed by arithmetic on the client.
 *
 *   the *filter* is exact. Geohash ranges over-select - the cells covering a
 *   circle are a jagged superset of it - so every candidate is still measured
 *   with Haversine and dropped if it falls outside the radius. Comparing raw
 *   latitude and longitude would be wrong twice over: a degree of longitude is
 *   not a degree of latitude, and neither is a metre.
 */

/** Mean Earth radius, metres. */
const EARTH_RADIUS = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export type Coords = { latitude: number; longitude: number };

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the equirectangular approximation: the app offers a
 * 25 km radius, and the cheap approximation is already visibly wrong at that
 * range near the poles.
 */
export function haversineMeters(a: Coords, b: Coords): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The stored index key for a position. */
export function geohashFor({ latitude, longitude }: Coords): string {
  return geohashForLocation([latitude, longitude]);
}

/**
 * A key that changes at city scale, for caching a place label.
 *
 * Precision 5 is roughly a 5 km box - fine enough that crossing into the next
 * city changes it, coarse enough that walking around inside one does not.
 * Reverse geocoding is a system service the docs explicitly ask you not to
 * hammer, and re-asking it what city you are in every 250 m would be hammering
 * it to learn something that has not changed.
 */
export function localeKey({ latitude, longitude }: Coords): string {
  return geohashForLocation([latitude, longitude], 5);
}

// -----------------------------------------------------------------------------
// coarsening
// -----------------------------------------------------------------------------

/**
 * Metres. The same 250 m grid the proximity circuit commits to - see
 * `chain/midnight/prover.toCell`, and `snapToGrid` below for why the two are
 * computed separately rather than one calling the other.
 */
const GRID_METRES = 250;
const METRES_PER_DEGREE_LAT = 111_320;

/**
 * Worst-case error introduced by snapping: half the cell's diagonal.
 *
 * Published as the record's `accuracy`, because that is what the accuracy of a
 * published position now *is*. Reporting the GPS receiver's own figure next to
 * a coordinate that has been moved up to 177 m would be worse than reporting
 * nothing - it would be a precise-sounding number about the wrong quantity.
 */
export const GRID_UNCERTAINTY = Math.round((GRID_METRES * Math.SQRT2) / 2);

/**
 * Moves a fix to the centre of its grid cell.
 *
 * This is the whole privacy story for published positions, and it is not a new
 * one - it is the promise onboarding already makes ("your fix is snapped to a
 * 250 m grid on this device") applied to the thing that actually leaves the
 * device. Everyone standing in the same 250 m square publishes a byte-identical
 * coordinate, so the record cannot distinguish a doorstep from the junction at
 * the end of the road.
 *
 * "Byte-identical" is the requirement, and it is why this does not simply call
 * `toCell` and invert it. That function scales longitude by the cosine of the
 * caller's *own* latitude, which is fine for a commitment - each party hashes
 * their own cell - but means two people a few metres apart derive very slightly
 * different longitude bases and land on points that differ in the seventh
 * decimal. Two coordinates that differ at all are two distinguishable people,
 * and the grid would be decorative.
 *
 * So the snap is done in two dependent steps: latitude first, then the
 * longitude scale taken from the *snapped* latitude, which every occupant of
 * the cell shares by construction. Same grid, same 250 m, one canonical centre.
 */
export function snapToGrid({ latitude, longitude }: Coords): Coords {
  const latIndex = Math.floor((latitude * METRES_PER_DEGREE_LAT) / GRID_METRES);
  const snappedLat = ((latIndex + 0.5) * GRID_METRES) / METRES_PER_DEGREE_LAT;

  // Near the poles a degree of longitude collapses toward zero metres and the
  // division blows up. Clamping the scale caps the cell's width instead, which
  // is a harmless distortion somewhere nobody is being discovered.
  const metresPerDegreeLon = Math.max(
    1,
    METRES_PER_DEGREE_LAT * Math.cos((snappedLat * Math.PI) / 180),
  );

  const lonIndex = Math.floor((longitude * metresPerDegreeLon) / GRID_METRES);
  const snappedLon = ((lonIndex + 0.5) * GRID_METRES) / metresPerDegreeLon;

  return { latitude: snappedLat, longitude: snappedLon };
}

/**
 * The string ranges covering a circle.
 *
 * Each is a `[start, end]` pair to be run as
 * `orderByChild('geohash').startAt(start).endAt(end)`. Typically four to nine
 * of them; never a scan of the whole node.
 */
export function radiusQueryBounds(center: Coords, radiusMeters: number): [string, string][] {
  return geohashQueryBounds([center.latitude, center.longitude], radiusMeters) as [
    string,
    string,
  ][];
}

/**
 * Radii offered in the UI, in metres.
 *
 * Metres internally, always. The label is a presentation concern and the two
 * must not be allowed to drift into each other - a preference stored as "5 km"
 * is a preference that has to be parsed before it can be compared.
 */
export const RADIUS_CHOICES = [500, 1000, 2000, 5000, 10_000, 25_000] as const;

export const DEFAULT_RADIUS = 5000;

/** `500 m`, `5 km`. Used for the radius chips. */
export function formatRadius(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${meters / 1000} km`;
}

/**
 * How far away someone is, said the way a person would say it.
 *
 * The granularity is set by the data, not by taste. Both positions have been
 * snapped to a 250 m grid, so each carries up to `GRID_UNCERTAINTY` of error
 * and the distance between them carries up to twice that - about 350 m. A
 * label reading "120 m away" would therefore be a fabrication: the underlying
 * number does not contain that information, and printing it anyway is how a
 * privacy measure gets quietly undone at the render layer.
 *
 * So nothing under half a kilometre is quantified, and kilometres are rounded
 * to the nearest half.
 */
export function formatDistance(meters: number): string {
  if (meters < 500) return 'within 500 m';
  if (meters < 1000) return 'under 1 km away';
  if (meters < 10_000) return `${(Math.round(meters / 500) / 2).toFixed(1)} km away`;
  return `${Math.round(meters / 1000)} km away`;
}
