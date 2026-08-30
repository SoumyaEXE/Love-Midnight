/**
 * Platform entry point for the map.
 *
 * This shim exists because of how the two implementations are selected.
 * `LeafletMapView.web.tsx` is the browser host - an `<iframe srcdoc>` - and
 * `LeafletMapView.tsx` is the native one, built on `react-native-webview`,
 * which has no web implementation at all.
 *
 * Screens import this module through the `@/` alias, and Expo's tsconfig-paths
 * resolution does not carry platform extensions: `@/components/map/LeafletMap`
 * resolves to the `.tsx` file on every platform, so a `LeafletMap.web.tsx`
 * sibling is simply never loaded. A *relative* specifier does go through
 * Metro's ordinary resolution, which does apply them - so the re-export below
 * is what actually performs the platform split.
 *
 * A `Platform.OS` branch would not work here, unlike in `glass/GlassRim`. Both
 * branches would have to be imported statically, and pulling
 * `react-native-webview` into the web bundle is the thing being avoided.
 */
export { LeafletMap } from './LeafletMapView';
export type { LeafletMapProps, MapSubject } from './LeafletMapView';
