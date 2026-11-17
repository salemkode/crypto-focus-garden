import {
  assertSuccess, binToHex, encodeLockingBytecodeP2pkh, hash160, importWalletTemplate,
  walletTemplateP2pkhNonHd, walletTemplateToCompilerConfiguration, type CompilationContextBch,
} from '@bitauth/libauth';
import { Crypto } from '@xo-cash/crypto';
import { WalletInitializationError } from './mnemonic.ts';

const standard = walletTemplateToCompilerConfiguration(assertSuccess(importWalletTemplate(walletTemplateP2pkhNonHd)));
const compilerConfiguration = {
  ...standard,
  scripts: { ...standard.scripts, unlock: '<key.schnorr_signature.all_outputs_all_utxos> <key.public_key>' },
};

export function signXoRewardInput(crypto: Crypto, keyReference: Parameters<Crypto['derivePublicKey']>[0], context: CompilationContextBch) {
  const sourceOutput = context.sourceOutputs[context.inputIndex];
  const expected = encodeLockingBytecodeP2pkh(hash160(crypto.derivePublicKey(keyReference)));
  if (!sourceOutput || binToHex(expected) !== binToHex(sourceOutput.lockingBytecode)) throw new WalletInitializationError({ message: 'Wallet key does not match this funding output.' });
  const signed = crypto.compileScript({ compilerConfiguration, scriptId: 'unlock', data: { compilationContext: context }, keyReferences: { key: keyReference } });
  if (!(signed instanceof Uint8Array)) throw new WalletInitializationError({ message: `XO could not sign the reward input: ${signed.compilationErrors.map((error) => error.message).join('; ')}` });
  return signed;
}
