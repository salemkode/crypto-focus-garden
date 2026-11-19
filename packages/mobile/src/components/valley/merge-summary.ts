import type { Level } from '@focus-garden/garden/ladder';
import type { PlannedMerge } from '@focus-garden/garden/merge-plan';

/** Count only newly made items that survive the complete plan. */
export function finalResults(plan: readonly PlannedMerge[]) {
  const consumed = new Set(plan.flatMap((merge) => merge.ingredients));
  const counts = new Map<Level, number>();
  for (const { result } of plan) {
    if (!consumed.has(result.id)) {
      counts.set(result.level, (counts.get(result.level) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(([a], [b]) => b - a);
}
