/**
 * Batch merging: plan many merges at once, apply them as events, and regenerate the valley once.
 * Ingredients are grouped with their nearest neighbours of the same level, so each merge pulls
 * together items that already stand close. With `cascade`, new results join the pool for the next
 * level up (three seedlings become a sapling, three saplings a grand tree, and so on).
 */
import { levelInfo, type Level } from './ladder';
import { seedOf, type Placed, type ValleyEntity, type ValleyEvent } from './valley';

export interface MergeOption { level: Level; next: Level; need: number; available: number }
export interface PlannedMerge { ingredients: string[]; result: ValleyEntity }

/** How many merges each level allows right now (without cascading). */
export function mergeOptions(placed: readonly Placed[], exclude: ReadonlySet<string> = new Set()): MergeOption[] {
  const options: MergeOption[] = [];
  for (let level = 1; level <= 9; level++) {
    const next = (level + 1) as Level;
    const need = levelInfo(next).merge;
    const count = placed.filter((p) => p.entity.level === level && !exclude.has(p.id)).length;
    if (count >= need) options.push({ level: level as Level, next, need, available: Math.floor(count / need) });
  }
  return options;
}

/** The result of merging these ingredients: its id and seed come from their lineage. */
export function mergeResult(ingredients: readonly Placed[]): ValleyEntity {
  const lineage = seedOf(ingredients.map((p) => p.id).join('|'));
  return { id: `merged-${lineage}`, level: (ingredients[0].entity.level + 1) as Level, style: ingredients[0].entity.style, seed: lineage % 100000 };
}

/**
 * Plans the merges the user chose: `counts[level]` merges at each level (Infinity = as many as
 * possible). Returns the merges in the order to apply them.
 */
export function planMerges(placed: readonly Placed[], counts: Partial<Record<Level, number>>, options: { cascade?: boolean; exclude?: ReadonlySet<string> } = {}): PlannedMerge[] {
  const pool = placed.filter((p) => !options.exclude?.has(p.id)).map((p) => ({ ...p }));
  const plan: PlannedMerge[] = [];
  for (let level = 1; level <= 9; level++) {
    const need = levelInfo((level + 1) as Level).merge;
    let wanted = counts[level as Level] ?? (options.cascade && plan.length ? Infinity : 0);
    while (wanted > 0) {
      const same = pool.filter((p) => p.entity.level === level);
      if (same.length < need) break;
      // Start from the item nearest the valley's centre, then take its nearest same-level neighbours.
      const first = same.reduce((a, b) => (Math.hypot(a.x, a.z) <= Math.hypot(b.x, b.z) ? a : b));
      const group = [first, ...same.filter((p) => p !== first).sort((a, b) => Math.hypot(a.x - first.x, a.z - first.z) - Math.hypot(b.x - first.x, b.z - first.z)).slice(0, need - 1)];
      const result = mergeResult(group);
      plan.push({ ingredients: group.map((p) => p.id), result });
      for (const p of group) pool.splice(pool.indexOf(p), 1);
      if (options.cascade) pool.push({ ...first, id: result.id, entity: result });
      wanted--;
    }
  }
  return plan;
}

/** The plan as valley events, ready to append to the history. */
export function mergeEvents(plan: readonly PlannedMerge[]): ValleyEvent[] {
  return plan.map((m) => ({ type: 'merge', ingredients: m.ingredients, result: m.result }));
}
