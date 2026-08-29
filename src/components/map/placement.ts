import type { DistanceBucket } from '@/chain/midnight/types';

/**
 * Turning a proved bucket into something a real map can draw.
 *
 * The proximity circuit discloses a bucket and nothing else, so there is no
 * coordinate to plot. What there *is* is a constraint: "this person is within
 * N metres of me". A real map can honour that constraint honestly by drawing
 * the whole region the constraint permits, rather than a pin it has no right
 * to draw.
 *
 * So each person gets two numbers:
 *
 *   reach - the radius their bucket proves. The disc they could be anywhere in.
 *   area  - the radius actually drawn on the map, centred on a bearing that is
 *           derived from a hash of their id and therefore carries no bearing
 *           information at all.
 *
 * The bearing is the part worth being careful about. A real bearing plus a
 * bucket is very nearly a coordinate, so it is deliberately fabricated: people
 * are spread evenly around their ring by rank, with the hash used only as
 * jitter so the arrangement is stable between sessions and does not visibly
 * snap to a lattice.
 */

/** The demo city. Manhattan, because the roster's areas are Manhattan areas. */
export const ORIGIN = { lat: 40.7686, lng: -73.9782 } as const;

/** Metres the bucket actually proves. These match `proximity.compact`. */
export const BUCKET_REACH_M: Record<DistanceBucket, number> = {
  0: 500,
  1: 1500,
  2: 3000,
  3: 8000,
};

/**
 * Radius of the disc drawn on the map, in metres.
 *
 * Smaller than the reach on purpose: a disc the full width of the reach from a
 * centre that is itself somewhere inside the reach would cover twice the true
 * constraint and read as noise. These are sized so the discs tile the city
 * legibly while still being unmistakably regions.
 */
export const BUCKET_AREA_M: Record<DistanceBucket, number> = {
  0: 260,
  1: 620,
  2: 1250,
  3: 2600,
};

const METRES_PER_DEGREE_LAT = 111_320;

export type PlacedSubject = {
  id: string;
  lat: number;
  lng: number;
  /** Drawn disc radius, metres. */
  area: number;
  bucket: DistanceBucket;
};

export type PlaceInput = { id: string; bucket: DistanceBucket };

/**
 * Offsets a lat/lng by a metre vector. Equirectangular, which is exact enough
 * at the few-kilometre scale this map ever spans.
 */
export function offsetMetres(
  lat: number,
  lng: number,
  east: number,
  north: number,
): { lat: number; lng: number } {
  const dLat = north / METRES_PER_DEGREE_LAT;
  const dLng = east / (METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

export function placeSubjects(subjects: PlaceInput[]): PlacedSubject[] {
  // Rank within a bucket so a ring's occupants spread around it rather than
  // stacking on one bearing.
  const totals = new Map<number, number>();
  for (const s of subjects) totals.set(s.bucket, (totals.get(s.bucket) ?? 0) + 1);
  const seen = new Map<number, number>();

  return subjects.map((subject) => {
    const rank = seen.get(subject.bucket) ?? 0;
    seen.set(subject.bucket, rank + 1);

    const total = totals.get(subject.bucket) ?? 1;
    const slot = (2 * Math.PI) / total;
    const h = hash(subject.id);
    // Each bucket starts at its own phase, so rings do not line up radially.
    const phase = subject.bucket * 0.72;
    const jitter = ((h % 1000) / 1000 - 0.5) * slot * 0.62;
    const angle = phase + rank * slot + jitter;

    const reach = BUCKET_REACH_M[subject.bucket];
    // Somewhere in the outer half of the ring, so the disc sits inside the
    // reach it is claiming rather than straddling the origin.
    const span = 0.44 + ((Math.floor(h / 1000) % 1000) / 1000) * 0.34;
    const distance = reach * span;

    const { lat, lng } = offsetMetres(
      ORIGIN.lat,
      ORIGIN.lng,
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
    );

    return { id: subject.id, lat, lng, area: BUCKET_AREA_M[subject.bucket], bucket: subject.bucket };
  });
}

/** FNV-1a. Small, stable, no dependency. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
