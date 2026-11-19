import { binToHex, createVirtualMachineBch2026, encodeTransaction, hexToBin, type CompilationContextBch } from '@bitauth/libauth';
import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { GardenTransactionError, intentSchema, preparedSchema } from '@focus-garden/protocol';
import { signAppWalletInput } from '@focus-garden/protocol/signing';
import { validateRewardTransaction } from '@focus-garden/protocol/policy';
import { parseTree } from '@focus-garden/protocol/forest';
import { z } from 'zod';
import { connectExistingWallet } from '../wallet/wallet';
import { INTERNAL_KEY_NAME, loadInternalWallet } from '../../wallet/internal';
import { parseRewardAddress } from '../../wallet/address';
import { DEPLOYMENT } from '../../services/network';

async function signOwnedInput(walletAddress: string, context: CompilationContextBch) {
  const selected = Storage.getItemSync('focusgarden.active.wallet.v1');
  const foundation = selected === 'xo' ? null : await loadInternalWallet();
  if (foundation && parseRewardAddress(foundation.address).lockingBytecode === parseRewardAddress(walletAddress).lockingBytecode) {
    const secret = await SecureStore.getItemAsync(INTERNAL_KEY_NAME);
    if (!secret) throw new GardenTransactionError({ message: 'The original app-wallet key is unavailable. It has not been replaced.' });
    const key = hexToBin(secret);
    return signAppWalletInput(key, context);
  }
  if (selected === 'foundation') throw new GardenTransactionError({ message: 'The selected legacy wallet does not match the funding address.' });
  const xo = await connectExistingWallet();
  if (parseRewardAddress(xo.address).lockingBytecode !== parseRewardAddress(walletAddress).lockingBytecode) throw new GardenTransactionError({ message: 'The active XO key does not match the selected app wallet.' });
  return xo.signP2pkh(context);
}
export async function signRewardTransaction(wallet: string, requested: z.input<typeof intentSchema>, input: z.input<typeof preparedSchema>, startedAt: number) {
  const intent = intentSchema.parse(requested);
  const prepared = preparedSchema.parse(input);
  if (prepared.network !== DEPLOYMENT.network) throw new GardenTransactionError({ message: `This transaction is not for ${DEPLOYMENT.network}.` });
  const rewardBytecode = intent.action === 'plant' ? parseRewardAddress(intent.rewardAddress).lockingBytecode
    : intent.action === 'tip' ? parseRewardAddress(intent.recipient).lockingBytecode
    : intent.action === 'register' ? undefined
    : parseTree(intent.action === 'claim' ? intent.commitment : intent.commitments[0])!.ownerBytecode;
  // Independent check of what was built, against the contracts pinned in this build, before signing.
  const resolved = validateRewardTransaction(prepared, intent, {
    category: DEPLOYMENT.forest.category, contractBytecode: DEPLOYMENT.forest.lockingBytecode,
    ...(DEPLOYMENT.directory ? { directoryCategory: DEPLOYMENT.directory.category, directoryBytecode: DEPLOYMENT.directory.lockingBytecode } : {}),
    internalBytecode: parseRewardAddress(wallet).lockingBytecode, rewardBytecode, nowSeconds: Math.floor(Date.now() / 1000), requestedAtSeconds: startedAt,
  });
  // The app wallet's funding input is always last; contract inputs are never signed here.
  const inputIndex = resolved.transaction.inputs.length - 1;
  const context = { ...resolved, inputIndex };
  context.transaction.inputs[inputIndex].unlockingBytecode = await signOwnedInput(wallet, context);
  const verified = createVirtualMachineBch2026().verify(context);
  if (verified !== true) throw new GardenTransactionError({ message: `The signed covenant transaction was rejected locally: ${verified}` });
  return binToHex(encodeTransaction(context.transaction));
}
