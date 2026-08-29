import { bandOf, compatibilityScore } from '@/chain/midnight/prover';
import type { MatchBand } from '@/chain/midnight/types';

/**
 * The on-device matcher.
 *
 * Halo's model is a 16-dimension weighted scorer. That is a deliberate ceiling,
 * not a shortcut: the model has to be expressible as arithmetic constraints in
 * a Compact circuit, and a transformer is not. A linear model over a fixed
 * basis is - so every score the app shows can be proved correct rather than
 * merely asserted.
 *
 * The pipeline:
 *
 *   free text  ->  interest vector   (on device, never transmitted)
 *   vector     ->  commitment        (published; reveals nothing)
 *   two vectors -> score, band       (computed locally on both handsets)
 *   band       ->  ZK proof          (proves the score followed the rules)
 *
 * The dimensions are fixed and public. That is what makes the commitment
 * meaningful: everyone scores against the same basis, so a commitment to a
 * vector is a commitment to a comparable claim.
 */

export const DIMENSIONS = [
  'outdoors',
  'nightlife',
  'reading',
  'film',
  'music',
  'food',
  'travel',
  'fitness',
  'art',
  'gaming',
  'tech',
  'politics',
  'spirituality',
  'family',
  'health',
  'career',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Dimensions that are sensitive enough to default to withheld.
 *
 * These are the special-category ones under GDPR Art. 9. A conventional dating
 * app collects them and scores on them server-side; Halo's default is that the
 * circuit cannot see them at all unless the user turns them on, and the proof
 * shows which state was in force.
 */
export const SENSITIVE_BY_DEFAULT: Dimension[] = ['politics', 'spirituality', 'health'];

export type InterestVector = number[];

/**
 * Model weights. Published as a commitment on-chain via `setModel`, so a client
 * can refuse to prove against weights the network has not sanctioned.
 *
 * The shape encodes a product decision: shared taste in things people *do*
 * (outdoors, food, music) predicts a good first meeting better than agreement
 * on things people *believe*, so the belief dimensions carry lower weight even
 * when both parties opt into scoring them.
 */
export const MODEL_WEIGHTS: number[] = [
  900, // outdoors
  700, // nightlife
  850, // reading
  800, // film
  950, // music
  900, // food
  880, // travel
  650, // fitness
  780, // art
  600, // gaming
  700, // tech
  400, // politics
  400, // spirituality
  750, // family
  350, // health
  500, // career
];

/**
 * Keyword basis for turning a written bio into a vector.
 *
 * A bag-of-keywords model rather than an embedding, for the same reason as
 * above: it is auditable. A user can read this table and know exactly why they
 * were scored the way they were, and the circuit can verify the arithmetic.
 * An opaque embedding would make the proof prove the wrong thing - that some
 * black box ran, not that a rule was followed.
 */
const KEYWORDS: Record<Dimension, string[]> = {
  outdoors: ['hiking', 'hike', 'trail', 'camping', 'mountains', 'climbing', 'park', 'outdoors'],
  nightlife: ['bars', 'club', 'dancing', 'cocktail', 'nightlife', 'party', 'dj'],
  reading: ['reading', 'books', 'novel', 'literature', 'poetry', 'bookshop'],
  film: ['films', 'movies', 'cinema', 'film', 'director', 'documentary'],
  music: ['music', 'concerts', 'gigs', 'vinyl', 'band', 'festival', 'guitar'],
  food: ['foodie', 'cooking', 'restaurants', 'coffee', 'baking', 'wine', 'brunch'],
  travel: ['travel', 'travelling', 'backpacking', 'flights', 'countries', 'wander'],
  fitness: ['gym', 'running', 'yoga', 'cycling', 'lifting', 'marathon', 'swimming'],
  art: ['art', 'galleries', 'painting', 'design', 'photography', 'museum'],
  gaming: ['gaming', 'games', 'playstation', 'steam', 'board games', 'chess'],
  tech: ['tech', 'engineer', 'startup', 'coding', 'developer', 'crypto', 'ai'],
  politics: ['politics', 'activism', 'organising', 'policy', 'union'],
  spirituality: ['meditation', 'spiritual', 'mindfulness', 'faith', 'church', 'temple'],
  family: ['family', 'kids', 'dog', 'cat', 'nephew', 'niece', 'home'],
  health: ['sober', 'vegan', 'vegetarian', 'wellness', 'therapy', 'recovery'],
  career: ['career', 'work', 'founder', 'ambitious', 'building', 'business'],
};

const SCALE = 1000;

/**
 * Builds an interest vector from a bio and explicit interest tags.
 *
 * Tags are weighted more heavily than prose because a chosen tag is a
 * deliberate signal and a word in a bio is often incidental. Values are clamped
 * to the circuit's [0, SCALE] range - the circuit asserts this, so producing an
 * out-of-range vector here would fail at proving time rather than here.
 */
export function buildVector(bio: string, tags: string[] = []): InterestVector {
  const haystack = bio.toLowerCase();
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  return DIMENSIONS.map((dimension) => {
    let score = 0;
    for (const keyword of KEYWORDS[dimension]) {
      if (tagSet.has(keyword)) score += 420;
      else if (haystack.includes(keyword)) score += 180;
    }
    return Math.min(score, SCALE);
  });
}

/** Consent mask. 1 = this dimension may be scored. */
export function defaultMask(): number[] {
  return DIMENSIONS.map((d) => (SENSITIVE_BY_DEFAULT.includes(d) ? 0 : 1));
}

export type MatchResult = {
  score: number;
  band: MatchBand;
  /** The dimensions that actually drove the score, strongest first. */
  drivers: { dimension: Dimension; contribution: number }[];
  /** Dimensions zeroed because one side withheld them. */
  withheld: Dimension[];
};

/**
 * Scores a pair and explains the result.
 *
 * The explanation is derived from the same terms the score is, so what the UI
 * says caused a match is provably what caused it. This is the difference
 * between an explanation and a rationalisation, and it is the whole reason the
 * model is shaped the way it is.
 */
export function match(
  a: InterestVector,
  b: InterestVector,
  maskA: number[] = defaultMask(),
  maskB: number[] = defaultMask(),
  weights: number[] = MODEL_WEIGHTS,
): MatchResult {
  const score = compatibilityScore(a, b, weights, maskA, maskB);

  const drivers = DIMENSIONS.map((dimension, i) => ({
    dimension,
    contribution: Math.floor(
      ((a[i] ?? 0) * (b[i] ?? 0) * (weights[i] ?? 0) * (maskA[i] ?? 0) * (maskB[i] ?? 0)) /
        (SCALE * SCALE),
    ),
  }))
    .filter((d) => d.contribution > 0)
    .sort((x, y) => y.contribution - x.contribution)
    .slice(0, 4);

  const withheld = DIMENSIONS.filter((_, i) => (maskA[i] ?? 0) * (maskB[i] ?? 0) === 0);

  return { score, band: bandOf(score), drivers, withheld };
}

/** Sentence for the match card. Names the drivers rather than gesturing at them. */
export function explain(result: MatchResult): string {
  if (result.drivers.length === 0) {
    return 'No shared signals in the dimensions you both opened up.';
  }
  const names = result.drivers.slice(0, 3).map((d) => d.dimension);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Matched on ${list}.`;
}

/** Ranks a roster locally. Nothing here touches the network. */
export function rank<T extends { vector: InterestVector; mask?: number[] }>(
  self: InterestVector,
  selfMask: number[],
  candidates: T[],
): (T & { result: MatchResult })[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      result: match(self, candidate.vector, selfMask, candidate.mask ?? defaultMask()),
    }))
    .sort((a, b) => b.result.score - a.result.score);
}
