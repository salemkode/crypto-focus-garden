import { z } from 'zod';
import type { ChainCoin, ChainReader } from './chain';
import { parseTree, planterTag, TREE_COMMITMENT, UNIT_SECONDS } from './forest';
import { NETWORKS, type Deployment } from './network';

/**
 * A user's garden, read straight from the chain: trees their app wallet planted that still wait in
 * the Focus Forest contract, and trees already released to their linked wallet.
 */
const session = z.object({
  commitment: z.string().regex(TREE_COMMITMENT),
  plantedAt: z.number().int().positive(),
  releaseAt: z.number().int().positive(),
  duration: z.number().int().nonnegative().max(24 * 512).refine((seconds) => seconds % 512 === 0),
  confirmations: z.number().int().nonnegative().default(0),
  claimedAt: z.number().int().positive().nullable().default(null),
  plantTxid: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
  claimTxid: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
  state: z.enum(['confirming', 'locked', 'claimable', 'claimed', 'claiming', 'merging', 'transferred']),
});
export const gardenSchema = z.object({
  network: z.enum(NETWORKS),
  minimumConfirmations: z.number().int().min(1).max(144).default(1),
  /** Plain BCH in the app wallet, which pays every network fee and tree deposit. */
  balanceSatoshis: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sessions: z.array(session),
}).superRefine((garden, context) => {
  if (new Set(garden.sessions.map((entry) => entry.commitment.toLowerCase())).size !== garden.sessions.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate reward history must not create extra trees.' });
  }
  garden.sessions.forEach((entry, index) => {
    if (entry.releaseAt < entry.plantedAt + entry.duration * 1000) {
      context.addIssue({ code: 'custom', path: ['sessions', index, 'releaseAt'], message: 'Release estimate cannot bypass the relative time lock.' });
    }
  });
});
export type Garden = z.infer<typeof gardenSchema>;
export type GardenSession = Garden['sessions'][number];

export interface ReadGardenInput {
  chain: Pick<ChainReader, 'listUnspent' | 'tipHeight' | 'medianTimePast'>;
  deployment: Deployment;
  /** Locking bytecode (hex) of the app wallet that plants and pays. */
  appLockingBytecode: string;
  /** Locking bytecodes (hex) of wallets that receive released trees (the linked wallet). */
  ownerLockingBytecodes: readonly string[];
  nowMs: number;
  minimumConfirmations?: number;
}

const treeOf = (coin: ChainCoin, category: string, capability: 'mutable' | 'none') =>
  coin.token?.category === category && coin.token.amount === 0n && coin.token.nft?.capability === capability ? parseTree(coin.token.nft.commitment) : null;

export async function readGarden(input: ReadGardenInput): Promise<Garden> {
  const { chain, deployment, nowMs } = input;
  const minimum = input.minimumConfirmations ?? 1;
  const tag = planterTag(input.appLockingBytecode);
  const category = deployment.forest.category;
  const owners = [...new Set(input.ownerLockingBytecodes.map((entry) => entry.toLowerCase()))].filter((entry) => entry !== input.appLockingBytecode);
  const [tip, forestCoins, walletCoins, ...ownerCoins] = await Promise.all([
    chain.tipHeight(),
    chain.listUnspent(deployment.forest.lockingBytecode),
    chain.listUnspent(input.appLockingBytecode),
    ...owners.map((owner) => chain.listUnspent(owner)),
  ]);
  const tipTime = await chain.medianTimePast(tip);
  const sessions: GardenSession[] = [];
  const seen = new Set<string>();
  const confirmationsOf = (coin: ChainCoin) => (coin.height > 0 ? tip - coin.height + 1 : 0);

  for (const coin of forestCoins) {
    const tree = treeOf(coin, category, 'mutable');
    const commitment = coin.token?.nft?.commitment ?? '';
    if (!tree || tree.planterTag !== tag || seen.has(commitment)) continue;
    seen.add(commitment);
    const duration = tree.units * UNIT_SECONDS;
    if (coin.height <= 0) {
      const plantedAt = tree.merged ? nowMs : tree.stamp * 1000;
      sessions.push({ commitment, plantedAt, releaseAt: plantedAt + duration * 1000, duration, confirmations: 0, claimedAt: null, plantTxid: coin.txid, claimTxid: null, state: tree.merged ? 'merging' : 'confirming' });
      continue;
    }
    // The contract's lock counts from the median time past of the block before the one that
    // confirmed the tree (BIP68), so that is what decides when it may leave.
    const origin = await chain.medianTimePast(coin.height - 1);
    const plantedAt = tree.merged ? origin * 1000 : tree.stamp * 1000;
    const remaining = Math.max(0, origin + duration - tipTime);
    const releaseAt = Math.max(plantedAt + duration * 1000, nowMs + remaining * 1000);
    sessions.push({ commitment, plantedAt, releaseAt, duration, confirmations: confirmationsOf(coin), claimedAt: null, plantTxid: coin.txid, claimTxid: null, state: remaining === 0 ? 'claimable' : 'locked' });
  }

  for (const coin of ownerCoins.flat()) {
    const tree = treeOf(coin, category, 'none');
    const commitment = coin.token?.nft?.commitment ?? '';
    if (!tree || tree.planterTag !== tag || seen.has(commitment)) continue;
    seen.add(commitment);
    const duration = tree.units * UNIT_SECONDS;
    const confirmations = confirmationsOf(coin);
    const at = coin.height > 0 ? await chain.medianTimePast(coin.height) * 1000 : nowMs;
    const plantedAt = tree.merged ? at : tree.stamp * 1000;
    sessions.push({ commitment, plantedAt, releaseAt: plantedAt + duration * 1000, duration, confirmations, claimedAt: confirmations >= minimum ? at : null, plantTxid: null, claimTxid: coin.txid, state: confirmations >= minimum ? 'claimed' : 'claiming' });
  }

  const balance = walletCoins.filter((coin) => !coin.token).reduce((sum, coin) => sum + coin.satoshis, 0n);
  return gardenSchema.parse({ network: deployment.network, minimumConfirmations: minimum, balanceSatoshis: Number(balance), sessions });
}
