import { binToHex, cashAddressToLockingBytecode, sha256, utf8ToBin } from '@bitauth/libauth';
import { recoveryPhraseSchema, WalletInitializationError } from './mnemonic.ts';
import { NETWORK, PREFIX } from '../../services/network';

export function walletAddressCacheKey(mnemonic: string) {
  // Chipnet keeps its original key; other networks get their own cached address.
  const scope = NETWORK === 'chipnet' ? '' : `${NETWORK}-`;
  return `focus-garden-receive-${scope}${binToHex(sha256.hash(utf8ToBin(mnemonic)))}`;
}

// A missing vault/address means this installation has no established account.
// Never display a cached address from a different restored recovery phrase.
export function readStoredWalletIdentity(mnemonic: string | null, readAddress: (key: string) => string | null) {
  if (mnemonic === null) return null;
  const address = readAddress(walletAddressCacheKey(recoveryPhraseSchema.parse(mnemonic)));
  if (address === null) return null;
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string' || !address.startsWith(`${PREFIX}:`) || decoded.bytecode.length !== 25 || binToHex(decoded.bytecode).slice(0, 6) !== '76a914') throw new WalletInitializationError({ message: 'The saved wallet address is invalid. Open the wallet to check its storage.' });
  return { address, lockingBytecode: decoded.bytecode };
}
