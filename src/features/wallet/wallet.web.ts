import { GardenTransactionError } from '@focus-garden/protocol';

export const supportsHelperWallet = false;

/** The browser uses connected wallets. It never opens or stores a helper-wallet seed. */
function unavailable() {
  throw new GardenTransactionError({ message: 'Use the iOS or Android app for a helper wallet. The web app only links your external wallet.' });
}

export const connectWallet = unavailable;
export const connectExistingWallet = unavailable;
export const restoreNativeWallet = unavailable;
export async function readNativeWalletIdentity() { return null; }
export async function readRecoveryPhrase() { return null; }
