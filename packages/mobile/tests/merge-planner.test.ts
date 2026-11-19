import { expect, test } from 'bun:test';
import type { Level } from '@focus-garden/garden/ladder';
import { planMerges } from '@focus-garden/garden/merge-plan';
import { replayValley, type ValleyEvent } from '@focus-garden/garden/valley';
import { finalResults } from '../src/components/valley/merge-summary';

function valley(levels: Level[]) {
  const events = levels.map((level, index) => ({
    type: 'plant',
    entity: { id: `plant-${index}`, level, style: 'oak', seed: index },
  } satisfies ValleyEvent));
  return replayValley(events, 4).placed;
}

test('an empty plan has no final results', () => {
  expect(finalResults([])).toEqual([]);
});

test('groups surviving results and sorts highest level first', () => {
  const placed = valley([1, 1, 1, 1, 1, 1, 3, 3, 3, 5, 5]);
  const plan = planMerges(placed, { 1: Infinity, 3: Infinity, 5: Infinity });
  expect(finalResults(plan)).toEqual([[6, 1], [4, 1], [2, 2]]);
});

test('cascade excludes intermediate results consumed by later merges', () => {
  const placed = valley([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const plan = planMerges(placed, { 1: Infinity }, { cascade: true });
  expect(plan).toHaveLength(4);
  expect(finalResults(plan)).toEqual([[3, 1]]);
});

test('cascade retains unconsumed results alongside the higher result', () => {
  const placed = valley([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const plan = planMerges(placed, { 1: Infinity }, { cascade: true });
  expect(finalResults(plan)).toEqual([[3, 1], [2, 1]]);
});
