/** Pure local valley progression. No renderer, platform APIs or wallet dependencies. */
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LevelInfo {
  level: Level;
  key: string;
  name: string;
  kind: 'tree' | 'building' | 'legend';
  /** How many items of the level below merge into one of this level (0 = from a session only). */
  merge: number;
  /** Lock units (512 s each) a single session needs for this level, or null if merge-only. */
  sessionUnits: [number, number] | null;
}

export const MAX_SESSION_UNITS = 7; // 7 × 512 s = 59.7 min: sessions are capped at one hour.

export const LADDER: readonly LevelInfo[] = [
  { level: 1, key: 'seedling', name: 'Seedling', kind: 'tree', merge: 0, sessionUnits: [1, 2] },
  { level: 2, key: 'sapling', name: 'Sapling', kind: 'tree', merge: 3, sessionUnits: [3, 4] },
  { level: 3, key: 'grandTree', name: 'Grand tree', kind: 'tree', merge: 3, sessionUnits: [5, 7] },
  { level: 4, key: 'grove', name: 'Grove', kind: 'tree', merge: 3, sessionUnits: null },
  { level: 5, key: 'cabin', name: 'Cabin', kind: 'building', merge: 2, sessionUnits: null },
  { level: 6, key: 'cottage', name: 'Cottage', kind: 'building', merge: 2, sessionUnits: null },
  { level: 7, key: 'mill', name: 'Mill', kind: 'building', merge: 2, sessionUnits: null },
  { level: 8, key: 'manor', name: 'Manor', kind: 'building', merge: 2, sessionUnits: null },
  { level: 9, key: 'castle', name: 'Castle', kind: 'building', merge: 2, sessionUnits: null },
  { level: 10, key: 'skyCitadel', name: 'Sky Citadel', kind: 'legend', merge: 2, sessionUnits: null },
];

export function levelInfo(level: Level) { return LADDER[level - 1]; }

/** The level a single session of `units` lock units grows (null if too short). */
export function levelForUnits(units: number): Level | null {
  const capped = Math.min(units, MAX_SESSION_UNITS);
  const found = [...LADDER].reverse().find((entry) => entry.sessionUnits && capped >= entry.sessionUnits[0]);
  return found ? found.level : null;
}

/** Focus units held by an item of this level (a lower bound; merging never changes a score). */
export function minimumUnits(level: Level): number {
  if (level <= 3) return LADDER[level - 1].sessionUnits![0];
  return minimumUnits((level - 1) as Level) * LADDER[level - 1].merge;
}
