/**
 * Shared shapes for the Midnight layer.
 *
 * These mirror `@midnight-ntwrk/dapp-connector-api` where they overlap, but are
 * declared locally so the UI never imports the connector package directly. That
 * keeps the screens compiling on a machine with no Midnight toolchain, which
 * matters when a teammate clones the repo an hour before a demo.
 */

export type Hex = `0x${string}`;

/** Which circuit produced a proof. Drives the copy shown in the proof sheet. */
export type ProofKind = 'proximity' | 'match' | 'credential';

export type ProofStatus = 'idle' | 'witnessing' | 'proving' | 'submitting' | 'settled' | 'failed';

export type DistanceBucket = 0 | 1 | 2 | 3;
export type MatchBand = 0 | 1 | 2 | 3 | 4;

export const DISTANCE_LABEL: Record<DistanceBucket, string> = {
  0: 'Closest',
  1: 'Nearby',
  2: 'Walkable',
  3: 'Area',
};

export const BAND_LABEL: Record<MatchBand, string> = {
  0: 'Low overlap',
  1: 'Some overlap',
  2: 'Good overlap',
  3: 'Strong overlap',
  4: 'Exceptional overlap',
};

/**
 * A completed proof, as the UI sees it.
 *
 * Note what is absent: no coordinates, no interest vector, no birth year. The
 * `disclosed` field is the entire public surface of the proof, and it is a
 * bucket or a band - never a raw value. If a field ever needs adding here,
 * that is the moment to check whether the circuit should be disclosing it.
 */
export type Proof = {
  id: string;
  kind: ProofKind;
  /** Public commitments the proof was made against. */
  inputs: { commitA: Hex; commitB?: Hex };
  /** The only thing the proof makes public. */
  disclosed: { bucket?: DistanceBucket; band?: MatchBand; handle?: Hex };
  /** Replay guard. Stable for a given (pair, epoch). */
  nullifier: Hex;
  /** Proof bytes, base64. Large - held only while submitting. */
  payload?: string;
  createdAt: number;
  /** Milliseconds spent in the prover. Shown in the UI; judges ask. */
  provingMs: number;
  /** True when produced by the local simulator rather than a real prover. */
  simulated: boolean;
  txHash?: Hex;
  /** Set once mirrored to Solana. */
  solanaSignature?: string;
};

export type WalletState = {
  status: 'disconnected' | 'connecting' | 'connected' | 'unavailable';
  /** Bech32m Midnight address. Truncated everywhere in the UI. */
  address?: string;
  /** Shielded coin public key, used as the pairing handshake identity. */
  coinPublicKey?: string;
  name?: string;
  error?: string;
};

export type ProximityWitness = {
  cell: [number, number];
  salt: Hex;
  peerCell: [number, number];
  peerSalt: Hex;
};

export type MatchWitness = {
  vector: number[];
  salt: Hex;
  peerVector: number[];
  peerSalt: Hex;
  weights: number[];
  mask: number[];
  peerMask: number[];
};
