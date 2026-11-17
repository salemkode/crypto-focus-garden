import { FOREST_TIERS, UNIT_SECONDS } from '@focus-garden/protocol/rules';
import { levelForUnits, levelInfo, type Level } from '@focus-garden/garden/rules';
export type SpeciesId = 'oak' | 'pine' | 'birch' | 'cherry' | 'maple' | 'cashtree';
export type CanopyShape = 'round' | 'cone' | 'oval' | 'wide';

export interface Species {
  id: SpeciesId;
  name: string;
  blurb: string;
  shape: CanopyShape;
  trunk: string;
  /** Leaf colours from shadow to highlight. */
  leaves: readonly [string, string, string];
  /** Optional sparse accent pixels (blossoms, fruit, coins). */
  accent?: string;
}

export const SPECIES: readonly Species[] = [
  { id: 'oak', name: 'Meadow oak', blurb: 'Patient and round.', shape: 'round', trunk: '#7a4a27', leaves: ['#3f8a25', '#5cab35', '#84cd4e'] },
  { id: 'pine', name: 'Ridge pine', blurb: 'Tall layers for long, quiet sessions.', shape: 'cone', trunk: '#6b3f22', leaves: ['#245c3a', '#2f7a4a', '#4a9a5f'] },
  { id: 'birch', name: 'Silver birch', blurb: 'A pale trunk and a light, airy crown.', shape: 'oval', trunk: '#e8e2d4', leaves: ['#7fae3a', '#9cc94a', '#c1e070'] },
  { id: 'cherry', name: 'Blossom cherry', blurb: 'Blooms for the days you showed up.', shape: 'round', trunk: '#6e3b2e', leaves: ['#e28aa8', '#f2a7c1', '#fbd0de'], accent: '#ffffff' },
  { id: 'maple', name: 'Ember maple', blurb: 'Autumn colour that never falls.', shape: 'wide', trunk: '#6a3a1e', leaves: ['#b8401f', '#de6a2b', '#f2a03d'] },
  { id: 'cashtree', name: 'Cash tree', blurb: 'Bitcoin Cash green with golden coins.', shape: 'round', trunk: '#5a4632', leaves: ['#07936c', '#0ac18e', '#4fe0b5'], accent: '#f5c542' },
];

export function speciesById(id: SpeciesId) {
  return SPECIES.find((species) => species.id === id) ?? SPECIES[0];
}

export type TagId = 'focus' | 'study' | 'work' | 'reading' | 'exercise' | 'create' | 'rest';
export const TAGS: readonly { id: TagId; label: string; color: string }[] = [
  // Fixed categorical order validated against the paper surface (dataviz validator); always shown with text labels.
  { id: 'focus', label: 'Focus', color: '#2a78d6' },
  { id: 'study', label: 'Study', color: '#eb6834' },
  { id: 'work', label: 'Work', color: '#1baf7a' },
  { id: 'reading', label: 'Reading', color: '#eda100' },
  { id: 'exercise', label: 'Exercise', color: '#e87ba4' },
  { id: 'create', label: 'Create', color: '#008300' },
  { id: 'rest', label: 'Rest', color: '#6250d6' },
];
export function tagById(id: TagId) {
  return TAGS.find((tag) => tag.id === id) ?? TAGS[0];
}

/** Leaving-the-app rules. `null` grace means leaving is allowed. */
export const LEAVE_RULES = {
  strict: { label: 'Strict', graceSeconds: 10, detail: 'Your tree withers if you leave the app for more than 10 seconds.' },
  relaxed: { label: 'Relaxed', graceSeconds: 60, detail: 'You can step away for up to one minute.' },
  off: { label: 'Allow leaving', graceSeconds: null, detail: 'Only giving up withers a tree. Honour system.' },
} as const;
export type LeaveRule = keyof typeof LEAVE_RULES;

export const MIN_DURATION = 300;
export const MAX_DURATION = 7200;
export const DURATION_STEP = 300;

/** Reward sizes, aligned with the Bitcoin Cash lock steps (512 s) so local and verified sessions match. */
export type RewardTier = 'sprout' | 'tree' | 'bigTree' | 'house';
const PRESET_LABEL = { sprout: '8½ min', tree: '25½ min', bigTree: '51 min', house: '1 h 34 min' } as const;
export const REWARD_PRESETS = FOREST_TIERS.map((tier) => ({
  tier: tier.key, name: tier.name, seconds: tier.minUnits * UNIT_SECONDS, label: PRESET_LABEL[tier.key],
}));
/** The biggest reward a session of this length grows. */
export function tierForSeconds(seconds: number): RewardTier {
  return [...REWARD_PRESETS].reverse().find((preset) => seconds >= preset.seconds)?.tier ?? 'sprout';
}
export function presetFor(tier: RewardTier) {
  return REWARD_PRESETS.find((preset) => preset.tier === tier)!;
}
/** Local species ids mapped to the on-chain style codes (1..6). */
export const SPECIES_CODE: Record<SpeciesId, number> = { oak: 1, cherry: 2, pine: 3, maple: 4, birch: 5, cashtree: 6 };

// ---- The ladder (valley levels). One session grows levels 1–3 and lasts at most one hour. ----

/** One Bitcoin Cash lock step. Session lengths are whole steps so local and on-chain sessions match. */
export const SESSION_STEP = UNIT_SECONDS;
/** Seven steps: 59.7 minutes. Anything bigger is grown by merging. */
export const MAX_SESSION = 7 * SESSION_STEP;
/** Quick picks for the session sheet: one per level a single session can grow, plus the full hour. */
export const SESSION_PRESETS: readonly { seconds: number; label: string }[] = [
  { seconds: 1 * SESSION_STEP, label: '9 min' },
  { seconds: 3 * SESSION_STEP, label: '26 min' },
  { seconds: 5 * SESSION_STEP, label: '43 min' },
  { seconds: 7 * SESSION_STEP, label: '1 hour' },
];
/** The valley level a session of this length grows (always 1–3). */
export function levelForSeconds(seconds: number): Level {
  return levelForUnits(Math.max(1, Math.round(Math.min(seconds, MAX_SESSION) / SESSION_STEP))) ?? 1;
}
export function levelName(level: Level) { return levelInfo(level).name; }
