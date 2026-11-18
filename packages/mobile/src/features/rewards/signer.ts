import { binToHex, createVirtualMachineBch2026, encodeTransaction, hexToBin, type CompilationContextBch } from '@bitauth/libauth';
import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { ownershipContext, chainIdentitySchema, GardenTransactionError, intentSchema, preparedSchema } from '@focus-garden/protocol';
import { signAppWalletInput } from '@focus-garden/protocol/signing';
import { validateRewardTransaction } from '@focus-garden/protocol/policy';
import { parseTree } from '@focus-garden/protocol/forest';
import { z } from 'zod';
import { connectExistingWallet } from '../wallet/wallet';
import { loadInternalWallet } from '../../wallet/internal';
import { parseRewardAddress } from '../../wallet/address';

async function signOwnedInput(walletAddress: string, context: CompilationContextBch) {
  const selected = Storage.getItemSync('focusgarden.active.wallet.v1');
  const foundation = selected === 'xo' ? null : await loadInternalWallet();
  if (foundation && parseRewardAddress(foundation.address).lockingBytecode === parseRewardAddress(walletAddress).lockingBytecode) {
    const secret = await SecureStore.getItemAsync('focusgarden.chipnet.internal.v1');
    if (!secret) throw new GardenTransactionError({ message: 'The original app-wallet key is unavailable. It has not been replaced.' });
    const key = hexToBin(secret);
    return signAppWalletInput(key, context);
  }
  if (selected === 'foundation') throw new GardenTransactionError({ message: 'The selected legacy wallet does not match the funding address.' });
  const xo = await connectExistingWallet();
  if (parseRewardAddress(xo.address).lockingBytecode !== parseRewardAddress(walletAddress).lockingBytecode) throw new GardenTransactionError({ message: 'The active XO key does not match the selected app wallet.' });
  return xo.signP2pkh(context);
}
export async function proveAppWallet(wallet: string, account: string, nonce: string) {
  const context = ownershipContext(account, nonce, hexToBin(parseRewardAddress(wallet).lockingBytecode));
  return binToHex(await signOwnedInput(wallet, context));
}
export async function signRewardTransaction(wallet: string, requested: z.input<typeof intentSchema>, input: z.input<typeof preparedSchema>, startedAt: number) {
  const intent = intentSchema.parse(requested);
  const prepared = preparedSchema.parse(input);
  const config = z.object({ category: z.string().regex(/^[0-9a-f]{64}$/), contractBytecode: z.string().regex(/^aa20[0-9a-f]{64}87$/) }).safeParse({ category: process.env.EXPO_PUBLIC_GARDEN_CATEGORY, contractBytecode: process.env.EXPO_PUBLIC_GARDEN_CONTRACT_BYTECODE });
  if (!config.success) throw new GardenTransactionError({ message: 'On-chain rewards are not configured for this app build.' });
  const expectedChain = chainIdentitySchema.safeParse({ genesisHash: process.env.EXPO_PUBLIC_GARDEN_GENESIS_HASH, checkpointHeight: Number(process.env.EXPO_PUBLIC_GARDEN_CHECKPOINT_HEIGHT), checkpointHash: process.env.EXPO_PUBLIC_GARDEN_CHECKPOINT_HASH });
  if (!expectedChain.success || prepared.chainIdentity?.genesisHash !== expectedChain.data.genesisHash || prepared.chainIdentity.checkpointHash !== expectedChain.data.checkpointHash || prepared.chainIdentity.checkpointHeight !== expectedChain.data.checkpointHeight) throw new GardenTransactionError({ message: 'Transaction preparation does not match this build’s verified Chipnet checkpoint.' });
  const rewardBytecode = intent.action === 'plant' ? parseRewardAddress(intent.rewardAddress).lockingBytecode
    : intent.action === 'tip' ? parseRewardAddress(intent.recipient).lockingBytecode
    : intent.action === 'register' ? undefined
    : parseTree(intent.action === 'claim' ? intent.commitment : intent.commitments[0])!.ownerBytecode;
  const directory = z.object({ directoryCategory: z.string().regex(/^[0-9a-f]{64}$/), directoryBytecode: z.string().regex(/^aa20[0-9a-f]{64}87$/) }).safeParse({ directoryCategory: process.env.EXPO_PUBLIC_GARDEN_DIRECTORY_CATEGORY, directoryBytecode: process.env.EXPO_PUBLIC_GARDEN_DIRECTORY_BYTECODE });
  const resolved = validateRewardTransaction(prepared, intent, { ...config.data, ...(directory.success ? directory.data : {}), internalBytecode: parseRewardAddress(wallet).lockingBytecode, rewardBytecode, nowSeconds: Math.floor(Date.now() / 1000), requestedAtSeconds: startedAt });
  // The app wallet's funding input is always last; contract inputs are never signed here.
  const inputIndex = resolved.transaction.inputs.length - 1;
  const context = { ...resolved, inputIndex };
  context.transaction.inputs[inputIndex].unlockingBytecode = await signOwnedInput(wallet, context);
  const verified = createVirtualMachineBch2026().verify(context);
  if (verified !== true) throw new GardenTransactionError({ message: `The signed covenant transaction was rejected locally: ${verified}` });
  return binToHex(encodeTransaction(context.transaction));
}
