import { assertSuccess, binToHex, createCompilerBch, encodeLockingBytecodeP2pkh, hash160, importWalletTemplate, secp256k1, walletTemplateP2pkhNonHd, walletTemplateToCompilerConfiguration, type CompilationContextBch } from '@bitauth/libauth';
import { GardenTransactionError } from './index';

export function signAppWalletInput(key: Uint8Array, context: CompilationContextBch) {
  const source = context.sourceOutputs[context.inputIndex];
  const publicKey = assertSuccess(secp256k1.derivePublicKeyCompressed(key));
  if (!source || binToHex(encodeLockingBytecodeP2pkh(hash160(publicKey))) !== binToHex(source.lockingBytecode) || source.token) throw new GardenTransactionError({ message: 'The app wallet can only sign its own plain BCH input.' });
  const standard = walletTemplateToCompilerConfiguration(assertSuccess(importWalletTemplate(walletTemplateP2pkhNonHd)));
  const compiler = createCompilerBch({ ...standard, scripts: { ...standard.scripts, unlock: '<key.schnorr_signature.all_outputs_all_utxos> <key.public_key>' } });
  const result = compiler.generateBytecode({ scriptId: 'unlock', data: { keys: { privateKeys: { key } }, compilationContext: context } });
  if (!result.success) throw new GardenTransactionError({ message: 'The app wallet could not sign this transaction.' });
  return result.bytecode;
}
