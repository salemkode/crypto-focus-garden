import { binToHex } from '@bitauth/libauth';
import { z } from 'zod';
import { aboutOutputBytecode, checkMerge, parseTree, planterTag, plantedCommitment, profileCommitment } from './forest';
import { GardenTransactionError, gardenIntent, gardenNetwork, intentSchema, resolvePrepared } from './index';

const bytecode = (pattern: RegExp) => z.string().regex(pattern);
const p2pkh = bytecode(/^76a914[0-9a-f]{40}88ac$/);
const policySchema = z.object({
  network: gardenNetwork.default('chipnet'),
  category: z.string().regex(/^[0-9a-f]{64}$/),
  /** P2SH32 locking bytecode of the pinned Focus Forest contract. */
  contractBytecode: bytecode(/^aa20[0-9a-f]{64}87$/),
  internalBytecode: p2pkh,
  /** The external wallet receiving trees (plant/claim/merge) or the tip recipient. */
  rewardBytecode: p2pkh.optional(),
  directoryCategory: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  directoryBytecode: bytecode(/^aa20[0-9a-f]{64}87$/).optional(),
  nowSeconds: z.number().int().positive(),
  requestedAtSeconds: z.number().int().positive().default(500000000),
});
const FEE = 2000n;
const DEPOSIT = 1000n;

/** Independent check of a prepared Focus Garden transaction before the app wallet signs it. */
export function validateRewardTransaction(prepared: Parameters<typeof resolvePrepared>[0], requested: z.input<typeof intentSchema>, config: z.input<typeof policySchema>) {
  const policy = policySchema.parse(config);
  const intent = gardenIntent(policy.network).parse(requested);
  const resolved = resolvePrepared(prepared, policy.network);
  const { transaction, sourceOutputs } = resolved;
  function require(condition: boolean, message: string): asserts condition {
    if (!condition) throw new GardenTransactionError({ message });
  }
  function token(output: (typeof sourceOutputs)[number], category: string, capability: 'none' | 'mutable' | 'minting', commitment: string) {
    require(output.token?.amount === 0n && binToHex(output.token.category) === category && output.token.nft?.capability === capability && binToHex(output.token.nft.commitment) === commitment, 'Unexpected token category, amount or commitment.');
  }
  const fundingIndex = transaction.inputs.length - 1;
  const funding = sourceOutputs[fundingIndex];
  require(transaction.version === 2, 'Unexpected transaction version.');
  require(!funding.token && binToHex(funding.lockingBytecode) === policy.internalBytecode, 'Funding must be plain BCH from this app wallet.');
  require(transaction.inputs[fundingIndex].sequenceNumber === 0xffffffff, 'Unexpected funding sequence.');
  const change = transaction.outputs.at(-1);
  require(Boolean(change) && !change!.token && binToHex(change!.lockingBytecode) === policy.internalBytecode, 'Change must return to this app wallet.');
  const fee = sourceOutputs.reduce((sum, output) => sum + output.valueSatoshis, 0n) - transaction.outputs.reduce((sum, output) => sum + output.valueSatoshis, 0n);
  require(fee === FEE, 'Fee exceeds or differs from the approved network fee.');

  if (intent.action === 'tip') {
    require(transaction.inputs.length === 1 && transaction.outputs.length === 2 && transaction.locktime === 0, 'Unexpected tip structure.');
    require(policy.rewardBytecode !== undefined && binToHex(transaction.outputs[0].lockingBytecode) === policy.rewardBytecode, 'The tip must go to the chosen person.');
    require(!transaction.outputs[0].token && transaction.outputs[0].valueSatoshis === BigInt(intent.amount), 'The tip amount differs from your request.');
    require(policy.rewardBytecode !== policy.internalBytecode, 'You cannot tip yourself.');
    return { ...resolved, commitment: '' };
  }

  if (intent.action === 'register') {
    require(policy.directoryBytecode !== undefined && policy.directoryCategory !== undefined, 'The Focus Directory is not configured.');
    require(transaction.inputs.length === 2 && (transaction.outputs.length === 3 || transaction.outputs.length === 4) && transaction.locktime === 0, 'Unexpected profile structure.');
    require(binToHex(sourceOutputs[0].lockingBytecode) === policy.directoryBytecode!, 'Unknown directory contract.');
    token(sourceOutputs[0], policy.directoryCategory!, 'minting', '');
    token(transaction.outputs[0], policy.directoryCategory!, 'minting', '');
    require(binToHex(transaction.outputs[0].lockingBytecode) === policy.directoryBytecode! && transaction.outputs[0].valueSatoshis === sourceOutputs[0].valueSatoshis, 'The directory must keep its minting baton.');
    const card = profileCommitment(intent.name);
    token(transaction.outputs[1], policy.directoryCategory!, 'none', card);
    require(binToHex(transaction.outputs[1].lockingBytecode) === policy.internalBytecode && transaction.outputs[1].valueSatoshis === DEPOSIT, 'Your profile card must stay in this app wallet.');
    if (transaction.outputs.length === 4) {
      require(intent.about.trim().length > 0 && binToHex(transaction.outputs[2].lockingBytecode) === aboutOutputBytecode(intent.about) && transaction.outputs[2].valueSatoshis === 0n, 'The "about me" text differs from your request.');
    } else require(intent.about.trim().length === 0, 'The "about me" text is missing.');
    return { ...resolved, commitment: card };
  }

  require(policy.rewardBytecode !== undefined && policy.internalBytecode !== policy.rewardBytecode, 'Rewards require a separate external wallet.');
  require(binToHex(sourceOutputs[0].lockingBytecode) === policy.contractBytecode, 'Unknown contract.');

  if (intent.action === 'plant') {
    require(transaction.inputs.length === 2 && transaction.outputs.length === 3 && transaction.inputs[0].sequenceNumber === 0xffffffff, 'Unexpected planting structure.');
    require(funding.valueSatoshis >= 8000n && change!.valueSatoshis >= 5000n, 'Planting must preserve release credit.');
    require(transaction.locktime >= policy.requestedAtSeconds - 300 && transaction.locktime <= policy.nowSeconds + 300, 'Stale planting time.');
    const commitment = plantedCommitment(policy.rewardBytecode!, policy.internalBytecode, transaction.locktime, intent.units, intent.tier, intent.species);
    token(sourceOutputs[0], policy.category, 'minting', '');
    token(transaction.outputs[0], policy.category, 'minting', '');
    token(transaction.outputs[1], policy.category, 'mutable', commitment);
    require(transaction.outputs[0].valueSatoshis === sourceOutputs[0].valueSatoshis && transaction.outputs[1].valueSatoshis === DEPOSIT, 'Unexpected baton or deposit value.');
    require(transaction.outputs.slice(0, 2).every((output) => binToHex(output.lockingBytecode) === policy.contractBytecode), 'Trees must be locked to the pinned contract.');
    return { ...resolved, commitment };
  }

  if (intent.action === 'claim') {
    const commitment = intent.commitment;
    const tree = parseTree(commitment)!;
    require(transaction.inputs.length === 2 && transaction.outputs.length === 2 && transaction.locktime === 0, 'Unexpected claim structure.');
    require(funding.valueSatoshis >= 4000n, 'Insufficient release funding.');
    require(tree.ownerBytecode === policy.rewardBytecode, 'Reward destination differs from planting.');
    require(tree.planterTag === planterTag(policy.internalBytecode), 'Only the app wallet that planted this tree can release it here.');
    require(transaction.inputs[0].sequenceNumber === 4194304 + tree.units, 'Incorrect time lock sequence.');
    token(sourceOutputs[0], policy.category, 'mutable', commitment);
    token(transaction.outputs[0], policy.category, 'none', commitment);
    require(binToHex(transaction.outputs[0].lockingBytecode) === tree.ownerBytecode, 'Reward destination differs from planting.');
    require(transaction.outputs[0].valueSatoshis === sourceOutputs[0].valueSatoshis, 'Reward deposit must be preserved.');
    return { ...resolved, commitment };
  }

  const checked = checkMerge(intent.commitments);
  require(checked !== null, 'These trees cannot be merged together.');
  const count = intent.commitments.length;
  const first = parseTree(intent.commitments[0])!;
  require(first.ownerBytecode === policy.rewardBytecode, 'Merged trees must keep their owner.');
  require(first.planterTag === planterTag(policy.internalBytecode), 'Only the app wallet that planted these trees can merge them.');
  require(transaction.inputs.length === count + 1 && transaction.outputs.length === 2 && transaction.locktime === 0, 'Unexpected merge structure.');
  require(funding.valueSatoshis >= 4000n, 'Insufficient merge funding.');
  intent.commitments.forEach((commitment, index) => {
    require(binToHex(sourceOutputs[index].lockingBytecode) === policy.contractBytecode, 'Merged trees must come from the pinned contract.');
    token(sourceOutputs[index], policy.category, 'mutable', commitment);
    require(transaction.inputs[index].sequenceNumber === 4194304 + parseTree(commitment)!.units, 'Incorrect time lock sequence.');
  });
  token(transaction.outputs[0], policy.category, 'mutable', checked.result);
  const deposits = sourceOutputs.slice(0, count).reduce((sum, output) => sum + output.valueSatoshis, 0n);
  require(binToHex(transaction.outputs[0].lockingBytecode) === policy.contractBytecode && transaction.outputs[0].valueSatoshis === deposits, 'The merged tree must stay in the contract with every deposit.');
  return { ...resolved, commitment: checked.result };
}
