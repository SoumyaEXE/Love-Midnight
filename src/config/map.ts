import Constants from 'expo-constants';

/**
 * Basemap configuration.
 *
 * CARTO exposes two different services behind two different credentials, and
 * conflating them is the easy mistake here:
 *
 *   basemaps.cartocdn.com        the basemap tiles this app draws. Takes a
 *                                *basemap key* on `?key=`. Requests without
 *                                one are served with an "API KEY REQUIRED"
 *                                watermark tiled across the map. The key is
 *                                free, needs no CARTO account, and covers
 *                                5M tile requests a month:
 *                                https://carto.com/basemaps/apikey/
 *
 *   gcp-us-east1.api.carto.com   the Maps API v3 - tilesets and queries against
 *                                a connected data warehouse. Takes a *platform
 *                                access token* as `Authorization: Bearer`.
 *                                Nothing this app renders comes from here.
 *
 * Only the first removes the watermark. The second is configured below because
 * it is the right home for CARTO data layers if they are ever added, but it
 * must never be inlined into the client bundle: a platform token authenticates
 * to the account, not to a map. Hence the deliberate asymmetry - the basemap
 * key uses `EXPO_PUBLIC_`, which Metro inlines, and the platform token does
 * not, so it can only be read where a real environment exists.
 *
 * The basemap key itself is public by construction: it rides on every tile
 * request and is trivially extractable. That is fine, and is what it is for.
 */

type Extra = {
  cartoBasemap?: string;
  cartoBasemapKey?: string;
  cartoApiBase?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** CARTO raster basemap styles. `dark_all` keeps labels. */
export type CartoBasemap = 'dark_all' | 'dark_nolabels' | 'dark_only_labels';

export const mapConfig = {
  /**
   * Basemap key. Empty means unkeyed, which means watermarked tiles - the app
   * still works, it just looks like a trial.
   *
   * Committed in app.json on purpose: it is public by construction, and a
   * clone that renders watermarked tiles until someone is told about a .env is
   * a worse failure than a checked-in token that was always going to be
   * visible in the bundle. The env var wins, so rotating it is a .env edit.
   */
  basemapKey: process.env.EXPO_PUBLIC_CARTO_API_KEY || extra.cartoBasemapKey || '',
  basemap: (extra.cartoBasemap ?? 'dark_all') as CartoBasemap,
  /** Maps API v3 base. Unused by the basemap; see the note above. */
  apiBaseUrl: extra.cartoApiBase ?? 'https://gcp-us-east1.api.carto.com',
} as const;

/**
 * Leaflet tile URL template.
 *
 * `{s}` and `{r}` are substituted by Leaflet, not here, which is why this
 * returns a template rather than a URL. The parameter is `key` - `api_key`
 * is silently ignored by the CDN, so a typo there looks exactly like having
 * no key at all.
 */
export function cartoTileTemplate(): string {
  const base = `https://{s}.basemaps.cartocdn.com/${mapConfig.basemap}/{z}/{x}/{y}{r}.png`;
  return mapConfig.basemapKey
    ? `${base}?key=${encodeURIComponent(mapConfig.basemapKey)}`
    : base;
}
