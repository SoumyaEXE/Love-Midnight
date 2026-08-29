import Constants from 'expo-constants';

/**
 * Basemap configuration.
 *
 * One thing worth knowing before reading the rest: the raster endpoint below,
 * `basemaps.cartocdn.com`, is CARTO's public basemap CDN and does not require
 * or consume an API key. So the key configured here changes nothing about what
 * renders today. It is plumbed anyway so that pointing the app at a keyed
 * CARTO endpoint - or CARTO starting to enforce one on the CDN - is a config
 * change rather than a code change, and so there is exactly one place the
 * token lives.
 *
 * The token is public by construction. Anything a map client sends with every
 * tile request is extractable from the app bundle or by watching the network,
 * so this is a scoped, rotatable basemap token and not a secret. Treat it as
 * one: prefer `EXPO_PUBLIC_CARTO_API_KEY` in a `.env` (gitignored) over the
 * committed default, and rotate it in CARTO rather than trying to hide it.
 */

type Extra = {
  cartoApiKey?: string;
  cartoBasemap?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** CARTO basemap styles. `dark_all` keeps labels; `dark_nolabels` drops them. */
export type CartoBasemap = 'dark_all' | 'dark_nolabels' | 'dark_only_labels';

export const mapConfig = {
  // The env var wins so the token can be rotated without editing app.json,
  // which is the file most likely to be committed by accident.
  cartoApiKey: process.env.EXPO_PUBLIC_CARTO_API_KEY ?? extra.cartoApiKey ?? '',
  basemap: (extra.cartoBasemap ?? 'dark_all') as CartoBasemap,
  /**
   * Required by CARTO's basemap terms and by OSM's licence, key or no key.
   * Rendered small and low-contrast in the corner of the map, not hidden.
   */
  attribution: '© OpenStreetMap · © CARTO',
} as const;

/**
 * Leaflet tile URL template.
 *
 * `{s}` subdomains, `{r}` for the retina `@2x` suffix - both are substituted
 * by Leaflet, not here, which is why this returns a template rather than a URL.
 */
export function cartoTileTemplate(): string {
  const base = `https://{s}.basemaps.cartocdn.com/${mapConfig.basemap}/{z}/{x}/{y}{r}.png`;
  return mapConfig.cartoApiKey
    ? `${base}?api_key=${encodeURIComponent(mapConfig.cartoApiKey)}`
    : base;
}
