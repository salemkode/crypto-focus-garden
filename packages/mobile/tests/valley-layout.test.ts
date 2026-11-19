import { expect, test } from 'bun:test';
import { decorations, PLOT, spiral, valleyLayout, variantOf, VARIANTS, type ValleyItem } from '../src/features/valley/layout';

const item = (n: number): ValleyItem => ({ id: `s${n}`, tier: 'tree', species: 'oak', seed: 1 });

test('every item gets its own plot, oldest in the centre, spiralling outwards', () => {
  const cells = Array.from({ length: 200 }, (_, index) => spiral(index));
  expect(new Set(cells.map(({ gx, gz }) => `${gx},${gz}`)).size).toBe(200);
  expect(cells[0]).toEqual({ gx: 0, gz: 0 });
  // The first ring (8 cells) is filled before any cell two rings out.
  expect(cells.slice(1, 9).every(({ gx, gz }) => Math.max(Math.abs(gx), Math.abs(gz)) === 1)).toBe(true);
  // Neighbours in the sequence are adjacent, so the valley grows as one connected shape.
  for (let i = 1; i < 49; i++) {
    const [a, b] = [cells[i - 1], cells[i]];
    expect(Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gz - b.gz))).toBeLessThanOrEqual(1);
  }
});

test('the land grows with the number of sessions and always leaves room for the next one', () => {
  const small = valleyLayout([item(1)]);
  const large = valleyLayout(Array.from({ length: 60 }, (_, n) => item(n)));
  expect(small.radius).toBe(2);
  expect(large.radius).toBeGreaterThan(small.radius);
  for (const layout of [small, large]) {
    const land = new Set(layout.tiles.filter((tile) => tile.kind !== 'water').map(({ gx, gz }) => `${gx},${gz}`));
    for (const plot of [...layout.plots, { ...layout.next }]) expect(land.has(`${plot.gx},${plot.gz}`)).toBe(true);
  }
});

test('the valley is deterministic for the same history', () => {
  const items = Array.from({ length: 20 }, (_, n) => item(n));
  expect(valleyLayout(items)).toEqual(valleyLayout(items));
  expect(variantOf('session-42')).toBe(variantOf('session-42'));
  const variants = new Set(Array.from({ length: 300 }, (_, n) => variantOf(`id-${n}`)));
  expect([...variants].every((v) => v >= 1 && v <= VARIANTS)).toBe(true);
  expect(variants.size).toBe(VARIANTS);
});

test('decorations stay on the plot border, clear of the model in the middle', () => {
  for (const tile of valleyLayout(Array.from({ length: 30 }, (_, n) => item(n))).tiles) {
    for (const deco of decorations(tile)) {
      expect(Math.max(Math.abs(deco.x), Math.abs(deco.z))).toBeGreaterThanOrEqual(PLOT / 2 - 2.5);
      expect(Math.max(Math.abs(deco.x), Math.abs(deco.z))).toBeLessThan(PLOT / 2);
    }
  }
});
