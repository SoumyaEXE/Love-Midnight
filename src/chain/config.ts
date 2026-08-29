import Constants from 'expo-constants';

/**
 * Network configuration.
 *
 * Everything is overridable through `extra` in app.json so the same binary can
 * be pointed at a local devnet during judging and at testnet for the recording,
 * without a rebuild.
 */

type Extra = {
  midnightIndexer?: string;
  midnightProofServer?: string;
  midnightNode?: string;
  proximityContract?: string;
  matchContract?: string;
  credentialContract?: string;
  solanaCluster?: string;
  solanaProgram?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const midnightConfig = {
  /** GraphQL indexer. Reads ledger state; never sees witnesses. */
  indexer: extra.midnightIndexer ?? 'https://indexer.testnet-02.midnight.network/api/v1/graphql',
  /**
   * Proof server. Takes a proving key plus witnesses and returns a proof.
   *
   * This is the one component that sees private inputs, which is why the
   * default is a loopback address: on a phone that resolves to nothing, the app
   * falls back to the simulated prover, and no witness ever leaves the handset
   * by accident because someone left a hosted URL in a build.
   */
  proofServer: extra.midnightProofServer ?? 'http://127.0.0.1:6300',
  node: extra.midnightNode ?? 'https://rpc.testnet-02.midnight.network',
  contracts: {
    proximity: extra.proximityContract ?? null,
    match: extra.matchContract ?? null,
    credential: extra.credentialContract ?? null,
  },
} as const;

export const solanaConfig = {
  cluster: extra.solanaCluster ?? 'https://api.devnet.solana.com',
  /** Memo program. Attestations are memos, not a custom program - see bridge.ts. */
  memoProgram: extra.solanaProgram ?? 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
} as const;

/**
 * True when a real proof server is reachable. Resolved once at startup by
 * `probeProofServer`; until then the app assumes simulation and says so in the
 * UI rather than silently pretending.
 */
export let hasProofServer = false;

export async function probeProofServer(timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${midnightConfig.proofServer}/health`, {
      signal: controller.signal,
    });
    hasProofServer = res.ok;
  } catch {
    hasProofServer = false;
  } finally {
    clearTimeout(timer);
  }
  return hasProofServer;
}
