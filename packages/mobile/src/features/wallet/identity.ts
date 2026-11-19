import type { GardenNetwork } from '@focus-garden/protocol';
import { addressPrefix, clientNetwork, networkStorageKey } from '../../services/network';
import { binToHex, cashAddressToLockingBytecode, sha256, utf8ToBin } from '@bitauth/libauth';
import { recoveryPhraseSchema, WalletInitializationError } from './mnemonic.ts';

export function walletAddressCacheKey(mnemonic: string, network: GardenNetwork = clientNetwork) {
  return networkStorageKey(`focus-garden-receive-${binToHex(sha256.hash(utf8ToBin(mnemonic)))}`, network);
}

// A missing vault/address means this installation has no established account.
// Never display a cached address from a different restored recovery phrase.
export function readStoredWalletIdentity(mnemonic: string | null, readAddress: (key: string) => string | null, network: GardenNetwork = clientNetwork) {
  if (mnemonic === null) return null;
  const address = readAddress(walletAddressCacheKey(recoveryPhraseSchema.parse(mnemonic), network));
  if (address === null) return null;
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string' || !address.startsWith(`${addressPrefix(network)}:`) || decoded.bytecode.length !== 25 || binToHex(decoded.bytecode).slice(0, 6) !== '76a914') throw new WalletInitializationError({ message: 'The saved wallet address for this network is invalid. Open the wallet to check its storage.' });
  return { address, lockingBytecode: decoded.bytecode };
}
