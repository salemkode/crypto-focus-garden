import { expect, test } from 'bun:test';
import { aboutOutputBytecode, canPlant, checkMerge, FOREST_TIERS, mergedCommitment, parseProfile, parseTree, planterTag, plantedCommitment, profileCommitment, tierForUnits } from '@focus-garden/protocol/forest';
import { isRewardCommitment, nftTree, previewCommitment } from '../src/features/forest/nft-style';
import { sampleLeaderboard, sampleRewardSessions } from '../src/features/forest/samples';
import { forestTrees, gardenSchema, mergeableTrees } from '../src/services/garden';

const owner = `76a914${'5f'.repeat(20)}88ac`;
const planter = `76a914${'3c'.repeat(20)}88ac`;
const plant = (tier: number, units: number, species: number, at: number) => plantedCommitment(owner, planter, at, units, tier, species);

test('more verified focus earns a bigger reward', () => {
  expect(FOREST_TIERS.map((tier) => [tier.key, tier.minUnits, tier.points])).toEqual([['sprout', 1, 1], ['tree', 3, 3], ['bigTree', 6, 6], ['house', 11, 12]]);
  expect(canPlant(1, 1, 1)).toBe(true);
  expect(canPlant(2, 2, 1)).toBe(false);
  expect(canPlant(4, 11, 6)).toBe(true);
  expect(canPlant(4, 10, 6)).toBe(false);
  expect(canPlant(1, 1, 7)).toBe(false);
  expect([1, 2, 3, 5, 6, 10, 11, 24].map((units) => tierForUnits(units)?.key)).toEqual(['sprout', 'sprout', 'tree', 'tree', 'bigTree', 'bigTree', 'house', 'house']);
  expect(() => plant(3, 5, 1, 1)).toThrow();
});

test('commitments round-trip with tier, style and planter', () => {
  const commitment = plant(3, 6, 4, 1_800_000_000);
  expect(commitment).toHaveLength(78);
  expect(parseTree(commitment)).toMatchObject({ ownerBytecode: owner, planterTag: planterTag(planter), stamp: 1_800_000_000, units: 6, tier: 3, tierKey: 'bigTree', species: 4, speciesKey: 'maple', merged: false, points: 6 });
});

test('merges climb one tier, keep the first style and the value', () => {
  const sprouts = [1, 2, 3].map((at) => plant(1, 1, 2, at));
  const merged = checkMerge(sprouts)!;
  expect(merged.result).toBe(mergedCommitment(sprouts));
  expect(parseTree(merged.result)).toMatchObject({ tierKey: 'tree', speciesKey: 'cherry', merged: true, points: 3 });
  expect(checkMerge(sprouts.slice(0, 2))).toBe(null);
  expect(checkMerge([sprouts[0], sprouts[0], sprouts[1]])).toBe(null);
  expect(checkMerge([sprouts[0], sprouts[1], plant(2, 3, 1, 9)])).toBe(null);
  const houses = [plant(4, 11, 1, 1), plant(4, 11, 1, 2)];
  expect(checkMerge(houses)).toBe(null);
});

test('profile cards and "about me" encode exactly', () => {
  expect(profileCommitment('Salem')).toBe('0153616c656d');
  expect(parseProfile(profileCommitment('فوكس'))?.name).toBe('فوكس');
  expect(parseProfile('01ffffff')).toBeNull();
  expect(() => profileCommitment('ab')).toThrow();
  expect(() => profileCommitment('x'.repeat(33))).toThrow();
  expect(aboutOutputBytecode('Hi')).toBe('6a04464750310248 69'.replace(' ', ''));
  expect(() => aboutOutputBytecode('x'.repeat(141))).toThrow();
});

test('each NFT gets a stable name, rarity and per-item seed', () => {
  const commitment = plant(2, 3, 1, 1_800_000_001);
  const item = nftTree(commitment);
  expect(nftTree(commitment)).toEqual(item);
  expect({ name: item.name, tag: item.tag, rarity: item.rarity, seed: item.seed }).toMatchSnapshot();
  expect(nftTree(previewCommitment(4, 2))).toMatchObject({ name: 'Cherry House', rarity: 'epic', islandType: 'diamond' });
  expect(nftTree(previewCommitment(3, 3))).toMatchObject({ name: 'Pine Big Tree', rarity: 'rare' });
  const seeds = new Set(Array.from({ length: 50 }, (_, index) => nftTree(plant(1, 1, 1, 1_800_000_000 + index)).seed));
  expect(seeds.size).toBeGreaterThan(45);
  expect(isRewardCommitment(`04${'00'.repeat(38)}`)).toBe(false);
});

test('development samples are valid garden data', () => {
  const sessions = gardenSchema.parse({ network: 'chipnet', creditSatoshis: 0, sessions: sampleRewardSessions(1_794_700_000_000) }).sessions;
  expect(forestTrees(sessions)).toHaveLength(13);
  expect(mergeableTrees(sessions)).toHaveLength(9);
  expect(sessions.filter((session) => session.state === 'locked')).toHaveLength(1);
  expect(sampleLeaderboard()[0]).toMatchObject({ rank: 1, name: 'Salem' });
});
