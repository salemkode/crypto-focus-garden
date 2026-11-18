import { z } from 'zod';
import type { Level } from '@focus-garden/garden/ladder';
import { seedOf, type ValleyEntity, type ValleyEvent } from '@focus-garden/garden/valley';
import { levelForSeconds } from '../focus/catalog';
import type { FocusGarden } from '../focus/session';
import { SPECIES_3D } from '../three/scene';

/**
 * The valley's history from what this phone knows: every grown session is a plant, and merges
 * made here are stored as events (they move on chain with contract v6). The order is the order
 * things happened, which is what keeps every item in its place as the valley grows.
 */
export const mergeSchema = z.object({
  at: z.number().int().nonnegative(),
  ingredients: z.array(z.string().min(1)).min(2),
  result: z.object({ id: z.string().min(1), level: z.number().int().min(2).max(10), style: z.enum(['oak', 'pine', 'birch', 'cherry', 'maple', 'cash']), seed: z.number().int().nonnegative() }),
});
export type StoredMerge = z.infer<typeof mergeSchema>;
export const mergesSchema = z.array(mergeSchema);

export function entityOf(record: { id: string; duration: number; species: keyof typeof SPECIES_3D }): ValleyEntity {
  return { id: record.id, level: levelForSeconds(record.duration), style: SPECIES_3D[record.species], seed: seedOf(record.id) % 100000 };
}

export function valleyHistory(garden: FocusGarden, merges: readonly StoredMerge[]): ValleyEvent[] {
  const plants = garden.records
    .filter((record) => record.outcome === 'grown')
    .map((record) => ({ at: record.endedAt, event: { type: 'plant' as const, entity: entityOf(record) } }));
  const merged = merges.map((merge) => ({ at: merge.at, event: { type: 'merge' as const, ingredients: merge.ingredients, result: { ...merge.result, level: merge.result.level as Level } } }));
  // Stable: by time, plants before merges at the same moment.
  return [...plants, ...merged].sort((a, b) => a.at - b.at || (a.event.type === 'plant' ? -1 : 1)).map((entry) => entry.event);
}

/** The session growing right now, as the valley's live item. */
export function growingEntity(garden: FocusGarden, progress: number) {
  const timer = garden.timer;
  if (timer.status !== 'growing') return null;
  return { entity: entityOf(timer), progress: Math.max(0.04, Math.min(1, progress)) };
}
