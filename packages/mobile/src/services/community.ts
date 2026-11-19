import { z } from 'zod';
import { useSyncExternalStore } from 'react';
import { GardenTransactionError } from '@focus-garden/protocol';
import { planterTag } from '@focus-garden/protocol/forest';
import { rankLeaders, scanForest, type ChainTransaction, type ForestScan, type LeaderEntry } from '@focus-garden/protocol/leaderboard';
import { parseRewardAddress } from '../wallet/address';
import { chain } from './chain';
import { DEPLOYMENT } from './network';
import { savedOperation } from './transactions';

export type { LeaderEntry };

/**
 * The leaderboard and profiles, computed on the phone from the Focus Forest and Focus Directory
 * contracts' histories. Opt-in profiles only; see @focus-garden/protocol/leaderboard.
 */
let scanned: { at: number; scan: ForestScan } | null = null;
let scanning: Promise<ForestScan> | null = null;
const FRESH_MS = 30_000;

async function scan(force = false) {
  if (!force && scanned && Date.now() - scanned.at < FRESH_MS) return scanned.scan;
  scanning ??= (async () => {
    const contracts = [DEPLOYMENT.forest, ...(DEPLOYMENT.directory ? [DEPLOYMENT.directory] : [])];
    const histories = await Promise.all(contracts.map((entry) => chain.history(entry.lockingBytecode)));
    const ordered = [...new Map(histories.flat().filter((entry) => entry.height > 0).map((entry) => [entry.txid, entry])).values()]
      .sort((a, b) => a.height - b.height);
    const transactions: ChainTransaction[] = [];
    // Small batches keep a public server happy; confirmed transactions are cached after the first read.
    for (let index = 0; index < ordered.length; index += 8) {
      const batch = ordered.slice(index, index + 8);
      transactions.push(...await Promise.all(batch.map(async (entry) => ({ ...entry, raw: await chain.rawTransaction(entry.txid) }))));
    }
    const result = scanForest(transactions, { category: DEPLOYMENT.forest.category, lockingBytecode: DEPLOYMENT.forest.lockingBytecode }, DEPLOYMENT.directory ? { category: DEPLOYMENT.directory.category, lockingBytecode: DEPLOYMENT.directory.lockingBytecode } : null);
    scanned = { at: Date.now(), scan: result };
    return result;
  })().finally(() => { scanning = null; });
  return scanning;
}

/** Verified focus leaderboard (opt-in profiles only), straight from the chain. */
export async function fetchLeaderboard(period: 'week' | 'all') {
  return { period, entries: rankLeaders(await scan(true), period, Math.floor(Date.now() / 1000), DEPLOYMENT.prefix) };
}

/**
 * Every wallet this app wallet has planted trees for, from the Focus Forest's history. Trees released
 * to a wallet linked earlier stay in the garden after the user links another one.
 */
export async function rewardOwners(wallet: string) {
  const id = planterTag(parseRewardAddress(wallet).lockingBytecode);
  return [...new Set((await scan()).plantings.filter((entry) => entry.planterTag === id).map((entry) => entry.ownerBytecode))];
}

/**
 * The leaderboard shows a name only for its first holder, so joining under a name someone else holds
 * would cost the fee and deposit and still leave the user off the board. Checked before signing.
 */
export async function assertNameAvailable(wallet: string, name: string) {
  const holder = parseRewardAddress(wallet).lockingBytecode;
  const key = name.trim().toLowerCase();
  for (const profile of (await scan(true)).profiles.values()) {
    if (profile.name.trim().toLowerCase() === key && profile.holder !== holder) {
      throw new GardenTransactionError({ message: `Someone already uses the name ${name.trim()}. Choose another name. Nothing was sent.` });
    }
  }
}

const profileSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }),
  z.object({ state: z.enum(['pending', 'public']), name: z.string(), about: z.string(), id: z.string() }),
]);
/** This app wallet's leaderboard profile: its Focus Directory card, or the one being registered. */
export async function fetchProfile(wallet: string): Promise<z.infer<typeof profileSchema>> {
  const id = planterTag(parseRewardAddress(wallet).lockingBytecode);
  const card = (await scan()).profiles.get(id);
  if (card) return profileSchema.parse({ state: 'public', name: card.name, about: card.about, id });
  const saved = savedOperation();
  if (saved?.intent.action === 'register' && saved.wallet === wallet) return { state: 'pending', name: saved.intent.name, about: saved.intent.about, id };
  return { state: 'none' };
}

// The member the user tapped, handed to the member sheet without putting data in the URL.
let selected: LeaderEntry | null = null;
const listeners = new Set<() => void>();
export function selectMember(entry: LeaderEntry) {
  selected = entry;
  listeners.forEach((listener) => listener());
}
export function useSelectedMember() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => selected);
}
