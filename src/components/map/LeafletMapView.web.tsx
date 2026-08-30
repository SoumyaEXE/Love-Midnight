import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { MAP_HTML } from '@/components/map/mapDocument';
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
 * The map, on web.
 *
 * Metro resolves this file in place of `LeafletMap.tsx` for the web bundle,
 * because `react-native-webview` has no web implementation - it is a native
 * module, and importing it in a browser yields a component that renders
 * nothing. The map document itself is identical; only the host differs.
 *
 * The transport is where the two diverge. Native injects source into the
 * WebView and receives `window.ReactNativeWebView.postMessage`. Here the page
 * is an `<iframe srcdoc>`, and both directions go over `window.postMessage`:
 *
 *   host -> page   `{ type: 'render', payload }`, handled by the shim below
 *   page -> host   the page calls `ReactNativeWebView.postMessage`, which the
 *                  shim redirects to `parent.postMessage`
 *
 * Going through `postMessage` rather than reaching into `contentWindow`
 * directly is deliberate. A `srcdoc` frame inherits the parent's origin today,
 * so direct access mostly works - but it is exactly the assumption that breaks
 * the first time the frame is sandboxed or served from a blob, and it fails as
 * an opaque cross-origin SecurityError rather than as anything diagnosable.
 *
 * `MAP_HTML` is a build-time constant with no interpolation, and the only
 * dynamic value reaching the document is the tile URL, which goes through
 * `JSON.stringify`. So `srcDoc` here is not an injection surface.
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
   * Native raises this while a finger is on the map so the host can freeze its
   * ScrollView. The browser has no equivalent problem - the iframe consumes the
   * gesture itself - so it is accepted and never called, rather than dropped
   * from the type and made a per-platform prop.
   */
  onInteractionChange?: (active: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bridges the document's native-shaped API onto `postMessage`.
 *
 * Runs ahead of the page's own script, which is at the end of `<body>` and
 * waits on `DOMContentLoaded` - so `__HALO_TILES` is in place before Leaflet
 * builds its tile layer, and the first paint is the right basemap rather than
 * a frame of the wrong one.
 */
const BRIDGE = `<script>
${tileBootstrap()}
window.ReactNativeWebView = {
  postMessage: function (data) { parent.postMessage(data, '*'); }
};
window.addEventListener('message', function (event) {
  try {
    var message = JSON.parse(event.data);
    if (message && message.type === 'render' && window.__halo) {
      window.__halo.render(message.payload);
    }
  } catch (error) {
    /* Not every message on this channel is ours - dev tooling shares it. */
  }
});
</script>`;

export function LeafletMap({
  width,
  height,
  subjects,
  selectedId,
  onSelect,
  maxBucket = 3,
  center = null,
  live = true,
  style,
}: LeafletMapProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const payload = useMapPayload({ subjects, selectedId, maxBucket, center, live });

  // The bridge goes immediately after <head>, so it precedes both Leaflet and
  // the document's own script. Computed once - re-sourcing the frame would
  // reload the basemap and throw away the user's pan.
  const srcDoc = useMemo(() => MAP_HTML.replace('<head>', `<head>${BRIDGE}`), []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Anything not from our own frame is somebody else's traffic - the dev
      // server's HMR client also broadcasts on this channel.
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as { type: string; id?: string };
        if (message.type === 'ready') setReady(true);
        else if (message.type === 'error') setFailed(true);
        else if (message.type === 'select' && message.id) onSelect?.(message.id);
      } catch {
        // A malformed message from the page is not worth crashing the screen.
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelect]);

  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage(
      `{"type":"render","payload":${payloadSource(payload)}}`,
      '*',
    );
  }, [ready, payload]);

  return (
    <View style={[{ width, height }, styles.root, style]}>
      {/* Rendered directly rather than through a RN primitive: react-native-web
          has no iframe, and this component only ever runs in a browser. */}
      <iframe
        ref={frame}
        srcDoc={srcDoc}
        title="Map"
        // No allow-same-origin: the page needs no access to this origin's
        // storage, and withholding it keeps the frame opaque to the parent.
        // The postMessage bridge above is what makes that survivable.
        sandbox="allow-scripts"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: '#0B0813',
        }}
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
  cover: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  offline: { textAlign: 'center' },
});
