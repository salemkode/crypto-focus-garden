import { expect, test } from 'bun:test';
import { mergeEvents, mergeOptions, planMerges } from '../src/merge-plan';
import { replayValley, type ValleyEntity, type ValleyEvent } from '../src/valley';
import type { Level } from '../src/ladder';

const plants = (levels: Level[]): ValleyEvent[] => levels.map((level, n) => ({ type: 'plant', entity: { id: `p${n}`, level, style: 'oak', seed: n } as ValleyEntity }));

test('options count how many merges each level allows', () => {
  const placed = replayValley(plants([1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 5, 5]), 9).placed;
  expect(mergeOptions(placed).map((o) => [o.level, o.available])).toEqual([[1, 2], [3, 1], [5, 1]]);
});

test('a plan merges the chosen amounts, each ingredient used once, nothing else moved', () => {
  const history = plants([1, 1, 1, 1, 1, 1, 2, 3, 3, 3, 4, 4]);
  const before = replayValley(history, 3).placed;
  const plan = planMerges(before, { 1: Infinity, 3: 1 });
  expect(plan.length).toBe(3);
  const used = plan.flatMap((m) => m.ingredients);
  expect(new Set(used).size).toBe(used.length);
  const after = replayValley([...history, ...mergeEvents(plan)], 3).placed;
  expect(after.length).toBe(before.length - plan.reduce((n, m) => n + m.ingredients.length - 1, 0));
  for (const p of after.filter((p) => !p.id.startsWith('merged-'))) {
    const old = before.find((b) => b.id === p.id)!;
    expect([p.x, p.z]).toEqual([old.x, old.z]);
  }
});

test('cascade keeps merging upward with the new results', () => {
  const placed = replayValley(plants(Array(9).fill(1)), 4).placed; // 9 seedlings
  expect(planMerges(placed, { 1: Infinity }).length).toBe(3); // three saplings
  const cascade = planMerges(placed, { 1: Infinity }, { cascade: true });
  expect(cascade.length).toBe(4); // three saplings, then one grand tree
  expect(cascade.at(-1)!.result.level).toBe(3);
  const after = replayValley([...plants(Array(9).fill(1)), ...mergeEvents(cascade)], 4).placed;
  expect(after.map((p) => p.entity.level)).toEqual([3]);
});
