import { expect, test } from 'bun:test';
import { LADDER, MAX_SESSION_UNITS, levelForUnits, minimumUnits } from '@focus-garden/garden/rules';
import { FOREST_TIERS, UNIT_SECONDS } from '@focus-garden/protocol/rules';

test('the local progression can be used without loading a renderer', () => {
  expect(LADDER).toHaveLength(10);
  expect(MAX_SESSION_UNITS * UNIT_SECONDS).toBe(3584);
  expect(levelForUnits(0)).toBeNull();
  expect(levelForUnits(1)).toBe(1);
  expect(levelForUnits(7)).toBe(3);
  expect(minimumUnits(10)).toBeGreaterThan(minimumUnits(9));
});

test('on-chain reward rules are distinct from local valley progression', () => {
  expect(FOREST_TIERS.map((tier) => tier.minUnits)).toEqual([1, 3, 6, 11]);
  expect(FOREST_TIERS.map((tier) => tier.mergeCount)).toEqual([3, 2, 2, undefined]);
  expect(FOREST_TIERS.map((tier) => tier.points)).toEqual([1, 3, 6, 12]);
});
