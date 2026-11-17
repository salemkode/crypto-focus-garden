/** Contract-facing v5 constants. No crypto initialization, wallet or renderer imports. */
export const UNIT_SECONDS = 512;
export const MAX_UNITS = 24;

export interface ForestTier { code: number; key: 'sprout' | 'tree' | 'bigTree' | 'house'; name: string; minUnits: number; points: number; mergeCount?: number }
export const FOREST_TIERS: readonly ForestTier[] = [
  { code: 1, key: 'sprout', name: 'Sprout', minUnits: 1, points: 1, mergeCount: 3 },
  { code: 2, key: 'tree', name: 'Tree', minUnits: 3, points: 3, mergeCount: 2 },
  { code: 3, key: 'bigTree', name: 'Big Tree', minUnits: 6, points: 6, mergeCount: 2 },
  { code: 4, key: 'house', name: 'House', minUnits: 11, points: 12 },
];
export interface ForestSpecies { code: number; key: 'oak' | 'cherry' | 'pine' | 'maple' | 'birch' | 'cash'; name: string }
export const FOREST_SPECIES: readonly ForestSpecies[] = [
  { code: 1, key: 'oak', name: 'Meadow Oak' },
  { code: 2, key: 'cherry', name: 'Blossom Cherry' },
  { code: 3, key: 'pine', name: 'Ridge Pine' },
  { code: 4, key: 'maple', name: 'Ember Maple' },
  { code: 5, key: 'birch', name: 'Silver Birch' },
  { code: 6, key: 'cash', name: 'Cash Tree' },
];
