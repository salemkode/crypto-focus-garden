import { z } from 'zod';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hexToBytes } from '@noble/hashes/utils';
import { WalletInitializationError } from './mnemonic';

export const rawKeySchema = z.string().trim().regex(/^[0-9a-fA-F]{64}$/, 'Enter the 64 hexadecimal characters from your legacy app-key backup.').pipe(z.string().refine((key) => secp256k1.utils.isValidPrivateKey(hexToBytes(key)), 'This is not a valid app-wallet key.')).transform((key) => key.toLowerCase());
const restoration: { pending: Promise<void> | null } = { pending: null };
export function restoreRawWallet(input: string, vault: { read: () => Promise<string | null>; save: (key: string) => Promise<void> }) {
  const key = rawKeySchema.parse(input);
  if (restoration.pending) throw new WalletInitializationError({ message: 'A legacy wallet restoration is already in progress.' });
  const pending = (async () => {
  if (await vault.read() !== null) throw new WalletInitializationError({ message: 'A legacy app wallet already exists. Its key has not been replaced.' });
  await vault.save(key);
  })().finally(() => { restoration.pending = null; });
  restoration.pending = pending;
  return pending;
}
