import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultMask, DIMENSIONS, MODEL_WEIGHTS, type Dimension } from '@/ai/matching';
import { resolveConnector, type Connector } from '@/chain/midnight/connector';
import {
  cellCommitment,
  modelCommitment,
  prove,
  randomSalt,
  toCell,
  vectorCommitment,
} from '@/chain/midnight/prover';
import type { DistanceBucket, Hex, MatchBand, Proof, WalletState } from '@/chain/midnight/types';
import { probeProofServer } from '@/chain/config';
import { maskFor, PEOPLE_BY_ID, SELF, SELF_VECTOR, VECTORS } from '@/data/people';

/**
 * Application state.
 *
 * Deliberately small and deliberately hand-rolled. The interesting invariant is
 * that the private material - the interest vector, the grid cell, the salts -
 * lives here and only here, and the only thing that ever leaves is a
 * commitment or a proof. Keeping that in one file makes the claim auditable in
 * a way that scattering it across hooks would not.
 */

const KEY_VISIBILITY = 'halo.visibility';
const KEY_MASK = 'halo.mask';

export type Visibility = {
  /** Broadcasting at all. Off means invisible, and no proofs are produced. */
  live: boolean;
  /** Widest bucket anyone may prove against you. */
  maxBucket: DistanceBucket;
  /** Epoch ms when broadcasting auto-stops. The comps' "visible for 30 min". */
  until: number | null;
};

export type HaloState = {
  wallet: WalletState;
  connector: Connector | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  /** Commitment to the local interest vector. Published; reveals nothing. */
  vectorCommit: Hex | null;
  /** Commitment to the current grid cell. Rotates when the cell changes. */
  cellCommit: Hex | null;
  /** Hash of the sanctioned model. Compared against the on-chain value. */
  modelCommit: Hex | null;

  visibility: Visibility;
  setVisibility: (next: Partial<Visibility>) => void;

  /** Per-dimension consent. Index-aligned with `DIMENSIONS`. */
  mask: number[];
  toggleDimension: (dimension: Dimension) => void;

  proofs: Proof[];
  /** Runs the proximity circuit against a person in the roster. */
  proveProximity: (personId: string, onPhase?: PhaseHandler) => Promise<Proof>;
  /** Runs the match circuit against a person in the roster. */
  proveMatch: (personId: string, minBand?: MatchBand, onPhase?: PhaseHandler) => Promise<Proof>;

  /** True once a real proof server answered a health check. */
  liveProver: boolean;
  ready: boolean;
};

type PhaseHandler = (phase: 'witnessing' | 'proving' | 'submitting') => void;

const HaloContext = createContext<HaloState | null>(null);

export function HaloProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({ status: 'disconnected' });
  const [connector, setConnector] = useState<Connector | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [liveProver, setLiveProver] = useState(false);
  const [ready, setReady] = useState(false);

  const [visibility, setVisibilityState] = useState<Visibility>({
    live: true,
    maxBucket: 1,
    until: Date.now() + 30 * 60 * 1000,
  });
  const [mask, setMask] = useState<number[]>(defaultMask);

  // Salts are generated once per session and never persisted. Rotating them on
  // every launch means yesterday's published commitments cannot be linked to
  // today's, even by an observer who logs every commitment the app has made.
  const [salts] = useState(() => ({ vector: randomSalt(), cell: randomSalt() }));

  const [vectorCommit, setVectorCommit] = useState<Hex | null>(null);
  const [cellCommit, setCellCommit] = useState<Hex | null>(null);
  const [modelCommit, setModelCommit] = useState<Hex | null>(null);

  // Boot: restore preferences, probe the prover, derive commitments.
  useEffect(() => {
    let alive = true;

    (async () => {
      const [storedVisibility, storedMask] = await Promise.all([
        AsyncStorage.getItem(KEY_VISIBILITY),
        AsyncStorage.getItem(KEY_MASK),
      ]);
      if (!alive) return;

      if (storedVisibility) {
        try {
          setVisibilityState((prev) => ({ ...prev, ...JSON.parse(storedVisibility) }));
        } catch {
          // Corrupt preference is not worth failing boot over.
        }
      }
      if (storedMask) {
        try {
          const parsed = JSON.parse(storedMask);
          if (Array.isArray(parsed) && parsed.length === DIMENSIONS.length) setMask(parsed);
        } catch {
          /* ignore */
        }
      }

      const [vc, mc] = await Promise.all([
        vectorCommitment(SELF_VECTOR, salts.vector),
        modelCommitment(MODEL_WEIGHTS),
      ]);
      // The demo pins a cell rather than reading GPS at boot; the location
      // screen swaps in the real fix once the user grants permission.
      const cc = await cellCommitment(toCell(40.7829, -73.9654), salts.cell);

      if (!alive) return;
      setVectorCommit(vc);
      setModelCommit(mc);
      setCellCommit(cc);

      const live = await probeProofServer();
      if (!alive) return;
      setLiveProver(live);
      setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [salts]);

  const setVisibility = useCallback((next: Partial<Visibility>) => {
    setVisibilityState((prev) => {
      const merged = { ...prev, ...next };
      void AsyncStorage.setItem(KEY_VISIBILITY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const toggleDimension = useCallback((dimension: Dimension) => {
    const index = DIMENSIONS.indexOf(dimension);
    if (index < 0) return;
    setMask((prev) => {
      const next = [...prev];
      next[index] = next[index] ? 0 : 1;
      void AsyncStorage.setItem(KEY_MASK, JSON.stringify(next));
      return next;
    });
  }, []);

  const connect = useCallback(async () => {
    setWallet({ status: 'connecting' });
    try {
      const resolved = await resolveConnector();
      const state = await resolved.connect();
      setConnector(resolved);
      setWallet(state);
    } catch (error) {
      setWallet({
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }, []);

  const disconnect = useCallback(async () => {
    await connector?.disconnect();
    setConnector(null);
    setWallet({ status: 'disconnected' });
  }, [connector]);

  const record = useCallback((proof: Proof) => {
    setProofs((prev) => [proof, ...prev].slice(0, 50));
    return proof;
  }, []);

  const proveProximityFor = useCallback(
    async (personId: string, onPhase?: PhaseHandler) => {
      const person = PEOPLE_BY_ID.get(personId);
      if (!person) throw new Error(`Unknown person ${personId}`);
      if (!cellCommit) throw new Error('No cell commitment yet');

      // The peer's cell is derived from their disclosed bucket rather than a
      // real position - the demo has no second handset. Everything downstream
      // is the production path: real commitment, real opening check, real
      // bucket derivation.
      const selfCell = toCell(40.7829, -73.9654);
      const peerCell = offsetCellForBucket(selfCell, person.bucket);
      const peerSalt = randomSalt();
      const peerCommit = await cellCommitment(peerCell, peerSalt);

      const proof = await prove(
        {
          kind: 'proximity',
          witness: { cell: selfCell, salt: salts.cell, peerCell, peerSalt },
          commitA: cellCommit,
          commitB: peerCommit,
          maxBucket: 3,
        },
        { onPhase },
      );
      return record(proof);
    },
    [cellCommit, record, salts.cell],
  );

  const proveMatchFor = useCallback(
    async (personId: string, minBand: MatchBand = 1, onPhase?: PhaseHandler) => {
      const person = PEOPLE_BY_ID.get(personId);
      const peerVector = VECTORS.get(personId);
      if (!person || !peerVector) throw new Error(`Unknown person ${personId}`);
      if (!vectorCommit) throw new Error('No vector commitment yet');

      const peerSalt = randomSalt();
      const peerCommit = await vectorCommitment(peerVector, peerSalt);

      const proof = await prove(
        {
          kind: 'match',
          witness: {
            vector: SELF_VECTOR,
            salt: salts.vector,
            peerVector,
            peerSalt,
            weights: MODEL_WEIGHTS,
            mask,
            peerMask: maskFor(person),
          },
          commitA: vectorCommit,
          commitB: peerCommit,
          minBand,
        },
        { onPhase },
      );
      return record(proof);
    },
    [mask, record, salts.vector, vectorCommit],
  );

  const value = useMemo<HaloState>(
    () => ({
      wallet,
      connector,
      connect,
      disconnect,
      vectorCommit,
      cellCommit,
      modelCommit,
      visibility,
      setVisibility,
      mask,
      toggleDimension,
      proofs,
      proveProximity: proveProximityFor,
      proveMatch: proveMatchFor,
      liveProver,
      ready,
    }),
    [
      wallet,
      connector,
      connect,
      disconnect,
      vectorCommit,
      cellCommit,
      modelCommit,
      visibility,
      setVisibility,
      mask,
      toggleDimension,
      proofs,
      proveProximityFor,
      proveMatchFor,
      liveProver,
      ready,
    ],
  );

  return <HaloContext.Provider value={value}>{children}</HaloContext.Provider>;
}

export function useHalo(): HaloState {
  const value = useContext(HaloContext);
  if (!value) throw new Error('useHalo must be used inside HaloProvider');
  return value;
}

/**
 * Places a synthetic peer at a distance that lands in the given bucket.
 *
 * Offsets sit comfortably inside each band rather than on its boundary, so the
 * demo never shows a proof flipping between buckets because of grid rounding.
 */
function offsetCellForBucket(cell: [number, number], bucket: DistanceBucket): [number, number] {
  const offsets: Record<DistanceBucket, number> = { 0: 1, 1: 3, 2: 7, 3: 18 };
  return [cell[0] + offsets[bucket], cell[1]];
}

export { SELF };
