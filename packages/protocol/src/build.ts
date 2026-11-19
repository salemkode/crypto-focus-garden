import { binToHex, cashAddressToLockingBytecode, hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { Contract, TransactionBuilder, placeholderP2PKHUnlocker, type NetworkProvider } from 'cashscript';
import { z } from 'zod';
import forestArtifact from '../../contracts/artifacts/FocusForest.artifact';
import directoryArtifact from '../../contracts/artifacts/FocusDirectory.artifact';
import type { ChainCoin, ChainReader } from './chain';
import { aboutOutputBytecode, checkMerge, parseTree, planterTag, plantedCommitment, profileCommitment } from './forest';
import { GardenTransactionError, intentSchema, preparedSchema } from './index';
import type { Deployment, NetworkName } from './network';

/**
 * Builds every Focus Garden transaction on the device, straight from the chain. The app wallet
 * pays the fee from one plain-BCH coin, which is always the last input. Nothing here signs: the
 * result is checked by `validateRewardTransaction` and then signed by the app wallet.
 */
export const NETWORK_FEE = 2000n;
export const TREE_DEPOSIT = 1000n;

/** The smallest app-wallet coin each action needs (the policy keeps change for the release). */
export function fundingNeeded(intent: z.input<typeof intentSchema>) {
  return intent.action === 'plant' ? 8000n : intent.action === 'tip' ? BigInt(intent.amount) + NETWORK_FEE + 546n : 4000n;
}

// Contracts only need a provider for their own lookups, which we never use: the chain reader does.
function offline(network: NetworkName): NetworkProvider {
  const refuse = () => Promise.reject(new GardenTransactionError({ message: 'Unexpected network use while building.' }));
  return { network: network as NetworkProvider['network'], getUtxos: refuse, getBlockHeight: refuse, getRawTransaction: refuse, sendRawTransaction: refuse };
}
export function forestContract(deployment: Deployment) {
  const contract = new Contract(forestArtifact, [hexToBin(deployment.forest.category).reverse()], { provider: offline(deployment.network), addressType: 'p2sh32' });
  if (binToHex(cashAddressBytecode(contract.address)) !== deployment.forest.lockingBytecode) {
    throw new GardenTransactionError({ message: 'This app build does not match the deployed Focus Forest contract.' });
  }
  return contract;
}
export function directoryContract(deployment: Deployment) {
  if (!deployment.directory) throw new GardenTransactionError({ message: 'The Focus Directory is not deployed on this network.' });
  const contract = new Contract(directoryArtifact, [hexToBin(deployment.directory.category).reverse()], { provider: offline(deployment.network), addressType: 'p2sh32' });
  if (binToHex(cashAddressBytecode(contract.address)) !== deployment.directory.lockingBytecode) {
    throw new GardenTransactionError({ message: 'This app build does not match the deployed Focus Directory contract.' });
  }
  return contract;
}

function cashAddressBytecode(address: string) {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new GardenTransactionError({ message: decoded });
  return decoded.bytecode;
}
/** P2PKH locking bytecode (hex) of an address on this deployment's network. */
export function p2pkhBytecode(address: string, deployment: Deployment) {
  const decoded = cashAddressToLockingBytecode(address);
  const hex = typeof decoded === 'string' ? '' : binToHex(decoded.bytecode);
  if (!address.toLowerCase().startsWith(`${deployment.prefix}:`) || !/^76a914[0-9a-f]{40}88ac$/.test(hex)) {
    throw new GardenTransactionError({ message: `Use a ${deployment.prefix}: wallet address.` });
  }
  return hex;
}
export function addressOf(lockingBytecode: string, deployment: Deployment, tokenSupport = false) {
  const result = lockingBytecodeToCashAddress({ bytecode: hexToBin(lockingBytecode), prefix: deployment.prefix, tokenSupport });
  if (typeof result === 'string') throw new GardenTransactionError({ message: result });
  return result.address;
}

const outpoint = (coin: { txid: string; vout: number }) => `${coin.txid}:${coin.vout}`;
const isPlain = (coin: ChainCoin) => !coin.token;

export interface BuildInput {
  intent: z.input<typeof intentSchema>;
  /** The app wallet's address: it pays the fee and receives the change. */
  wallet: string;
  deployment: Deployment;
  chain: Pick<ChainReader, 'listUnspent' | 'rawTransaction'>;
  nowSeconds: number;
  /** Coins an unresolved earlier transaction may still spend; never reused. */
  exclude?: ReadonlySet<string>;
  id?: string;
}

export async function buildRewardTransaction(input: BuildInput) {
  const intent = intentSchema.parse(input.intent);
  const { deployment, chain } = input;
  const exclude = input.exclude ?? new Set<string>();
  const internal = p2pkhBytecode(input.wallet, deployment);
  const needed = fundingNeeded(intent);
  const funding = (await chain.listUnspent(internal))
    .filter((coin) => isPlain(coin) && coin.satoshis >= needed && !exclude.has(outpoint(coin)))
    // Prefer confirmed coins, then the smallest one that covers the action.
    .sort((a, b) => Number(b.height > 0) - Number(a.height > 0) || (a.satoshis < b.satoshis ? -1 : a.satoshis > b.satoshis ? 1 : 0))[0];
  if (!funding) {
    throw new GardenTransactionError({ message: `Your Focus Garden wallet needs one coin of at least ${needed.toLocaleString()} sats for this. Add BCH to it first.` });
  }
  const builder = new TransactionBuilder({ provider: offline(deployment.network) });
  const spent: ChainCoin[] = [];
  let commitment = '';

  if (intent.action === 'tip') {
    const recipient = p2pkhBytecode(intent.recipient, deployment);
    if (recipient === internal) throw new GardenTransactionError({ message: 'You cannot tip yourself.' });
    builder.setLocktime(0).addInput(funding, placeholderP2PKHUnlocker(input.wallet), { sequence: 0xffffffff })
      .addOutput({ to: intent.recipient, amount: BigInt(intent.amount) })
      .addOutput({ to: input.wallet, amount: funding.satoshis - BigInt(intent.amount) - NETWORK_FEE });
    spent.push(funding);
  } else if (intent.action === 'register') {
    const directory = directoryContract(deployment);
    const category = deployment.directory!.category;
    const baton = (await chain.listUnspent(deployment.directory!.lockingBytecode))
      .find((coin) => coin.token?.category === category && coin.token.nft?.capability === 'minting' && coin.token.nft.commitment === '' && !exclude.has(outpoint(coin)));
    if (!baton) throw new GardenTransactionError({ message: 'The Focus Directory is busy. Try again in a minute.' });
    commitment = profileCommitment(intent.name);
    builder.setLocktime(0)
      .addInput(baton, directory.unlock.register!(hexToBin(internal).slice(3, 23), hexToBin(commitment.slice(2))), { sequence: 0xffffffff })
      .addInput(funding, placeholderP2PKHUnlocker(input.wallet), { sequence: 0xffffffff })
      .addOutput({ to: directory.tokenAddress, amount: baton.satoshis, token: baton.token! })
      .addOutput({ to: addressOf(internal, deployment, true), amount: TREE_DEPOSIT, token: { category, amount: 0n, nft: { capability: 'none', commitment } } });
    if (intent.about.trim()) builder.addOpReturnOutput(['0x' + aboutOutputBytecode(intent.about).slice(4, 12), intent.about.trim()]);
    builder.addOutput({ to: input.wallet, amount: funding.satoshis - NETWORK_FEE - TREE_DEPOSIT });
    spent.push(baton, funding);
  } else {
    const contract = forestContract(deployment);
    const category = deployment.forest.category;
    const coins = await chain.listUnspent(deployment.forest.lockingBytecode);
    const lockedTree = (wanted: string) => coins.find((coin) => coin.token?.category === category && coin.token.amount === 0n
      && coin.token.nft?.capability === 'mutable' && coin.token.nft.commitment === wanted && coin.height > 0 && !exclude.has(outpoint(coin)));

    if (intent.action === 'plant') {
      const reward = p2pkhBytecode(intent.rewardAddress, deployment);
      if (reward === internal) throw new GardenTransactionError({ message: 'Use a separate wallet for rewards, not the Focus Garden wallet.' });
      const baton = coins.find((coin) => coin.token?.category === category && coin.token.amount === 0n && coin.token.nft?.capability === 'minting' && coin.token.nft.commitment === '' && !exclude.has(outpoint(coin)));
      if (!baton) throw new GardenTransactionError({ message: 'The Focus Forest is busy. Try again in a minute.' });
      // A commitment names one session, so an identical planting in the same second takes the next free second.
      const taken = new Set(coins.map((coin) => coin.token?.nft?.commitment));
      let plantedAt = input.nowSeconds;
      commitment = plantedCommitment(reward, internal, plantedAt, intent.units, intent.tier, intent.species);
      while (taken.has(commitment)) {
        plantedAt += 1;
        if (plantedAt > input.nowSeconds + 120) throw new GardenTransactionError({ message: 'Too many identical plantings right now. Try again in a minute.' });
        commitment = plantedCommitment(reward, internal, plantedAt, intent.units, intent.tier, intent.species);
      }
      builder.setLocktime(plantedAt)
        .addInput(baton, contract.unlock.plantTree!(BigInt(plantedAt), BigInt(intent.units), BigInt(intent.tier), BigInt(intent.species), hexToBin(reward).slice(3, 23)), { sequence: 0xffffffff })
        .addInput(funding, placeholderP2PKHUnlocker(input.wallet), { sequence: 0xffffffff })
        .addOutput({ to: contract.tokenAddress, amount: baton.satoshis, token: baton.token! })
        .addOutput({ to: contract.tokenAddress, amount: TREE_DEPOSIT, token: { category, amount: 0n, nft: { capability: 'mutable', commitment } } })
        .addOutput({ to: input.wallet, amount: funding.satoshis - NETWORK_FEE - TREE_DEPOSIT });
      spent.push(baton, funding);
    } else if (intent.action === 'claim') {
      const locked = lockedTree(intent.commitment);
      if (!locked) throw new GardenTransactionError({ message: 'This tree is not waiting in the Focus Forest contract.' });
      const tree = parseTree(intent.commitment)!;
      // The contract releases a tree only to a transaction signed by its owner or its planting app wallet.
      if (tree.planterTag !== planterTag(internal)) throw new GardenTransactionError({ message: 'Only the Focus Garden wallet that planted this tree can send it.' });
      commitment = intent.commitment;
      builder.setLocktime(0).addInput(locked, contract.unlock.claimTree!(), { sequence: 4194304 + tree.units })
        .addInput(funding, placeholderP2PKHUnlocker(input.wallet), { sequence: 0xffffffff })
        .addOutput({ to: addressOf(tree.ownerBytecode, deployment, true), amount: locked.satoshis, token: { category, amount: 0n, nft: { capability: 'none', commitment } } })
        .addOutput({ to: input.wallet, amount: funding.satoshis - NETWORK_FEE });
      spent.push(locked, funding);
    } else {
      const checked = checkMerge(intent.commitments);
      if (!checked) throw new GardenTransactionError({ message: 'These trees cannot be merged together.' });
      if (taken(coins, checked.result)) throw new GardenTransactionError({ message: 'Choose a different set of trees to merge.' });
      const trees = intent.commitments.map(lockedTree);
      if (trees.some((coin) => !coin)) throw new GardenTransactionError({ message: 'Every tree in this merge must be waiting in the contract.' });
      const inputs = trees as ChainCoin[];
      builder.setLocktime(0);
      inputs.forEach((coin, index) => builder.addInput(coin, contract.unlock.mergeTrees!(), { sequence: 4194304 + parseTree(intent.commitments[index]!)!.units }));
      const deposits = inputs.reduce((sum, coin) => sum + coin.satoshis, 0n);
      commitment = checked.result;
      builder.addInput(funding, placeholderP2PKHUnlocker(input.wallet), { sequence: 0xffffffff })
        // The merged tree keeps every ingredient's deposit; the app wallet pays only the fee.
        .addOutput({ to: contract.tokenAddress, amount: deposits, token: { category, amount: 0n, nft: { capability: 'mutable', commitment } } })
        .addOutput({ to: input.wallet, amount: funding.satoshis - NETWORK_FEE });
      spent.push(...inputs, funding);
    }
  }

  const prepared = preparedSchema.parse({
    id: input.id ?? crypto.randomUUID(),
    network: deployment.network,
    transaction: builder.build(),
    sourceTransactions: await Promise.all(spent.map((coin) => chain.rawTransaction(coin.txid))),
  });
  return { prepared, intent, commitment, spends: spent.map(outpoint) };
}

function taken(coins: ChainCoin[], commitment: string) {
  return coins.some((coin) => coin.token?.nft?.commitment === commitment);
}
