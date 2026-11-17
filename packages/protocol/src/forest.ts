import { binToHex, hash160, hash256, hexToBin, utf8ToBin, binToUtf8 } from '@bitauth/libauth';

/**
 * Focus Forest v5 rules, mirrored exactly from contracts/FocusForest.cash.
 * Commitment (39 bytes): 05 | owner pkh (20) | planter tag (12) | stamp (4, LE) | units (1) | look (1)
 * look = tier * 16 + species. More verified focus grows a bigger reward.
 */
import { UNIT_SECONDS, MAX_UNITS, FOREST_TIERS, FOREST_SPECIES, type ForestTier } from './rules';
export * from './rules';

export const TREE_COMMITMENT = /^05([0-9a-f]{40})([0-9a-f]{24})([0-9a-f]{8})([01][0-9a-f])([1-4][1-6])$/;

export const tierByCode = (code: number) => FOREST_TIERS.find((entry) => entry.code === code);
export const speciesByCode = (code: number) => FOREST_SPECIES.find((entry) => entry.code === code);
export const tierByKey = (key: ForestTier['key']) => FOREST_TIERS.find((entry) => entry.key === key)!;

/** The biggest reward a lock of `units` earns. */
export function tierForUnits(units: number) {
  return [...FOREST_TIERS].reverse().find((entry) => units >= entry.minUnits) ?? null;
}
export function canPlant(tier: number, units: number, species: number) {
  const entry = tierByCode(tier);
  return Boolean(entry && speciesByCode(species)) && Number.isInteger(units) && units >= entry!.minUnits && units <= MAX_UNITS;
}

const byteHex = (value: number) => value.toString(16).padStart(2, '0');
function littleEndian32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return binToHex(bytes);
}

/** First 12 bytes of hash160(app-wallet locking bytecode); identifies who may merge. */
export function planterTag(lockingBytecodeHex: string) {
  return binToHex(hash160(hexToBin(lockingBytecodeHex)).slice(0, 12));
}

export function parseTree(commitment: string) {
  const match = TREE_COMMITMENT.exec(commitment);
  if (!match) return null;
  const units = parseInt(match[4], 16);
  if (units > MAX_UNITS) return null;
  const look = parseInt(match[5], 16);
  const tier = tierByCode(look >> 4)!;
  const stampBytes = hexToBin(match[3]);
  return {
    ownerPkh: match[1],
    ownerBytecode: `76a914${match[1]}88ac`,
    planterTag: match[2],
    stamp: new DataView(stampBytes.buffer, stampBytes.byteOffset, 4).getUint32(0, true),
    units,
    tier: tier.code,
    tierKey: tier.key,
    species: look & 15,
    speciesKey: speciesByCode(look & 15)!.key,
    merged: units === 0,
    points: tier.points,
  };
}

export function plantedCommitment(ownerBytecode: string, planterBytecode: string, plantedAt: number, units: number, tier: number, species: number) {
  if (!/^76a914[0-9a-f]{40}88ac$/.test(ownerBytecode) || !canPlant(tier, units, species)) throw new Error('This reward needs a longer focus lock.');
  return `05${ownerBytecode.slice(6, 46)}${planterTag(planterBytecode)}${littleEndian32(plantedAt)}${byteHex(units)}${byteHex(tier * 16 + species)}`;
}

/** Same owner and planter as the ingredients; one tier up; first ingredient's style; lineage stamp. */
export function mergedCommitment(ingredients: readonly string[]) {
  const first = parseTree(ingredients[0])!;
  const lineage = binToHex(hash256(hexToBin(ingredients.join(''))).slice(0, 4));
  return `${ingredients[0].slice(0, 66)}${lineage}00${byteHex((first.tier + 1) * 16 + first.species)}`;
}

/** Checks a merge before anything is signed: count, tier, ownership and planter. */
export function checkMerge(ingredients: readonly string[]) {
  const trees = ingredients.map(parseTree);
  if (trees.length === 0 || trees.some((tree) => !tree)) return null;
  const tier = tierByCode(trees[0]!.tier)!;
  if (!tier.mergeCount || ingredients.length !== tier.mergeCount) return null;
  const head = ingredients[0].slice(0, 66);
  if (ingredients.some((entry) => entry.slice(0, 66) !== head) || trees.some((tree) => tree!.tier !== tier.code)) return null;
  if (new Set(ingredients).size !== ingredients.length) return null;
  return { tier, result: mergedCommitment(ingredients), resultTier: tierByCode(tier.code + 1)! };
}

// ---- Focus Directory (contracts/FocusDirectory.cash) ----
export const PROFILE_NAME_BYTES = { min: 3, max: 32 } as const;
export const ABOUT_MAX_BYTES = 140;
export const ABOUT_PREFIX = '46475031'; // "FGP1"

export function profileCommitment(name: string) {
  const bytes = utf8ToBin(name.trim());
  if (bytes.length < PROFILE_NAME_BYTES.min || bytes.length > PROFILE_NAME_BYTES.max) throw new Error('Choose a name of 3 to 32 bytes.');
  return `01${binToHex(bytes)}`;
}
export function parseProfile(commitment: string) {
  if (!/^01([0-9a-f]{2}){3,32}$/.test(commitment)) return null;
  return { name: binToUtf8(hexToBin(commitment.slice(2))) };
}
/** OP_RETURN with the "about me" text: OP_RETURN <FGP1> <utf8>. */
export function aboutOutputBytecode(about: string) {
  const text = utf8ToBin(about.trim());
  if (text.length > ABOUT_MAX_BYTES) throw new Error('Keep "about me" under 140 bytes.');
  const push = text.length < 76 ? byteHex(text.length) : `4c${byteHex(text.length)}`;
  return `6a04${ABOUT_PREFIX}${push}${binToHex(text)}`;
}
