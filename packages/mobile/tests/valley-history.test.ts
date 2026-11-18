import { expect, test } from 'bun:test';
import { replayValley } from '@focus-garden/garden/valley';
import { growingEntity, valleyHistory, type StoredMerge } from '../src/features/valley/history';
import { initialGarden, plant, type FocusGarden } from '../src/features/focus/session';
import { levelForSeconds, MAX_SESSION } from '../src/features/focus/catalog';

const T0 = 1_800_000_000_000;
const record = (id: string, duration: number, minutes: number, outcome: 'grown' | 'withered' = 'grown') => ({
  id, duration, species: 'oak' as const, tag: 'focus' as const, startedAt: T0 + minutes * 60_000 - duration * 1000, endedAt: T0 + minutes * 60_000, outcome, reason: outcome === 'grown' ? null : 'gave-up' as const,
});

test('session length decides the level, and one session never grows past level 3', () => {
  expect(MAX_SESSION).toBeLessThanOrEqual(3600);
  expect([300, 512, 1536, 2560, 3584, 7200].map(levelForSeconds)).toEqual([1, 1, 2, 3, 3, 3]);
});

test('grown sessions become plants in order; withered ones do not', () => {
  const garden: FocusGarden = { ...initialGarden(), records: [record('b', 1536, 20), record('a', 512, 10), record('x', 600, 15, 'withered')] };
  const events = valleyHistory(garden, []);
  expect(events.map((e) => e.type === 'plant' ? e.entity.id : '')).toEqual(['a', 'b']);
  expect(events.map((e) => e.type === 'plant' ? e.entity.level : 0)).toEqual([1, 2]);
});

test('stored merges replay after their ingredients', () => {
  const garden: FocusGarden = { ...initialGarden(), records: [record('a', 512, 1), record('b', 512, 2), record('c', 512, 3), record('d', 1536, 9)] };
  const merge: StoredMerge = { at: T0 + 5 * 60_000, ingredients: ['a', 'b', 'c'], result: { id: 'm1', level: 2, style: 'oak', seed: 1 } };
  const placed = replayValley(valleyHistory(garden, [merge]), 7).placed;
  expect(placed.map((p) => p.id).sort()).toEqual(['d', 'm1']);
});

test('the growing session is the live item', () => {
  const growing = plant({ ...initialGarden(), duration: 1536 }, T0, 'live');
  expect(growingEntity(growing, 0.5)?.entity).toMatchObject({ id: 'live', level: 2 });
  expect(growingEntity(initialGarden(), 0.5)).toBeNull();
});
