import { binToHex, decodeTransaction, encodeTransaction, hash256, hexToBin, sha256, utf8ToBin } from '@bitauth/libauth';
import * as Data from 'effect/Data';
import { z } from 'zod';
import { ABOUT_MAX_BYTES, canPlant, checkMerge, MAX_UNITS, PROFILE_NAME_BYTES, TREE_COMMITMENT } from './forest';

export class GardenTransactionError extends Data.TaggedError('GardenTransactionError')<{ message: string }> {}
export const MAX_TRANSACTION_HEX_LENGTH = 200_000;
export const hex = z.string().regex(/^(?:[0-9a-f]{2})+$/).max(MAX_TRANSACTION_HEX_LENGTH);
export const gardenNetwork = z.enum(['chipnet', 'mainnet']);
export type GardenNetwork = z.infer<typeof gardenNetwork>;
export const gardenPrefix = (network: GardenNetwork) => network === 'mainnet' ? 'bitcoincash' : 'bchtest';
export const gardenAddress = (network: GardenNetwork) => z.string().startsWith(`${gardenPrefix(network)}:`).max(100);
export const address = gardenAddress('chipnet');
const treeCommitment = z.string().regex(TREE_COMMITMENT);
const utf8Length = (text: string) => new TextEncoder().encode(text.trim()).length;
export const gardenIntent = (network: GardenNetwork) => z.discriminatedUnion('action', [
  z.object({ action: z.literal('plant'), rewardAddress: gardenAddress(network), units: z.number().int().min(1).max(MAX_UNITS), tier: z.number().int(), species: z.number().int() })
    .refine((intent) => canPlant(intent.tier, intent.units, intent.species), 'This reward needs a longer focus lock.'),
  z.object({ action: z.literal('claim'), commitment: treeCommitment }),
  z.object({ action: z.literal('merge'), commitments: z.array(treeCommitment).min(2).max(3) })
    .refine((intent) => checkMerge(intent.commitments) !== null, 'These trees cannot be merged together.'),
  z.object({ action: z.literal('register'), name: z.string().refine((name) => utf8Length(name) >= PROFILE_NAME_BYTES.min && utf8Length(name) <= PROFILE_NAME_BYTES.max, 'Choose a name of 3 to 32 bytes.'), about: z.string().refine((about) => utf8Length(about) <= ABOUT_MAX_BYTES, 'Keep "about me" short.').default('') }),
  z.object({ action: z.literal('tip'), profile: z.string().min(1).max(100), recipient: gardenAddress(network), amount: z.number().int().min(1000).max(1_000_000) }),
]);
export const intentSchema = gardenIntent('chipnet');
export const chainIdentitySchema = z.object({ genesisHash: z.string().regex(/^[0-9a-f]{64}$/), checkpointHeight: z.number().int().positive(), checkpointHash: z.string().regex(/^[0-9a-f]{64}$/) });
export const gardenPrepared = <Network extends GardenNetwork>(network: Network) => z.object({
  id: z.string().uuid(), network: z.literal(network), chainIdentity: chainIdentitySchema.optional(), transaction: hex,
  sourceTransactions: z.array(hex).min(1).max(5),
});
export const preparedSchema = gardenPrepared('chipnet');
export function transactionId(raw: string) {
  return binToHex(hash256(hexToBin(hex.parse(raw)))).match(/../g)!.reverse().join('');
}
export function decode(raw: string) {
  const decoded = decodeTransaction(hexToBin(hex.parse(raw)));
  if (typeof decoded === 'string') throw new GardenTransactionError({ message: decoded });
  return decoded;
}
export function resolvePrepared(input: z.input<ReturnType<typeof gardenPrepared>>, network: GardenNetwork = 'chipnet') {
  const prepared = gardenPrepared(network).parse(input);
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

// Generated locally by both sides: this synthetic outpoint is a domain-separated
// nonce, never a request to sign a server-selected digest or spend a real coin.
export function ownershipContext(account: string, nonce: string, lockingBytecode: Uint8Array, network: GardenNetwork = 'chipnet') {
  const outpointTransactionHash = sha256.hash(utf8ToBin(`focus-garden:${network}:ownership:v1:${account}:${nonce}:${binToHex(lockingBytecode)}`));
  return {
    inputIndex: 0,
    sourceOutputs: [{ lockingBytecode, valueSatoshis: 1000n }],
    transaction: { version: 2, locktime: 0,
      inputs: [{ outpointTransactionHash, outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: hexToBin('') }],
      outputs: [{ lockingBytecode, valueSatoshis: 1000n }],
    },
  };
}
/** The app wallet's funding input is always the last input. */
export function fundingInputIndex(transaction: ReturnType<typeof decode>) {
  return transaction.inputs.length - 1;
}
export function unsignedFingerprint(transaction: ReturnType<typeof decode>) {
  const funding = fundingInputIndex(transaction);
  return binToHex(encodeTransaction({ ...transaction, inputs: transaction.inputs.map((entry, index) => index === funding ? { ...entry, unlockingBytecode: hexToBin('') } : entry) }));
}
