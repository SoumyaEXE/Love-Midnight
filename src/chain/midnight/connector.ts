import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { WalletState } from './types';

/**
 * Midnight wallet connection for React Native.
 *
 * The official connector (`window.midnight.mnLace`) is a browser-extension
 * injection and does not exist on a handset. Two transports are implemented
 * behind one interface so the screens do not care which is live:
 *
 *   deeplink  the real path. Halo opens `midnight://connect?...` with a
 *             callback into its own `halo://` scheme; a mobile wallet that
 *             registers the scheme answers with an address and coin key. No
 *             mobile Midnight wallet ships this yet, so it is written to the
 *             connector API's shape and will light up when one does.
 *
 *   local     a device-resident keypair in the secure enclave. Not custody -
 *             it is a demo signer that produces stable, real commitments so
 *             the privacy story is end-to-end inspectable without a wallet.
 *             The UI labels this state; it never claims to be a wallet.
 *
 * The point of the split is that everything downstream - commitments, witness
 * assembly, nullifiers - is identical either way. Only the key custody differs.
 */

const KEY_SEED = 'halo.wallet.seed';
const KEY_ADDRESS = 'halo.wallet.address';

export type ConnectorTransport = 'deeplink' | 'local';

export type Connector = {
  transport: ConnectorTransport;
  connect(): Promise<WalletState>;
  disconnect(): Promise<void>;
  /** Signs a 32-byte digest. Used for the pairing handshake. */
  sign(digest: string): Promise<string>;
};

// -----------------------------------------------------------------------------
// deeplink transport
// -----------------------------------------------------------------------------

const WALLET_SCHEME = 'midnight://';

export async function isWalletAppInstalled(): Promise<boolean> {
  try {
    return await Linking.canOpenURL(`${WALLET_SCHEME}connect`);
  } catch {
    return false;
  }
}

function deeplinkConnector(): Connector {
  return {
    transport: 'deeplink',

    async connect() {
      const callback = Linking.createURL('/wallet-callback');
      const url = `${WALLET_SCHEME}connect?dapp=Halo&callback=${encodeURIComponent(callback)}`;

      // The wallet answers by opening our scheme, which the root layout picks
      // up through `Linking.addEventListener`. This promise resolves when that
      // listener fires, or rejects if the user backs out.
      const answer = new Promise<WalletState>((resolve, reject) => {
        const sub = Linking.addEventListener('url', ({ url: incoming }) => {
          const { queryParams } = Linking.parse(incoming);
          sub.remove();
          clearTimeout(timer);

          if (!queryParams?.address) {
            reject(new Error('Wallet returned no address'));
            return;
          }
          resolve({
            status: 'connected',
            address: String(queryParams.address),
            coinPublicKey: queryParams.coinPublicKey ? String(queryParams.coinPublicKey) : undefined,
            name: queryParams.wallet ? String(queryParams.wallet) : 'Midnight Wallet',
          });
        });

        const timer = setTimeout(() => {
          sub.remove();
          reject(new Error('Wallet did not respond'));
        }, 90_000);
      });

      await Linking.openURL(url);
      return answer;
    },

    async disconnect() {
      // Nothing held locally - the wallet owns the session.
    },

    async sign(digest) {
      const callback = Linking.createURL('/wallet-sign');
      await Linking.openURL(
        `${WALLET_SCHEME}sign?digest=${digest}&callback=${encodeURIComponent(callback)}`,
      );
      return new Promise<string>((resolve, reject) => {
        const sub = Linking.addEventListener('url', ({ url }) => {
          const { queryParams } = Linking.parse(url);
          sub.remove();
          if (queryParams?.signature) resolve(String(queryParams.signature));
          else reject(new Error('Wallet declined'));
        });
      });
    },
  };
}

// -----------------------------------------------------------------------------
// local transport
// -----------------------------------------------------------------------------

/**
 * Derives a stable demo identity from a seed held in the platform keystore.
 *
 * The address is formatted like a real Midnight bech32m address so the UI's
 * truncation and copy affordances are exercised honestly, but the prefix is
 * `mn_demo` rather than `mn_shield-addr` - nobody should be able to paste this
 * anywhere and have it look like a funded account.
 */
function localConnector(): Connector {
  return {
    transport: 'local',

    async connect() {
      let seed = await SecureStore.getItemAsync(KEY_SEED);
      if (!seed) {
        seed = bytesToHex(Crypto.getRandomBytes(32));
        await SecureStore.setItemAsync(KEY_SEED, seed, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }

      let address = await SecureStore.getItemAsync(KEY_ADDRESS);
      if (!address) {
        const digest = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `halo:addr:${seed}`,
        );
        address = `mn_demo1${digest.slice(0, 52)}`;
        await SecureStore.setItemAsync(KEY_ADDRESS, address);
      }

      const coinPublicKey = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `halo:coin:${seed}`,
      );

      return {
        status: 'connected',
        address,
        coinPublicKey,
        name: 'On-device key',
      };
    },

    async disconnect() {
      await SecureStore.deleteItemAsync(KEY_ADDRESS);
      // The seed is deliberately retained: wiping it would orphan every
      // commitment the user has already published, and they would silently
      // lose their match history. Use `wipeIdentity` for a real reset.
    },

    async sign(digest) {
      const seed = await SecureStore.getItemAsync(KEY_SEED);
      if (!seed) throw new Error('No local key');
      return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${seed}:${digest}`);
    },
  };
}

/** Full local reset. Destroys the seed, and with it every past commitment. */
export async function wipeIdentity(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_SEED),
    SecureStore.deleteItemAsync(KEY_ADDRESS),
  ]);
}

// -----------------------------------------------------------------------------

/** Picks the deeplink transport when a wallet is installed, otherwise local. */
export async function resolveConnector(): Promise<Connector> {
  return (await isWalletAppInstalled()) ? deeplinkConnector() : localConnector();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reference to the injected browser API. Unused on native, kept so the web
 * build of this Expo app can use the real extension connector unchanged.
 */
export type InjectedConnector = InitialAPI;
export type InjectedWallet = ConnectedAPI;
