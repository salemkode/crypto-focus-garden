import { expect, test } from 'bun:test';
import { buildLevelModel, LADDER, levelForUnits, MAX_SESSION_UNITS, minimumUnits, uniqueName, type Level } from '../src/ladder';

test('a single session grows levels 1–3 only, and sessions are capped at one hour', () => {
  expect(MAX_SESSION_UNITS * 512).toBeLessThanOrEqual(3600);
  expect([0, 1, 2, 3, 4, 5, 7].map(levelForUnits)).toEqual([null, 1, 1, 2, 2, 3, 3]);
  expect(levelForUnits(50)).toBe(3); // longer locks never skip the merge ladder
});

test('every level above 3 comes only from merging, and the ladder spans a lifetime of focus', () => {
  for (const info of LADDER.slice(3)) expect(info.sessionUnits).toBeNull();
  const hours = (level: Level) => (minimumUnits(level) * 512) / 3600;
  expect(hours(4)).toBeCloseTo(2.13, 1);
  expect(hours(10)).toBeGreaterThan(130);
  for (let level = 2; level <= 10; level++) expect(minimumUnits(level as Level)).toBeGreaterThan(minimumUnits((level - 1) as Level));
});

test('each level has its own model, and merged items are unique by lineage', () => {
  const sizes = LADDER.map((info) => buildLevelModel(info.level, 'oak', 5).size);
  expect(new Set(sizes).size).toBe(10);
  const a = buildLevelModel(7, 'cherry', 11).toGeometry().getAttribute('position').count;
  const b = buildLevelModel(7, 'cherry', 12).toGeometry().getAttribute('position').count;
  expect(a).not.toBe(b);
  expect(uniqueName(7, 'maple', 3)).toMatch(/Mill of /);
  expect(uniqueName(7, 'maple', 3)).toBe(uniqueName(7, 'maple', 3));
  expect(uniqueName(2, 'oak', 3)).toBe('Sapling');
});
