import { recoveryPhraseSchema, WalletInitializationError } from './mnemonic.ts';

// The vault boundary keeps overwrite protection identical in the native app and
// in tests. The caller serializes this operation with wallet initialization.
export async function restoreStoredWallet(
  input: string,
  vault: { read: () => Promise<string | null>; save: (mnemonic: string) => Promise<void> },
) {
  const mnemonic = recoveryPhraseSchema.parse(input);
  const saved = await vault.read();
  if (saved !== null) throw new WalletInitializationError({ message: 'A wallet already exists on this device. Its recovery phrase has not been replaced.' });
  await vault.save(mnemonic);
}
