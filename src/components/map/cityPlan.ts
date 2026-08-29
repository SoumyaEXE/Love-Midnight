import { Skia, type SkPath } from '@shopify/react-native-skia';

/**
 * Procedural city plan.
 *
 * Generates the geometry for a plausible city in a rectangle: water, parkland,
 * blocks, streets and arterials, all deterministic for a given seed so the map
 * never reshuffles between renders.
 *
 * It is generated rather than fetched from a tile provider, and that is a
 * privacy decision before it is a technical one. Requesting tiles means sending
 * the user's coordinates to a third party on every pan - the exact disclosure
 * this app exists to avoid. A vector plan also themes to the palette, needs no
 * API key, and cannot fail in a room with bad wifi.
 */

export type CityPlan = {
  water: SkPath;
  parks: SkPath;
  blocks: SkPath;
  streets: SkPath;
  arterials: SkPath;
  /** Named districts, positioned in normalised 0-1 space for label overlays. */
  districts: { name: string; x: number; y: number }[];
};

/** Mulberry32. Small, fast, identical on every platform. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISTRICT_NAMES = [
  'Riverside',
  'Old Town',
  'Northside',
  'The Docks',
  'Market',
  'Parkway',
  'Warehouse',
];

export function buildCityPlan(width: number, height: number, seed = 20260829): CityPlan {
  const random = rng(seed);

  const water = Skia.PathBuilder.Make();
  const parks = Skia.PathBuilder.Make();
  const blocks = Skia.PathBuilder.Make();
  const streets = Skia.PathBuilder.Make();
  const arterials = Skia.PathBuilder.Make();

  // Generate past the frame so nothing appears to stop short of an edge.
  const pad = Math.max(width, height) * 0.2;
  const minX = -pad;
  const maxX = width + pad;
  const minY = -pad;
  const maxY = height + pad;

  // A slight rotation. Real cities are almost never square to the compass, and
  // the eye reads a perfectly axis-aligned grid as a chart rather than a map.
  const tilt = -0.11;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const cx = width / 2;
  const cy = height / 2;

  const rot = (x: number, y: number): [number, number] => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  };

  type Builder = ReturnType<typeof Skia.PathBuilder.Make>;
  const line = (p: Builder, x1: number, y1: number, x2: number, y2: number) => {
    const [ax, ay] = rot(x1, y1);
    const [bx, by] = rot(x2, y2);
    p.moveTo(ax, ay).lineTo(bx, by);
  };

  const quad = (p: Builder, x: number, y: number, w: number, h: number) => {
    const pts = [rot(x, y), rot(x + w, y), rot(x + w, y + h), rot(x, y + h)];
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) p.lineTo(pts[i][0], pts[i][1]);
    p.close();
  };

  // Street grid. Spacing is irregular so the pattern never visibly tiles.
  const span = Math.max(width, height);
  const columns: number[] = [];
  for (let x = minX; x < maxX; ) {
    columns.push(x);
    x += span * (0.05 + random() * 0.045);
  }
  const rows: number[] = [];
  for (let y = minY; y < maxY; ) {
    rows.push(y);
    y += span * (0.045 + random() * 0.04);
  }

  columns.forEach((x, i) => line(i % 4 === 1 ? arterials : streets, x, minY, x, maxY));
  rows.forEach((y, i) => line(i % 4 === 2 ? arterials : streets, minX, y, maxX, y));

  // A diagonal boulevard cutting the grid. Every grid city has one, and it is
  // what stops this reading as graph paper.
  line(arterials, minX, height * 0.72, width * 0.85, minY);

  // A river across the lower third, drawn as a wide meandering stroke.
  const riverY = height * (0.6 + random() * 0.18);
  const [wx, wy] = rot(minX, riverY);
  water.moveTo(wx, wy);
  const c1 = rot(width * 0.28, riverY - height * 0.1);
  const c2 = rot(width * 0.62, riverY + height * 0.12);
  const end = rot(maxX, riverY - height * 0.04);
  water.cubicTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);

  // Parkland: two large irregular blocks.
  for (let i = 0; i < 2; i += 1) {
    const px = width * (0.1 + random() * 0.55);
    const py = height * (0.08 + random() * 0.4);
    quad(parks, px, py, width * (0.16 + random() * 0.14), height * (0.1 + random() * 0.1));
  }

  // Built blocks: small filled quads on the grid, sparse enough to read as
  // texture rather than as a solid mass.
  for (let i = 0; i < 26; i += 1) {
    const bx = columns[Math.floor(random() * columns.length)] ?? 0;
    const by = rows[Math.floor(random() * rows.length)] ?? 0;
    quad(blocks, bx, by, span * (0.025 + random() * 0.03), span * (0.02 + random() * 0.025));
  }

  const districts = DISTRICT_NAMES.slice(0, 4).map((name) => ({
    name,
    x: 0.14 + random() * 0.68,
    y: 0.12 + random() * 0.72,
  }));

  return {
    water: water.detach(),
    parks: parks.detach(),
    blocks: blocks.detach(),
    streets: streets.detach(),
    arterials: arterials.detach(),
    districts,
  };
}
