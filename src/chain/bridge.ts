import { Buffer } from 'buffer';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { solanaConfig } from './config';
import type { Proof } from './midnight/types';

/**
 * Midnight x Solana attestation bridge.
 *
 * The cross-chain claim Halo makes is narrow and worth stating precisely:
 * Midnight is the privacy engine, Solana is the public record. Nothing private
 * crosses. What crosses is a 64-byte nullifier and a one-byte band.
 *
 * Why bother at all? Because a match that only exists inside a shielded ledger
 * cannot be used anywhere else. Publishing the nullifier to Solana gives the
 * pair a portable, censorship-resistant receipt that any Solana program can
 * read - a ticketing app can gate on "these two have a Halo match" without
 * Halo's servers existing, and without learning who they are.
 *
 * What is deliberately NOT bridged:
 *
 *   positions          never leave the handset in any form
 *   interest vectors   likewise
 *   the exact score    only the 0-4 band crosses
 *   wallet addresses   the attestation is signed by an ephemeral key
 *
 * The nullifier is already epoch-bound and pair-bound by the circuit, so
 * publishing it adds no linkability that the Midnight ledger did not already
 * have. It is safe to make public precisely because it is a hash of two
 * commitments - it identifies the *relationship*, not either person.
 */

export type Attestation = {
  /** The circuit nullifier, hex. Identifies a pair-epoch, not a person. */
  nullifier: string;
  /** Disclosed band or bucket. One byte. */
  disclosed: number;
  kind: Proof['kind'];
  /** Unix seconds, rounded to the hour so timing does not become a fingerprint. */
  at: number;
};

const MEMO_PROGRAM = new PublicKey(solanaConfig.memoProgram);

/**
 * Serialises an attestation into a memo payload.
 *
 * The format is fixed-width and prefixed so an indexer can filter Halo memos
 * cheaply. Timestamps are hour-rounded on purpose: a second-precision timestamp
 * on a public chain, correlated with the Midnight ledger's own timing, would
 * narrow a pair down considerably. An hour bucket does not.
 */
export function encodeAttestation(proof: Proof): Attestation {
  const disclosed = proof.disclosed.band ?? proof.disclosed.bucket ?? 0;
  return {
    nullifier: proof.nullifier,
    disclosed,
    kind: proof.kind,
    at: Math.floor(proof.createdAt / 3_600_000) * 3600,
  };
}

export function serialiseAttestation(attestation: Attestation): string {
  return [
    'halo1',
    attestation.kind[0], // p | m | c
    attestation.nullifier.replace(/^0x/, '').slice(0, 64),
    attestation.disclosed.toString(16),
    attestation.at.toString(16),
  ].join('.');
}

export function parseAttestation(memo: string): Attestation | null {
  const parts = memo.split('.');
  if (parts.length !== 5 || parts[0] !== 'halo1') return null;

  const kind = ({ p: 'proximity', m: 'match', c: 'credential' } as const)[
    parts[1] as 'p' | 'm' | 'c'
  ];
  if (!kind) return null;

  return {
    kind,
    nullifier: `0x${parts[2]}`,
    disclosed: parseInt(parts[3], 16),
    at: parseInt(parts[4], 16),
  };
}

let connection: Connection | null = null;

export function solana(): Connection {
  if (!connection) {
    // `confirmed` rather than `finalized`: a demo cannot wait 13 seconds for a
    // receipt, and an attestation being reorged out is not a safety problem -
    // the Midnight proof is the source of truth, this is only a mirror.
    connection = new Connection(solanaConfig.cluster, 'confirmed');
  }
  return connection;
}

/**
 * Builds the mirror transaction. Unsigned - the caller supplies the fee payer,
 * because Halo deliberately does not hold Solana keys.
 */
export function buildAttestationTx(proof: Proof, feePayer: PublicKey): Transaction {
  const memo = serialiseAttestation(encodeAttestation(proof));

  const instruction = new TransactionInstruction({
    keys: [{ pubkey: feePayer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM,
    data: Buffer.from(memo, 'utf8'),
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = feePayer;
  return tx;
}

/**
 * Reads Halo attestations back off Solana for a given nullifier.
 *
 * Used by the "verify" affordance in the proof sheet: a judge can tap it, see
 * the Solana signature, and open Explorer to confirm the mirror is real. That
 * round trip is the difference between claiming a cross-chain integration and
 * showing one.
 */
export async function findAttestations(limit = 20): Promise<
  { signature: string; attestation: Attestation }[]
> {
  const signatures = await solana().getSignaturesForAddress(MEMO_PROGRAM, { limit });
  const found: { signature: string; attestation: Attestation }[] = [];

  for (const entry of signatures) {
    if (!entry.memo) continue;
    // Solana prefixes memos with "[N] " where N is the memo length.
    const body = entry.memo.replace(/^\[\d+]\s*/, '');
    const attestation = parseAttestation(body);
    if (attestation) found.push({ signature: entry.signature, attestation });
  }

  return found;
}

export function explorerUrl(signature: string): string {
  const cluster = solanaConfig.cluster.includes('devnet') ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
