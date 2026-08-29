import * as Crypto from 'expo-crypto';
import { hasProofServer, midnightConfig } from '../config';
import type {
  DistanceBucket,
  Hex,
  MatchBand,
  MatchWitness,
  Proof,
  ProofKind,
  ProximityWitness,
} from './types';

/**
 * Commitment scheme and proof orchestration.
 *
 * The commitment helpers here must stay byte-identical to their Compact
 * counterparts in `contracts/`, because the circuit re-derives the commitment
 * from the witness and asserts equality. Any drift shows up as
 * "bad local opening" at proving time rather than as a wrong answer, which is
 * the failure mode you want.
 *
 * Domain separators are duplicated as string constants rather than imported,
 * so a change on either side is a visible diff on both.
 */

const DOMAIN = {
  cell: 'halo:cell:v1',
  vector: 'halo:vec:v1',
  model: 'halo:model:v1',
  profile: 'halo:profile:v1',
  proximityNullifier: 'halo:prox-null:v1',
  matchNullifier: 'halo:match-null:v1',
  profileNullifier: 'halo:profile-null:v1',
} as const;

async function sha256(input: string): Promise<Hex> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
  return `0x${digest}` as Hex;
}

export function randomSalt(): Hex {
  const bytes = Crypto.getRandomBytes(32);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex;
}

// -----------------------------------------------------------------------------
// commitments
// -----------------------------------------------------------------------------

/**
 * Snaps a GPS fix to Halo's 250 m grid.
 *
 * The grid is what makes the whole scheme work: two people in the same cell are
 * indistinguishable to the circuit, so proving "same cell" leaks a 250 m square
 * rather than a point. Longitude is scaled by cos(latitude) so cells stay
 * roughly square away from the equator - without it, a cell in Reykjavik is
 * four times narrower than one in Nairobi and the distance buckets stop meaning
 * the same thing.
 */
export function toCell(latitude: number, longitude: number): [number, number] {
  const CELL_METRES = 250;
  const METRES_PER_DEGREE_LAT = 111_320;

  const y = Math.floor((latitude * METRES_PER_DEGREE_LAT) / CELL_METRES);
  const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);
  const x = Math.floor((longitude * metresPerDegreeLon) / CELL_METRES);

  // Circuit witnesses are unsigned, so both axes are biased into positive
  // territory before they cross the boundary.
  return [x + 1_000_000, y + 1_000_000];
}

export function cellCommitment(cell: [number, number], salt: Hex): Promise<Hex> {
  return sha256(`${DOMAIN.cell}|${salt}|${cell[0]}|${cell[1]}`);
}

export function vectorCommitment(vector: number[], salt: Hex): Promise<Hex> {
  return sha256(`${DOMAIN.vector}|${salt}|${vector.join(',')}`);
}

export function modelCommitment(weights: number[]): Promise<Hex> {
  return sha256(`${DOMAIN.model}|${weights.join(',')}`);
}

/**
 * Commits to a whole profile record.
 *
 * The commitment covers the answers *and* the audience: change what you show
 * and the commitment moves, which is what makes the disclosure list something
 * a peer can check rather than something the client promises. `canonical`
 * comes from `canonicalise` in state/profile, which fixes field order so an
 * unchanged profile never rotates its commitment.
 */
export function profileCommitment(canonical: string, salt: Hex): Promise<Hex> {
  return sha256(`${DOMAIN.profile}|${salt}|${canonical}`);
}

export function proximityNullifier(a: Hex, b: Hex, epoch: number): Promise<Hex> {
  return sha256(`${DOMAIN.proximityNullifier}|${a}|${b}|${epoch}`);
}

export function matchNullifier(a: Hex, b: Hex, epoch: number): Promise<Hex> {
  return sha256(`${DOMAIN.matchNullifier}|${a}|${b}|${epoch}`);
}

// -----------------------------------------------------------------------------
// scoring, mirrored from the circuits
// -----------------------------------------------------------------------------

const SCALE = 1000;
/** Score axis. Bands are cut at 20/40/60/80% of achievable overlap. */
const AXIS = 10000;
const CELL_BUCKETS: [number, DistanceBucket][] = [
  [1, 0],
  [16, 1],
  [64, 2],
  [400, 3],
];

export function squaredCellDistance(a: [number, number], b: [number, number]): number {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return dx * dx + dy * dy;
}

export function bucketOf(squared: number): DistanceBucket | null {
  for (const [limit, bucket] of CELL_BUCKETS) {
    if (squared <= limit) return bucket;
  }
  return null;
}

/**
 * The scorer, in plain TypeScript. Runs first so the UI can show a result
 * immediately; the circuit then proves the same computation was honest.
 *
 * The score is a *normalised* weighted overlap on a fixed 0-10000 axis:
 *
 *   raw   = sum a[i] * b[i] * w[i] * consent[i]
 *   denom = sum w[i] * consent[i] * max(a[i], b[i]) * SCALE
 *   score = raw * AXIS / denom
 *
 * Two properties matter, and an unnormalised dot product has neither.
 *
 * The denominator only accumulates where at least one party has signal, so
 * the fourteen dimensions neither of them cares about cannot drag the result
 * toward zero. Normalising against the full basis instead makes every real
 * pair score in the low hundreds and collapses the bands.
 *
 * And because the denominator is gated by the same consent term as the
 * numerator, closing a dimension removes it from both sides. Withholding
 * something therefore cannot lower your band - which is the only defensible
 * behaviour in an app whose entire argument is that privacy is free.
 *
 * Keep this in lockstep with `compatibility` in match.compact, including the
 * truncating integer division. Floating point here would disagree with the
 * circuit at band boundaries.
 */
export function compatibilityScore(
  a: number[],
  b: number[],
  weights: number[],
  maskA: number[],
  maskB: number[],
): number {
  let raw = 0;
  let denom = 0;

  for (let i = 0; i < 16; i += 1) {
    const consent = (maskA[i] ?? 0) * (maskB[i] ?? 0);
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    const w = weights[i] ?? 0;

    raw += ai * bi * w * consent;
    denom += w * consent * Math.max(ai, bi) * SCALE;
  }

  if (denom === 0) return 0;
  return Math.floor((raw * AXIS) / denom);
}

export function bandOf(score: number): MatchBand {
  if (score < 2000) return 0;
  if (score < 4000) return 1;
  if (score < 6000) return 2;
  if (score < 8000) return 3;
  return 4;
}

// -----------------------------------------------------------------------------
// proving
// -----------------------------------------------------------------------------

export type ProveRequest =
  | { kind: 'proximity'; witness: ProximityWitness; commitA: Hex; commitB: Hex; maxBucket: DistanceBucket }
  | { kind: 'match'; witness: MatchWitness; commitA: Hex; commitB: Hex; minBand: MatchBand }
  | { kind: 'credential'; birthYear: number; subject: Hex; salt: Hex }
  | { kind: 'profile'; canonical: string; salt: Hex; commitA: Hex; shown: string[] };

export type ProveOptions = {
  epoch?: number;
  /** Called as the prover moves through its phases, for the progress ring. */
  onPhase?: (phase: 'witnessing' | 'proving' | 'submitting') => void;
};

/**
 * Produces a proof, preferring a real proof server and falling back to the
 * simulator.
 *
 * The fallback is deliberate and visible: `Proof.simulated` propagates into the
 * UI, which renders a different badge. A demo that silently fakes proofs is
 * worse than one that admits which half is live.
 */
export async function prove(request: ProveRequest, options: ProveOptions = {}): Promise<Proof> {
  const { epoch = currentEpoch(), onPhase } = options;
  const started = Date.now();

  onPhase?.('witnessing');
  const witnessMs = Date.now();

  if (hasProofServer) {
    try {
      onPhase?.('proving');
      return await proveRemote(request, epoch, started);
    } catch (error) {
      // A dead proof server mid-demo should degrade, not crash. The badge will
      // say simulated, and the error is surfaced in the proof detail sheet.
      console.warn('[halo] proof server failed, simulating', error);
    }
  }

  onPhase?.('proving');
  return proveSimulated(request, epoch, started, witnessMs);
}

async function proveRemote(request: ProveRequest, epoch: number, started: number): Promise<Proof> {
  const res = await fetch(`${midnightConfig.proofServer}/prove-tx`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ circuit: request.kind, epoch, ...request }),
  });
  if (!res.ok) throw new Error(`proof server ${res.status}`);
  const body = (await res.json()) as { proof: string; publicInputs: Record<string, unknown> };

  return {
    id: `${request.kind}-${started}`,
    kind: request.kind,
    inputs: publicInputsOf(request),
    disclosed: await disclosedOf(request),
    nullifier: await nullifierOf(request, epoch),
    payload: body.proof,
    createdAt: started,
    provingMs: Date.now() - started,
    simulated: false,
  };
}

/**
 * Local stand-in for the prover.
 *
 * It performs every check the circuit performs - openings, range, threshold -
 * and refuses on the same conditions, so a demo cannot accidentally show a
 * proof for a claim that is false. What it does not do is produce a
 * cryptographically verifiable object; `payload` is a digest, not a proof.
 *
 * The artificial delay is not padding. Real Halo circuits take 1.5-4 s on a
 * proof server, and a UI tuned against an instant response ships progress
 * states nobody has actually looked at.
 */
async function proveSimulated(
  request: ProveRequest,
  epoch: number,
  started: number,
  witnessMs: number,
): Promise<Proof> {
  await assertSatisfiable(request);

  const cost = { proximity: 1400, match: 2600, credential: 1900, profile: 1100 }[request.kind];
  await new Promise((resolve) => setTimeout(resolve, cost - Math.min(Date.now() - witnessMs, 400)));

  const nullifier = await nullifierOf(request, epoch);
  return {
    id: `${request.kind}-${started}`,
    kind: request.kind,
    inputs: publicInputsOf(request),
    disclosed: await disclosedOf(request),
    nullifier,
    payload: await sha256(`sim|${nullifier}|${epoch}`),
    createdAt: started,
    provingMs: Date.now() - started,
    simulated: true,
  };
}

/** Re-runs the circuit's assertions in the clear. Throws exactly as it would. */
async function assertSatisfiable(request: ProveRequest): Promise<void> {
  if (request.kind === 'proximity') {
    const { witness, commitA, commitB, maxBucket } = request;
    if ((await cellCommitment(witness.cell, witness.salt)) !== commitA) {
      throw new Error('proximity: bad local opening');
    }
    if ((await cellCommitment(witness.peerCell, witness.peerSalt)) !== commitB) {
      throw new Error('proximity: bad peer opening');
    }
    const bucket = bucketOf(squaredCellDistance(witness.cell, witness.peerCell));
    if (bucket === null) throw new Error('proximity: beyond maximum radius');
    if (bucket > maxBucket) throw new Error('proximity: out of range');
    return;
  }

  if (request.kind === 'match') {
    const { witness, commitA, commitB, minBand } = request;
    if ((await vectorCommitment(witness.vector, witness.salt)) !== commitA) {
      throw new Error('match: bad local opening');
    }
    if ((await vectorCommitment(witness.peerVector, witness.peerSalt)) !== commitB) {
      throw new Error('match: bad peer opening');
    }
    const band = bandOf(
      compatibilityScore(
        witness.vector,
        witness.peerVector,
        witness.weights,
        witness.mask,
        witness.peerMask,
      ),
    );
    if (band < minBand) throw new Error('match: below agreed threshold');
    return;
  }

  if (request.kind === 'profile') {
    if ((await profileCommitment(request.canonical, request.salt)) !== request.commitA) {
      throw new Error('profile: bad opening');
    }
    return;
  }

  const age = new Date().getFullYear() - request.birthYear;
  if (age < 18) throw new Error('credential: under 18');
}

function publicInputsOf(request: ProveRequest): Proof['inputs'] {
  if (request.kind === 'credential') return { commitA: request.subject };
  if (request.kind === 'profile') return { commitA: request.commitA };
  return { commitA: request.commitA, commitB: request.commitB };
}

async function disclosedOf(request: ProveRequest): Promise<Proof['disclosed']> {
  if (request.kind === 'proximity') {
    const bucket = bucketOf(squaredCellDistance(request.witness.cell, request.witness.peerCell));
    return { bucket: bucket ?? 3 };
  }
  if (request.kind === 'match') {
    const { witness } = request;
    return {
      band: bandOf(
        compatibilityScore(
          witness.vector,
          witness.peerVector,
          witness.weights,
          witness.mask,
          witness.peerMask,
        ),
      ),
    };
  }
  if (request.kind === 'profile') return { shown: request.shown };
  return { handle: await sha256(`halo:person:v1|${request.subject}`) };
}

function nullifierOf(request: ProveRequest, epoch: number): Promise<Hex> {
  if (request.kind === 'proximity') {
    return proximityNullifier(request.commitA, request.commitB, epoch);
  }
  if (request.kind === 'match') {
    return matchNullifier(request.commitA, request.commitB, epoch);
  }
  if (request.kind === 'profile') {
    return sha256(`${DOMAIN.profileNullifier}|${request.commitA}|${epoch}`);
  }
  return sha256(`halo:person:v1|${request.subject}`);
}

/** 15-minute epochs, matching `advanceEpoch` on the proximity contract. */
export function currentEpoch(): number {
  return Math.floor(Date.now() / (15 * 60 * 1000));
}

export const PROOF_LABEL: Record<ProofKind, string> = {
  proximity: 'Proximity',
  match: 'Compatibility',
  credential: 'Personhood',
  profile: 'Profile record',
};
