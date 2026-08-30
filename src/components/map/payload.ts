import { useEffect, useMemo, useState } from 'react';
import { BUCKET_REACH_M, ORIGIN, placeSubjects, type LatLng } from '@/components/map/placement';
import { cartoTileTemplate } from '@/config/map';
import { gravatarUrl } from '@/data/gravatar';
import { DISTANCE_LABEL, type DistanceBucket } from '@/chain/midnight/types';

/**
 * Everything the two map hosts share.
 *
 * There are two of them because the transports have nothing in common: native
 * renders the document in a `react-native-webview` and talks to it by injecting
 * source, and web renders the same document in an `<iframe srcdoc>` and talks
 * to it over `postMessage`. What is *not* different is the payload - the same
 * placement, the same avatars, the same fit key - so it lives here rather than
 * being written twice and drifting.
 */

export type MapSubject = {
  id: string;
  name: string;
  email: string;
  bucket: DistanceBucket;
  online?: boolean;
  area?: string;
  /**
   * Real published position, for a discovered user. Absent for a roster
   * persona, which has only a bucket and gets a fabricated bearing instead.
   */
  lat?: number;
  lng?: number;
};

export type Payload = {
  self: { lat: number; lng: number };
  live: boolean;
  label: string;
  reach: string;
  fitKey: string;
  subjects: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    area: number;
    avatar: string | null;
    online: boolean;
    selected: boolean;
    dim: boolean;
  }>;
};

/** 500 -> "500 m", 1500 -> "1.5 km", 8000 -> "8 km". */
export function formatReach(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  return `${Number((metres / 1000).toFixed(1))} km`;
}

/**
 * Hands the tile source to the page.
 *
 * Built through JSON.stringify rather than string concatenation: the token is
 * opaque, and this value becomes source inside the page.
 */
export function tileBootstrap(): string {
  return `window.__HALO_TILES = ${JSON.stringify({ url: cartoTileTemplate() })};`;
}

export type MapPayloadInput = {
  subjects: MapSubject[];
  selectedId?: string | null;
  maxBucket: DistanceBucket;
  center?: LatLng | null;
  live: boolean;
};

export function useMapPayload({
  subjects,
  selectedId,
  maxBucket,
  center,
  live,
}: MapPayloadInput): Payload {
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  // Gravatar keys on a SHA-256 that resolves asynchronously, so the markers
  // paint without images on the first frame and gain them a tick later. The
  // page is not re-sourced for this - only re-rendered.
  useEffect(() => {
    let alive = true;
    void Promise.all(
      subjects.map(async (s) => [s.id, await gravatarUrl(s.email, { size: 132 })] as const),
    ).then((pairs) => {
      if (alive) setAvatars(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [subjects]);

  // The user's own cell when there is one, the demo city until then.
  const origin = center ?? ORIGIN;

  const placed = useMemo(() => placeSubjects(subjects, origin), [subjects, origin.lat, origin.lng]);

  return useMemo<Payload>(() => {
    const byId = new Map(placed.map((p) => [p.id, p]));
    return {
      self: { lat: origin.lat, lng: origin.lng },
      live,
      label: DISTANCE_LABEL[maxBucket],
      // The chips name a bucket; the map states what the bucket is worth in
      // metres. Without it "Walkable" is a mood rather than a distance.
      reach: formatReach(BUCKET_REACH_M[maxBucket]),
      // Changing the filter is the only thing that should re-frame the map. A
      // selection or a late-arriving avatar must not yank the viewport out from
      // under someone who has panned somewhere.
      //
      // The origin is in the key because arriving at a *different city* is the
      // one other thing that must re-frame: the first fix replaces the demo
      // origin, and without this the viewport would stay over Manhattan with
      // every marker several thousand kilometres off screen. Rounded to ~100 m
      // so an ordinary walk does not keep yanking the frame back.
      fitKey: `b${maxBucket}:${subjects.length}:${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`,
      subjects: subjects.map((s) => {
        const p = byId.get(s.id);
        return {
          id: s.id,
          name: s.name,
          lat: p?.lat ?? origin.lat,
          lng: p?.lng ?? origin.lng,
          area: p?.area ?? 500,
          avatar: avatars[s.id] ?? null,
          online: !!s.online,
          selected: selectedId === s.id,
          dim: s.bucket > maxBucket,
        };
      }),
    };
  }, [subjects, placed, avatars, selectedId, maxBucket, live, origin.lat, origin.lng]);
}

/**
 * The payload as JS source, safe to inject.
 *
 * U+2028/2029 are valid in JSON strings but terminate a JS line, so they have
 * to be escaped before the payload becomes source.
 */
export function payloadSource(payload: Payload): string {
  return JSON.stringify(payload)
    .replace(/\u2028/g, '\u2028')
    .replace(/\u2029/g, '\u2029');
}
