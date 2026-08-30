import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { MAP_HTML } from '@/components/map/mapDocument';
import { cartoTileTemplate } from '@/config/map';
import { type LatLng } from '@/components/map/placement';
import {
  payloadSource,
  tileBootstrap,
  useMapPayload,
  type MapSubject,
} from '@/components/map/payload';
import { type DistanceBucket } from '@/chain/midnight/types';

export type { MapSubject };

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
 * tiles, and it changed when this map started centring on the user: tile
 * requests carry the viewport to CARTO's CDN. It used to be the demo city,
 * identical for everyone and unrelated to where anyone was, so nothing leaked.
 * With `center` supplied it is the user's own 250 m cell, which means CARTO
 * learns roughly where a user is whenever the map is opened. That is a real
 * disclosure, it is to a CDN rather than to another user, and the answer if it
 * ever matters is a self-hosted or bundled tile set - not a fake viewport,
 * which would only move the lie into the UI.
 */

export type LeafletMapProps = {
  width: number;
  height: number;
  subjects: MapSubject[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Widest bucket being broadcast. Areas beyond it dim rather than vanish. */
  maxBucket?: DistanceBucket;
  /**
   * The user's own position, snapped to the publishing grid. The map centres
   * here and the roster is drawn around it. Null before the first fix, which
   * falls back to the demo city rather than to an empty viewport.
   */
  center?: LatLng | null;
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

export function LeafletMap({
  width,
  height,
  subjects,
  selectedId,
  onSelect,
  maxBucket = 3,
  center = null,
  live = true,
  onInteractionChange,
  style,
}: LeafletMapProps) {
  const webview = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const payload = useMapPayload({ subjects, selectedId, maxBucket, center, live });

  useEffect(() => {
    if (!ready) return;
    const json = payloadSource(payload);
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
        injectedJavaScriptBeforeContentLoaded={`${tileBootstrap()} true;`}
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
