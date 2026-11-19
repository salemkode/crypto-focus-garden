import { binToHex, cashAddressToLockingBytecode, decodeTransaction, sha256, hexToBin, lockingBytecodeToCashAddress, type TransactionCommon } from '@bitauth/libauth';
import { ABOUT_PREFIX, parseProfile, parseTree, planterTag } from './forest';

/**
 * The verified-focus leaderboard, computed from the chain alone (no garden service).
 *
 * Every planting spends the Focus Forest minting baton and creates a locked tree at the
 * contract; every profile card spends the Focus Directory baton. So the two contract
 * addresses' histories hold the whole game. Rules match packages/service/src/api.ts:
 * opt-in members only, a planted tree scores its tier's points, merges add nothing.
 */

export interface ContractRef {
  /** Token category, hex as shown by explorers. */
  category: string;
  /** The contract's locking bytecode, hex. */
  lockingBytecode: string;
}

export interface ChainTransaction {
  txid: string;
  /** Block height; 0 or less while unconfirmed. */
  height: number;
  /** Raw transaction, hex. */
  raw: string;
}

export interface LeaderEntry {
  rank: number;
  /** Planter tag of the member's app wallet. */
  id: string;
  name: string;
  about: string;
  points: number;
  trees: number;
  bestTier: number;
  tipAddress: string | null;
}

export type LeaderPeriod = 'week' | 'all';
export const WEEK_SECONDS = 7 * 24 * 60 * 60;
export const LEADERBOARD_SIZE = 100;

interface Planting { commitment: string; planterTag: string; ownerBytecode: string; stamp: number; points: number; tier: number }
interface Profile { holder: string; name: string; about: string }

export interface ForestScan {
  plantings: Planting[];
  /** Keyed by the holder's planter tag. */
  profiles: Map<string, Profile>;
}

const decode = (raw: string): TransactionCommon | null => {
  const decoded = decodeTransaction(hexToBin(raw));
  return typeof decoded === 'string' ? null : decoded;
};

const returnsBaton = (transaction: TransactionCommon, contract: ContractRef) =>
  transaction.outputs.some((output) => binToHex(output.lockingBytecode) === contract.lockingBytecode
    && output.token?.nft?.capability === 'minting' && binToHex(output.token.category) === contract.category);

/** Reads the "about me" text from an `OP_RETURN <FGP1> <utf8>` output. */
export function parseAbout(lockingBytecode: string) {
  const prefix = `6a04${ABOUT_PREFIX}`;
  if (!lockingBytecode.startsWith(prefix)) return '';
  let rest = lockingBytecode.slice(prefix.length);
  let length = parseInt(rest.slice(0, 2), 16);
  rest = rest.slice(2);
  if (length === 0x4c) { length = parseInt(rest.slice(0, 2), 16); rest = rest.slice(2); }
  if (!(length > 0) || rest.length !== length * 2) return '';
  try { return new TextDecoder('utf-8', { fatal: true }).decode(hexToBin(rest)); } catch { return ''; }
}

/**
 * Collects plantings and profile cards from the contracts' transactions.
 * Unconfirmed transactions are ignored; `transactions` must be in chain order.
 */
export function scanForest(transactions: readonly ChainTransaction[], forest: ContractRef, directory: ContractRef | null): ForestScan {
  const plantings: Planting[] = [];
  const counted = new Set<string>();
  const profiles = new Map<string, Profile>();
  const takenNames = new Map<string, string>(); // lower-case name -> holder
  const seen = new Set<string>();

  for (const entry of transactions) {
    if (entry.height <= 0 || seen.has(entry.txid)) continue;
    seen.add(entry.txid);
    const transaction = decode(entry.raw);
    if (!transaction) continue;

    if (returnsBaton(transaction, forest)) {
      for (const output of transaction.outputs) {
        const nft = output.token?.nft;
        if (!nft || nft.capability !== 'mutable' || binToHex(output.token!.category) !== forest.category) continue;
        if (binToHex(output.lockingBytecode) !== forest.lockingBytecode) continue;
        const commitment = binToHex(nft.commitment);
        const tree = parseTree(commitment);
        // Merged trees carry 0 units: they move points around but never add any.
        if (!tree || tree.merged || counted.has(commitment)) continue;
        counted.add(commitment);
        plantings.push({ commitment, planterTag: tree.planterTag, ownerBytecode: tree.ownerBytecode, stamp: tree.stamp, points: tree.points, tier: tree.tier });
      }
    }

    if (directory && returnsBaton(transaction, directory)) {
      const card = transaction.outputs.find((output) => output.token?.nft?.capability === 'none' && binToHex(output.token.category) === directory.category);
      const profile = card ? parseProfile(binToHex(card.token!.nft!.commitment)) : null;
      if (!card || !profile) continue;
      const holder = binToHex(card.lockingBytecode);
      const key = profile.name.trim().toLowerCase();
      // First come, first served: a name already held by someone else is not shown.
      if (takenNames.has(key) && takenNames.get(key) !== holder) continue;
      const tag = planterTag(holder);
      const previous = profiles.get(tag);
      if (previous) takenNames.delete(previous.name.trim().toLowerCase());
      takenNames.set(key, holder);
      const about = transaction.outputs.map((output) => parseAbout(binToHex(output.lockingBytecode))).find(Boolean) ?? '';
      profiles.set(tag, { holder, name: profile.name, about });
    }
  }
  return { plantings, profiles };
}

/** Ranks members by verified focus for one period. */
export function rankLeaders(scan: ForestScan, period: LeaderPeriod, nowSeconds = Math.floor(Date.now() / 1000), network: 'bchtest' | 'bitcoincash' = 'bchtest'): LeaderEntry[] {
  const since = period === 'week' ? nowSeconds - WEEK_SECONDS : 0;
  const latestOwner = new Map<string, { stamp: number; ownerBytecode: string }>();
  for (const planting of scan.plantings) {
    const latest = latestOwner.get(planting.planterTag);
    if (!latest || planting.stamp >= latest.stamp) latestOwner.set(planting.planterTag, planting);
  }
  const entries = [...scan.profiles].map(([id, profile]) => {
    const trees = scan.plantings.filter((planting) => planting.planterTag === id && planting.stamp >= since);
    const owner = latestOwner.get(id)?.ownerBytecode;
    const tip = owner ? lockingBytecodeToCashAddress({ bytecode: hexToBin(owner), prefix: network }) : null;
    return {
      id,
      name: profile.name,
      about: profile.about,
      points: trees.reduce((sum, tree) => sum + tree.points, 0),
      trees: trees.length,
      bestTier: trees.reduce((best, tree) => Math.max(best, tree.tier), 0),
      tipAddress: tip && typeof tip !== 'string' ? tip.address : null,
    };
  }).filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || b.trees - a.trees || a.name.localeCompare(b.name));
  return entries.slice(0, LEADERBOARD_SIZE).map((entry, index) => ({ rank: index + 1, ...entry }));
}

/** A contract reference from its deployment record (category and cash address). */
export function contractFromAddress(category: string, address: string): ContractRef {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new Error(`Bad contract address: ${decoded}`);
  return { category, lockingBytecode: binToHex(decoded.bytecode) };
}

/** Electrum's script hash for a locking bytecode: sha256, byte-reversed, hex. */
export function electrumScriptHash(lockingBytecode: string) {
  return binToHex(sha256.hash(hexToBin(lockingBytecode)).reverse());
}
