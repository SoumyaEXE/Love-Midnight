import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { MAP_HTML } from '@/components/map/mapDocument';
import { cartoTileTemplate, mapConfig } from '@/config/map';
import { BUCKET_REACH_M, ORIGIN, placeSubjects } from '@/components/map/placement';
import { gravatarUrl } from '@/data/gravatar';
import { DISTANCE_LABEL, type DistanceBucket } from '@/chain/midnight/types';

/**
 * The map.
 *
 * A real basemap, drawn by Leaflet in a WebView over CARTO's dark tiles. The
 * previous version drew a procedural city with Skia, which was honest about
 * holding no coordinates but looked like a radar; a real map makes the *areas*
 * legible, because a 1.2km disc means something once there are streets under it.
 *
 * What is plotted is still never a person's position. Halo does not have one:
 * the proximity circuit yields a bucket, so what goes on the map is the region
 * that bucket permits, on a bearing fabricated from a hash of the id. See
 * `placement.ts` for why the bearing is fabricated rather than derived.
 *
 * One caveat worth stating plainly, because it is a genuine cost of using real
 * tiles: tile requests carry the viewport to CARTO's CDN. That viewport is the
 * demo city, identical for every user and unrelated to where anyone actually
 * is, so nothing about a user leaks - but a self-hosted or bundled tile set is
 * the answer if this ever centres on a real location.
 */

export type MapSubject = {
  id: string;
  name: string;
  email: string;
  bucket: DistanceBucket;
  online?: boolean;
  area?: string;
};

export type LeafletMapProps = {
  width: number;
  height: number;
  subjects: MapSubject[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Widest bucket being broadcast. Areas beyond it dim rather than vanish. */
  maxBucket?: DistanceBucket;
  /** Off when the user has gone invisible. Stops the pulse. */
  live?: boolean;
  /**
   * Raised while a finger is on the map. The host screen uses this to freeze
   * its ScrollView, otherwise a vertical pan scrolls the page instead of the
   * map and the map is effectively undraggable.
   */
  onInteractionChange?: (active: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

type Payload = {
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

export function LeafletMap({
  width,
  height,
  subjects,
  selectedId,
  onSelect,
  maxBucket = 3,
  live = true,
  onInteractionChange,
  style,
}: LeafletMapProps) {
  const webview = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  // Gravatar keys on a SHA-256 that resolves asynchronously, so the markers
  // paint without images on the first frame and gain them a tick later. The
  // WebView is not re-sourced for this - only re-rendered.
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

  const placed = useMemo(() => placeSubjects(subjects), [subjects]);

  const payload = useMemo<Payload>(() => {
    const byId = new Map(placed.map((p) => [p.id, p]));
    return {
      self: { lat: ORIGIN.lat, lng: ORIGIN.lng },
      live,
      label: DISTANCE_LABEL[maxBucket],
      // The chips name a bucket; the map states what the bucket is worth in
      // metres. Without it "Walkable" is a mood rather than a distance.
      reach: formatReach(BUCKET_REACH_M[maxBucket]),
      // Changing the filter is the only thing that should re-frame the map. A
      // selection or a late-arriving avatar must not yank the viewport out from
      // under someone who has panned somewhere.
      fitKey: `b${maxBucket}:${subjects.length}`,
      subjects: subjects.map((s) => {
        const p = byId.get(s.id);
        return {
          id: s.id,
          name: s.name,
          lat: p?.lat ?? ORIGIN.lat,
          lng: p?.lng ?? ORIGIN.lng,
          area: p?.area ?? 500,
          avatar: avatars[s.id] ?? null,
          online: !!s.online,
          selected: selectedId === s.id,
          dim: s.bucket > maxBucket,
        };
      }),
    };
  }, [subjects, placed, avatars, selectedId, maxBucket, live]);

  useEffect(() => {
    if (!ready) return;
    // U+2028/2029 are valid in JSON strings but terminate a JS line, so they
    // have to be escaped before the payload becomes source.
    const json = JSON.stringify(payload)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    webview.current?.injectJavaScript(`window.__halo && window.__halo.render(${json}); true;`);
  }, [ready, payload]);

  /**
   * Freezing the page while a finger is on the map is necessary, but a lock
   * that fails open is a page that cannot scroll at all - a far worse failure
   * than a map that pans stiffly. The watchdog guarantees the lock lifts even
   * if the release event is swallowed by the native WebView.
   */
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
    onInteractionChange?.(false);
  }, [onInteractionChange]);

  const hold = useCallback(() => {
    onInteractionChange?.(true);
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = setTimeout(release, 5000);
  }, [onInteractionChange, release]);

  useEffect(() => release, [release]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data) as { type: string; id?: string };
        if (message.type === 'ready') setReady(true);
        else if (message.type === 'error') setFailed(true);
        else if (message.type === 'select' && message.id) onSelect?.(message.id);
      } catch {
        // A malformed message from the page is not worth crashing the screen.
      }
    },
    [onSelect],
  );

  return (
    <View
      style={[{ width, height }, styles.root, style]}
      // onTouch* bubble to every ancestor of the touch regardless of which view
      // holds the responder, so these still fire with the WebView handling the
      // gesture. Start and end come from the same family deliberately: pairing
      // a capture-phase start with a bubbling end is how a lock gets stuck on.
      onTouchStart={hold}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      <WebView
        ref={webview}
        source={{ html: MAP_HTML, baseUrl: 'https://halo.local/' }}
        // Runs before the document's own scripts, so Leaflet builds its tile
        // layer from the configured source on the first paint rather than
        // showing a frame of the wrong basemap and swapping it.
        injectedJavaScriptBeforeContentLoaded={TILE_BOOTSTRAP}
        originWhitelist={['*']}
        onMessage={onMessage}
        style={styles.web}
        containerStyle={styles.web}
        javaScriptEnabled
        domStorageEnabled
        // The document is a fixed viewport; any scrolling inside it is the map
        // failing to claim the gesture.
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        allowsInlineMediaPlayback
        automaticallyAdjustContentInsets={false}
      />

      {/* Held until Leaflet reports ready, so the map fades in rather than
          revealing a bare tile grid mid-load. */}
      {ready ? null : (
        <LinearGradient
          colors={['#150E22', '#0B0813']}
          style={[StyleSheet.absoluteFill, styles.cover]}
          pointerEvents="none"
        >
          {failed ? (
            <Text style={[type.caption, styles.offline]}>
              Map unavailable offline. Distances below are unaffected.
            </Text>
          ) : null}
        </LinearGradient>
      )}
    </View>
  );
}

/**
 * Hands the tile source to the page.
 *
 * Built through JSON.stringify rather than string concatenation: the token is
 * opaque, and this value becomes source inside the WebView.
 */
const TILE_BOOTSTRAP = `window.__HALO_TILES = ${JSON.stringify({
  url: cartoTileTemplate(),
  attribution: mapConfig.attribution,
})}; true;`;

/** 500 -> "500 m", 1500 -> "1.5 km", 8000 -> "8 km". */
function formatReach(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  return `${Number((metres / 1000).toFixed(1))} km`;
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radii.sheet,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t08,
    backgroundColor: '#0B0813',
  },
  web: { flex: 1, backgroundColor: '#0B0813' },
  cover: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  offline: { textAlign: 'center' },
});
