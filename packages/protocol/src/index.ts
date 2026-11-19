import { binToHex, decodeTransaction, encodeTransaction, hash256, hexToBin } from '@bitauth/libauth';
import * as Data from 'effect/Data';
import { z } from 'zod';
import { ABOUT_MAX_BYTES, canPlant, checkMerge, MAX_UNITS, PROFILE_NAME_BYTES, TREE_COMMITMENT } from './forest';

export class GardenTransactionError extends Data.TaggedError('GardenTransactionError')<{ message: string }> {}
export const hex = z.string().regex(/^(?:[0-9a-f]{2})+$/).max(200_000);
/** A cash address on either network; builders check it against the deployment's prefix. */
export const address = z.string().regex(/^(bitcoincash|bchtest):[02-9ac-hj-np-z]{42}$/).max(100);
const treeCommitment = z.string().regex(TREE_COMMITMENT);
const utf8Length = (text: string) => new TextEncoder().encode(text.trim()).length;
export const intentSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('plant'), rewardAddress: address, units: z.number().int().min(1).max(MAX_UNITS), tier: z.number().int(), species: z.number().int() })
    .refine((intent) => canPlant(intent.tier, intent.units, intent.species), 'This reward needs a longer focus lock.'),
  z.object({ action: z.literal('claim'), commitment: treeCommitment }),
  z.object({ action: z.literal('merge'), commitments: z.array(treeCommitment).min(2).max(3) })
    .refine((intent) => checkMerge(intent.commitments) !== null, 'These trees cannot be merged together.'),
  z.object({ action: z.literal('register'), name: z.string().refine((name) => utf8Length(name) >= PROFILE_NAME_BYTES.min && utf8Length(name) <= PROFILE_NAME_BYTES.max, 'Choose a name of 3 to 32 bytes.'), about: z.string().refine((about) => utf8Length(about) <= ABOUT_MAX_BYTES, 'Keep "about me" short.').default('') }),
  z.object({ action: z.literal('tip'), profile: z.string().min(1).max(100), recipient: address, amount: z.number().int().min(1000).max(1_000_000) }),
]);
export const preparedSchema = z.object({
  id: z.string().uuid(), network: z.enum(['mainnet', 'chipnet']), transaction: hex,
  sourceTransactions: z.array(hex).min(1).max(5),
});
export function transactionId(raw: string) {
  return binToHex(hash256(hexToBin(hex.parse(raw)))).match(/../g)!.reverse().join('');
}
export function decode(raw: string) {
  const decoded = decodeTransaction(hexToBin(hex.parse(raw)));
  if (typeof decoded === 'string') throw new GardenTransactionError({ message: decoded });
  return decoded;
}
export function resolvePrepared(input: z.input<typeof preparedSchema>) {
  const prepared = preparedSchema.parse(input);
  const transaction = decode(prepared.transaction);
  if (transaction.inputs.length !== prepared.sourceTransactions.length) throw new GardenTransactionError({ message: 'Every input needs its source transaction.' });
  const sourceOutputs = transaction.inputs.map((entry, index) => {
    const raw = prepared.sourceTransactions[index];
    if (transactionId(raw) !== binToHex(entry.outpointTransactionHash)) throw new GardenTransactionError({ message: 'Source transaction hash mismatch.' });
    const output = decode(raw).outputs[entry.outpointIndex];
    if (!output) throw new GardenTransactionError({ message: 'Missing source output.' });
    return output;
  });
  const outpoints = new Set(transaction.inputs.map((entry) => `${binToHex(entry.outpointTransactionHash)}:${entry.outpointIndex}`));
  if (outpoints.size !== transaction.inputs.length) throw new GardenTransactionError({ message: 'Duplicate input.' });
  return { transaction, sourceOutputs };
}

/** The app wallet's funding input is always the last input. */
export function fundingInputIndex(transaction: ReturnType<typeof decode>) {
  return transaction.inputs.length - 1;
}
export function unsignedFingerprint(transaction: ReturnType<typeof decode>) {
  const funding = fundingInputIndex(transaction);
  return binToHex(encodeTransaction({ ...transaction, inputs: transaction.inputs.map((entry, index) => index === funding ? { ...entry, unlockingBytecode: hexToBin('') } : entry) }));
}
