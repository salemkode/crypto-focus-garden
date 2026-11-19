import { sha256 } from '@noble/hashes/sha2';
import { focusMinutes, treeName } from '@focus-garden/protocol/bcmr';
import { parseTree, speciesByCode, tierByCode, TREE_COMMITMENT, type ForestSpecies, type ForestTier } from '@focus-garden/protocol/forest';
import type { SpeciesId } from '../focus/catalog';

/**
 * Style algorithm version. A Focus Forest v5 NFT's look comes only from its immutable
 * commitment: the tier (earned by verified focus time) sets the model, the species sets
 * the style, and a hash of the whole commitment varies it, so every NFT is its own item.
 * Never change v1's output; add a new version instead.
 */
export const NFT_STYLE_VERSION = 1;

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
const RARITY: Record<ForestTier['key'], Rarity> = { sprout: 'common', tree: 'common', bigTree: 'rare', house: 'epic' };
/** Local catalogue ids for the same species (the 2D/3D renderers use these keys). */
const LOCAL: Record<ForestSpecies['key'], SpeciesId> = { oak: 'oak', cherry: 'cherry', pine: 'pine', maple: 'maple', birch: 'birch', cash: 'cashtree' };

export interface NftTree {
  /** Same name wallets show, from the published BCMR registry (packages/protocol/src/bcmr.ts). */
  name: string;
  tier: ForestTier;
  species: ForestSpecies;
  localSpecies: SpeciesId;
  merged: boolean;
  rarity: Rarity;
  /** Four hex characters from the style hash; shown as #abcd. */
  tag: string;
  /** Per-NFT seed for model variation. */
  seed: number;
  points: number;
  traits: { label: string; value: string }[];
  islandType: 'normal' | 'gold' | 'diamond';
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export function isRewardCommitment(commitment: string) {
  return TREE_COMMITMENT.test(commitment);
}

export function nftTree(commitment: string): NftTree {
  const parsed = parseTree(commitment.toLowerCase());
  if (!parsed) throw new Error('Not a Focus Forest v5 commitment.');
  const tier = tierByCode(parsed.tier)!;
  const species = speciesByCode(parsed.species)!;
  const bytes = sha256(hexToBytes(commitment.toLowerCase()));
  const rarity = RARITY[tier.key];
  return {
    // The app shows merging in its traits, so the name leaves out the registry's "(merged)".
    name: treeName(commitment.toLowerCase(), false)!,
    tier,
    species,
    localSpecies: LOCAL[species.key],
    merged: parsed.merged,
    rarity,
    tag: Array.from(bytes.slice(12, 14), (value) => value.toString(16).padStart(2, '0')).join(''),
    seed: ((bytes[14] << 8) | bytes[15]) + 1,
    points: tier.points,
    islandType: tier.key === 'house' ? 'diamond' : tier.key === 'bigTree' ? 'gold' : 'normal',
    traits: [
      { label: 'Size', value: tier.name },
      { label: 'Style', value: species.name },
      { label: 'Verified focus', value: parsed.merged ? `Merged · worth ${tier.points} focus units` : `${focusMinutes(parsed.units)} min lock` },
      { label: 'Rarity', value: rarity[0].toUpperCase() + rarity.slice(1) },
    ],
  };
}

/** A stand-in commitment used only to preview what a tier and species looks like. */
export function previewCommitment(tier: number, species: number, merged = true) {
  return `05${'00'.repeat(20)}${'00'.repeat(12)}00000000${merged ? '00' : '01'}${(tier * 16 + species).toString(16)}`;
}
