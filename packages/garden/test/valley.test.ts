import { expect, test } from 'bun:test';
import { buildTerrain, CELL, islandRadius, placeAll, river, RIVER_BED, seedOf, valleyTerrain, villagersFor, WATER_Y, type ValleyEntity } from '../src/valley';
import type { Level } from '../src/ladder';

const entities = (count: number): ValleyEntity[] => Array.from({ length: count }, (_, n) => ({
  id: `nft-${n}`, level: ((n * 7) % 10 + 1) as Level, style: (['oak', 'pine', 'cherry', 'maple'] as const)[n % 4], seed: n,
}));

test('the same seed and items always give the same valley', () => {
  const seed = seedOf('bchtest:qexampleowner');
  expect(placeAll(entities(40), seed)).toEqual(placeAll(entities(40), seed));
  expect(placeAll(entities(40), seed)).not.toEqual(placeAll(entities(40), seed + 1));
});

test('adding a tree never moves an earlier one', () => {
  const seed = 1234;
  const before = placeAll(entities(30), seed);
  const after = placeAll(entities(31), seed);
  expect(after.slice(0, 30)).toEqual(before);
});

test('items never overlap and never sit in the river', () => {
  const seed = 99;
  const placed = placeAll(entities(80), seed);
  const flow = river(seed);
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius);
    const water = flow.measure(a.x, a.z);
    if (water.along > flow.spring) expect(water.offset).toBeGreaterThanOrEqual(flow.width);
  }
});

test('the island grows with the valley and the river reaches its rim as a waterfall', () => {
  expect(islandRadius(100)).toBeGreaterThan(islandRadius(10));
  const placed = placeAll(entities(12), 7);
  const land = buildTerrain(placed, 12, 7);
  expect(land.model.size).toBeGreaterThan(1000);
  expect(Math.hypot(land.waterfall.x, land.waterfall.z)).toBeGreaterThan(land.radius * 0.7);
});

test('villagers move in with buildings, up to five', () => {
  expect([1, 2, 3, 4].map((l) => villagersFor(l as Level))).toEqual([0, 0, 0, 0]);
  expect(villagersFor(5)).toBe(1);
  expect(villagersFor(10)).toBe(5);
});

test('a merge puts the result on its first ingredient and moves nothing else', async () => {
  const { replayValley } = await import('../src/valley');
  const plants = entities(12).map((entity) => ({ type: 'plant' as const, entity }));
  const before = replayValley(plants, 5).placed;
  const ingredients = [before[2].id, before[5].id, before[7].id];
  const result = { id: 'merged-1', level: 4 as Level, style: 'oak' as const, seed: 77 };
  const after = replayValley([...plants, { type: 'merge', ingredients, result }], 5).placed;
  expect(after.length).toBe(10);
  const merged = after.find((p) => p.id === 'merged-1')!;
  expect([merged.x, merged.z]).toEqual([before[2].x, before[2].z]);
  for (const p of after.filter((p) => p.id !== 'merged-1')) {
    const old = before.find((b) => b.id === p.id)!;
    expect([p.x, p.z]).toEqual([old.x, old.z]);
  }
  // A merge with a missing ingredient is ignored.
  expect(replayValley([...plants, { type: 'merge', ingredients: ['nope'], result }], 5).placed.length).toBe(12);
});

test('the river is a body of water: a surface sunk below its banks over a deeper bed, spilling over the rim', () => {
  const seed = seedOf('bchtest:qexampleowner');
  const land = valleyTerrain(placeAll(entities(30), seed), 30, seed);
  const water = land.water.getAttribute('position');
  expect(water.count).toBeGreaterThan(0);
  const ys = new Set<number>();
  for (let i = 0; i < water.count; i++) ys.add(Math.round(water.getY(i) * 100) / 100);
  // Only two heights: the surface, and the bed where the side faces at the rim reach down to it.
  expect([...ys].sort((a, b) => a - b)).toEqual([CELL * RIVER_BED + CELL / 2, Math.round(WATER_Y * 100) / 100]);
  expect(WATER_Y).toBeLessThan(CELL / 2); // below the valley floor's top
  expect(land.stream.to).toBeGreaterThan(land.stream.from);
  // The river's waterfall leaves from the rim, aimed outward.
  const fall = land.waterfalls.find((w) => w.river)!;
  expect(Math.cos(fall.angle) * fall.x + Math.sin(fall.angle) * fall.z).toBeGreaterThan(0);
  // Ripples follow the river: a point on its centre line measures as in the river.
  const flow = river(seed), mid = (land.stream.from + land.stream.to) / 2, p = flow.point(mid, 0);
  expect(flow.measure(p.x, p.z).offset).toBeLessThan(0.01);
});
