import { assertSuccess, binToHex, cashAddressToLockingBytecode, generateBip39Mnemonic, hexToBin, lockingBytecodeToCashAddress, sha256 } from '@bitauth/libauth';
import { Crypto, convertMnemonicToSeedBytes } from '@xo-cash/crypto';
import { signXoRewardInput } from './signing';
import type { CompilationContextBch } from '@bitauth/libauth';
import { Engine } from '@xo-cash/engine';
import { p2pkhTemplate } from '@xo-cash/templates';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { recoveryPhraseSchema, WalletInitializationError } from './mnemonic';
import { readStoredWalletIdentity, walletAddressCacheKey } from './identity';
import { restoreStoredWallet } from './restore';

const mnemonicKey = 'focus-garden-chipnet-mnemonic-v1';

export const supportsHelperWallet = true;

async function initializeWallet(create = false) {
  const saved = await SecureStore.getItemAsync(mnemonicKey);
  if (!saved && !create) throw new WalletInitializationError({ message: 'The existing XO vault is unavailable. No replacement wallet was created.' });
  const mnemonic = recoveryPhraseSchema.parse(saved ?? generateBip39Mnemonic());
  if (!saved) await SecureStore.setItemAsync(mnemonicKey, mnemonic, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  const engine = await Engine.create(mnemonic, { network: 'chipnet', databasePath: './focus-garden', databaseFilename: 'FocusGarden' });
  const { templateIdentifier } = await engine.importTemplate(p2pkhTemplate);
  await engine.setWalletName('Focus Garden');
  await engine.setDefaultPolicies({ receive: { templateIdentifier }, change: { templateIdentifier } });
  // Bind cached addresses to the key material, including after Android restores
  // app data without the SecureStore entry. Never reuse another wallet's address.
  const addressKey = walletAddressCacheKey(mnemonic);
  const savedAddress = Storage.getItemSync(addressKey);
  const address = savedAddress ?? assertSuccess(lockingBytecodeToCashAddress({
    bytecode: hexToBin(await engine.generateLockingBytecodeFromDefaultPolicy('receive')),
    prefix: 'bchtest',
  })).address;
  Storage.setItemSync(addressKey, address);
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new WalletInitializationError({ message: decoded });
  const crypto = new Crypto(convertMnemonicToSeedBytes(mnemonic), { network: 'testnet' });
  async function signP2pkh(context: CompilationContextBch) {
    const source = context.sourceOutputs[context.inputIndex];
    if (!source) throw new WalletInitializationError({ message: 'Transaction is missing its source output.' });
    const scriptHash = binToHex(sha256.hash(source.lockingBytecode).reverse());
    const secrets = await engine.listSecretsForScriptHash(scriptHash);
    const secret = secrets.find((entry) => entry.isEntropy);
    if (!secret) throw new WalletInitializationError({ message: 'This wallet has no signing key for the funding output.' });
    return signXoRewardInput(crypto, { templateIdentifier: secret.templateIdentifier, derivationIndex: Number(secret.value) }, context);
  }
  return { engine, address, lockingBytecode: decoded.bytecode, signP2pkh };
}

// Public runtime contract: global cache survives Fast Refresh. Electrum permits one
// Engine.create per JS runtime, including after a failed partial initialization.
declare global {
  var __focusGardenWallet: ReturnType<typeof initializeWallet> | undefined;
  var __focusGardenWalletRestore: Promise<void> | undefined;
}
export function connectWallet() {
  if (globalThis.__focusGardenWalletRestore) throw new WalletInitializationError({ message: 'Wallet restoration is still in progress. Try opening it again when restoration finishes.' });
  globalThis.__focusGardenWallet ??= initializeWallet(true);
  return globalThis.__focusGardenWallet;
}
export function connectExistingWallet() {
  if (globalThis.__focusGardenWalletRestore) throw new WalletInitializationError({ message: 'Wallet restoration is still in progress.' });
  globalThis.__focusGardenWallet ??= initializeWallet(false);
  return globalThis.__focusGardenWallet;
}
export async function readNativeWalletIdentity() {
  const mnemonic = await SecureStore.getItemAsync(mnemonicKey);
  return readStoredWalletIdentity(mnemonic, (key) => Storage.getItemSync(key));
}
export async function readRecoveryPhrase() {
  return SecureStore.getItemAsync(mnemonicKey);
}

// Restore only before wallet creation. The shared setup lock prevents a fast back
// navigation / Open wallet press from racing and saving a different mnemonic.
export function restoreNativeWallet(input: string) {
  const mnemonic = recoveryPhraseSchema.parse(input);
  if (globalThis.__focusGardenWallet || globalThis.__focusGardenWalletRestore) throw new WalletInitializationError({ message: 'A wallet is already active in this session. Restoration will not replace it.' });
  const restoring = restoreStoredWallet(mnemonic, {
    read: () => SecureStore.getItemAsync(mnemonicKey),
    save: (value) => SecureStore.setItemAsync(mnemonicKey, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  }).finally(() => { globalThis.__focusGardenWalletRestore = undefined; });
  globalThis.__focusGardenWalletRestore = restoring;
  return restoring;
}
