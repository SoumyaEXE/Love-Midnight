import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildVector,
  defaultMask,
  DIMENSIONS,
  MODEL_WEIGHTS,
  type Dimension,
} from '@/ai/matching';
import { resolveConnector, type Connector } from '@/chain/midnight/connector';
import {
  cellCommitment,
  modelCommitment,
  profileCommitment,
  prove,
  randomSalt,
  toCell,
  vectorCommitment,
} from '@/chain/midnight/prover';
import type { DistanceBucket, Hex, MatchBand, Proof, WalletState } from '@/chain/midnight/types';
import { probeProofServer } from '@/chain/config';
import { maskFor, PEOPLE_BY_ID, SELF, SELF_VECTOR, VECTORS } from '@/data/people';
import {
  canonicalise,
  emptyProfile,
  isComplete,
  loadProfile,
  persistProfile,
  SHOWABLE,
  type HaloProfile,
} from '@/state/profile';

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

  /** The signed-in user's own profile. Answers plus audience. */
  profile: HaloProfile;
  saveProfile: (next: Partial<HaloProfile>) => void;
  /** Commitment to the profile record. Null until one has been published. */
  profileCommit: Hex | null;
  /**
   * Commits the profile on Midnight and records the receipt.
   *
   * The profile itself does not cross: what is published is a commitment, and
   * the disclosed field list. The receipt then mirrors to Solana through the
   * same bridge every other proof uses.
   */
  publishProfile: (onPhase?: PhaseHandler) => Promise<Proof>;
  /** The interest vector the user is actually scored on. Never transmitted. */
  selfVector: number[];

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
  const [profile, setProfileState] = useState<HaloProfile>(emptyProfile);
  const [profileCommit, setProfileCommit] = useState<Hex | null>(null);

  // Salts are generated once per session and never persisted. Rotating them on
  // every launch means yesterday's published commitments cannot be linked to
  // today's, even by an observer who logs every commitment the app has made.
  const [salts] = useState(() => ({
    vector: randomSalt(),
    cell: randomSalt(),
    profile: randomSalt(),
  }));

  const [vectorCommit, setVectorCommit] = useState<Hex | null>(null);
  const [cellCommit, setCellCommit] = useState<Hex | null>(null);
  const [modelCommit, setModelCommit] = useState<Hex | null>(null);

  // Boot: restore preferences, probe the prover, derive commitments.
  useEffect(() => {
    let alive = true;

    (async () => {
      const [storedVisibility, storedMask, storedProfile] = await Promise.all([
        AsyncStorage.getItem(KEY_VISIBILITY),
        AsyncStorage.getItem(KEY_MASK),
        loadProfile(),
      ]);
      if (!alive) return;

      if (storedProfile) setProfileState(storedProfile);

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

      const mc = await modelCommitment(MODEL_WEIGHTS);
      // The demo pins a cell rather than reading GPS at boot; the location
      // screen swaps in the real fix once the user grants permission.
      const cc = await cellCommitment(toCell(40.7829, -73.9654), salts.cell);

      if (!alive) return;
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

  /**
   * The vector actually scored against.
   *
   * Once the user has filled in a profile it is derived from their own bio and
   * interests through the same vectoriser the roster runs through - the demo
   * persona is only the stand-in for an account that has not been set up yet.
   */
  const selfVector = useMemo(
    () => (isComplete(profile) ? buildVector(profile.bio, profile.interests) : SELF_VECTOR),
    [profile],
  );

  // Re-commit whenever the vector moves. A stale commitment would make every
  // match proof fail its opening check, which is a confusing way to discover
  // that a bio was edited.
  useEffect(() => {
    let alive = true;
    void vectorCommitment(selfVector, salts.vector).then((commit) => {
      if (alive) setVectorCommit(commit);
    });
    return () => {
      alive = false;
    };
  }, [selfVector, salts.vector]);

  const setVisibility = useCallback((next: Partial<Visibility>) => {
    setVisibilityState((prev) => {
      const merged = { ...prev, ...next };
      void AsyncStorage.setItem(KEY_VISIBILITY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const saveProfile = useCallback((next: Partial<HaloProfile>) => {
    setProfileState((prev) => {
      const merged = { ...prev, ...next, show: { ...prev.show, ...(next.show ?? {}) } };
      void persistProfile(merged);

      // "Show my distance" and "broadcast a cell commitment" are the same
      // decision wearing two names. Turning the disclosure off while the app
      // keeps publishing commitments would make the toggle a lie, so it stops
      // the broadcast too.
      if (prev.show.area && !merged.show.area) setVisibility({ live: false });

      return merged;
    });
  }, [setVisibility]);

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
            vector: selfVector,
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
    [mask, record, salts.vector, selfVector, vectorCommit],
  );

  /**
   * Writes the profile record to Midnight.
   *
   * What crosses the boundary is one hash and a list of field names. The
   * answers stay here: a peer who later opens `bio` against this commitment
   * learns the bio, and a peer who does not, does not - and neither can learn
   * anything about the fields marked hidden, because there is nothing to open.
   */
  const publishProfile = useCallback(
    async (onPhase?: PhaseHandler) => {
      const canonical = canonicalise(profile);
      const commit = await profileCommitment(canonical, salts.profile);

      const proof = await prove(
        {
          kind: 'profile',
          canonical,
          salt: salts.profile,
          commitA: commit,
          shown: SHOWABLE.filter((field) => profile.show[field]),
        },
        { onPhase },
      );

      setProfileCommit(commit);
      return record(proof);
    },
    [profile, record, salts.profile],
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
      profile,
      saveProfile,
      profileCommit,
      publishProfile,
      selfVector,
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
      profile,
      saveProfile,
      profileCommit,
      publishProfile,
      selfVector,
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
