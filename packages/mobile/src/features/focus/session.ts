import { z } from 'zod';
import { LEAVE_RULES, MAX_DURATION, SPECIES, TAGS, type LeaveRule, type SpeciesId, type TagId } from './catalog';

const timestamp = z.number().int().nonnegative();
// 60 s is retained for development/acceptance runs; the picker offers 10–120 minutes.
const duration = z.number().int().min(60).max(MAX_DURATION);
const species = z.enum(SPECIES.map((entry) => entry.id) as [SpeciesId, ...SpeciesId[]]);
const tag = z.enum(TAGS.map((entry) => entry.id) as [TagId, ...TagId[]]);
const leaveRule = z.enum(Object.keys(LEAVE_RULES) as [LeaveRule, ...LeaveRule[]]);
const witherReason = z.enum(['gave-up', 'left-app']);

const planted = { id: z.string().min(1), duration, species, tag, startedAt: timestamp };
const timer = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({ status: z.literal('growing'), ...planted, endsAt: timestamp, leftAt: timestamp.nullable(), seenAt: timestamp }),
  // `earned` held local sunlight before it was removed; kept optional so saved timers still load.
  z.object({ status: z.literal('grown'), ...planted, endedAt: timestamp, earned: z.number().int().nonnegative().optional() }),
  z.object({ status: z.literal('withered'), ...planted, endedAt: timestamp, reason: witherReason }),
]);
const record = z.object({ ...planted, endedAt: timestamp, outcome: z.enum(['grown', 'withered']), reason: witherReason.nullable() });

export const gardenSchema = z.object({
  version: z.literal(2),
  duration,
  species,
  tag,
  leaveRule,
  timer,
  records: z.array(record),
  // Earlier versions stored `sunlight` and `unlocked`; there is no in-app currency and every
  // tree style is free, so those keys are ignored (zod strips them) when a saved garden loads.
  /** Block the user's chosen apps while a tree grows (iOS Screen Time / Android guard). */
  blockApps: z.boolean().default(false),
  /** Also lock each session on Bitcoin Cash to earn a verified reward. */
  verify: z.boolean().default(false),
});
export type FocusGarden = z.infer<typeof gardenSchema>;
export type FocusRecord = z.infer<typeof record>;
export type FocusTimer = FocusGarden['timer'];

export function initialGarden(): FocusGarden {
  return { version: 2, duration: 1536, species: 'oak', tag: 'focus', leaveRule: 'strict', timer: { status: 'idle' }, records: [], blockApps: false, verify: false };
}

// ---- v1 migration -------------------------------------------------------
const legacySchema = z.object({
  duration: z.number().int().positive(),
  timer: z.object({ status: z.string() }).passthrough(),
  sessions: z.array(z.object({ id: z.string(), duration: z.number().int().positive(), completedAt: timestamp })),
});
/** Converts the v1 practice-timer history into grown records. A v1 running/paused timer is not carried over. */
export function migrateLegacy(value: unknown): FocusGarden {
  const legacy = legacySchema.parse(value);
  const records: FocusRecord[] = legacy.sessions.map((session) => ({
    id: session.id, duration: Math.min(MAX_DURATION, Math.max(60, session.duration)), species: 'oak', tag: 'focus',
    startedAt: Math.max(0, session.completedAt - session.duration * 1000), endedAt: session.completedAt, outcome: 'grown', reason: null,
  }));
  const base = initialGarden();
  return gardenSchema.parse({
    ...base,
    duration: Math.min(MAX_DURATION, Math.max(60, legacy.duration)),
    records,
  });
}

// ---- transitions (pure; every function returns the same object when nothing changes) ----

/**
 * Leaving the app is always strict (user decision, 16 November 2026): more than 10 seconds away
 * withers the tree. Older saved rules ("relaxed", "off") still load but no longer change this.
 */
export function graceSeconds(): number {
  return LEAVE_RULES.strict.graceSeconds;
}

export function remainingSeconds(timer: FocusTimer, now: number) {
  if (timer.status === 'growing') return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  if (timer.status === 'grown') return 0;
  return null;
}

export function growthProgress(timer: FocusTimer, now: number) {
  if (timer.status === 'grown') return 1;
  if (timer.status === 'withered') return Math.max(0, Math.min(1, (timer.endedAt - timer.startedAt) / (timer.duration * 1000)));
  if (timer.status !== 'growing') return 0;
  return Math.max(0, Math.min(1, (now - timer.startedAt) / (timer.duration * 1000)));
}

/** 0 seed · 1 sprout · 2 sapling · 3 young · 4 mature. */
export function growthStage(progress: number) {
  if (progress >= 1) return 4;
  if (progress >= 0.7) return 3;
  if (progress >= 0.4) return 2;
  if (progress >= 0.12) return 1;
  return 0;
}

function finish(garden: FocusGarden, outcome: 'grown' | 'withered', endedAt: number, reason: FocusRecord['reason']): FocusGarden {
  const current = garden.timer;
  if (current.status !== 'growing') return garden;
  const { id, duration: length, species: kind, tag: label, startedAt } = current;
  // A record id is written once, so replays of the same transition cannot double-count.
  if (garden.records.some((entry) => entry.id === id)) return { ...garden, timer: { status: 'idle' } };
  const entry: FocusRecord = { id, duration: length, species: kind, tag: label, startedAt, endedAt, outcome, reason };
  if (outcome === 'grown') {
    return { ...garden, records: [...garden.records, entry], timer: { status: 'grown', id, duration: length, species: kind, tag: label, startedAt, endedAt } };
  }
  return { ...garden, records: [...garden.records, entry], timer: { status: 'withered', id, duration: length, species: kind, tag: label, startedAt, endedAt, reason: reason ?? 'gave-up' } };
}

export function plant(garden: FocusGarden, now: number, id: string): FocusGarden {
  if (garden.timer.status === 'growing') return garden;
  return { ...garden, timer: { status: 'growing', id, duration: garden.duration, species: garden.species, tag: garden.tag, startedAt: now, endsAt: now + garden.duration * 1000, leftAt: null, seenAt: now } };
}

export function giveUp(garden: FocusGarden, now: number): FocusGarden {
  if (garden.timer.status !== 'growing') return garden;
  if (now >= garden.timer.endsAt && garden.timer.leftAt === null) return settleGarden(garden, now);
  return finish(garden, 'withered', now, 'gave-up');
}

/** The app moved to the background. */
export function leave(garden: FocusGarden, now: number): FocusGarden {
  if (garden.timer.status !== 'growing' || garden.timer.leftAt !== null || now >= garden.timer.endsAt) return garden;
  return { ...garden, timer: { ...garden.timer, leftAt: now, seenAt: now } };
}

/** The app is in the foreground again (or was relaunched). */
export function returnTo(garden: FocusGarden, now: number): FocusGarden {
  const current = garden.timer;
  if (current.status !== 'growing') return garden;
  if (current.leftAt !== null) {
    const grace = graceSeconds();
    const deadline = current.leftAt + grace * 1000;
    if (deadline < Math.min(now, current.endsAt)) return finish(garden, 'withered', deadline, 'left-app');
    return settleGarden({ ...garden, timer: { ...current, leftAt: null, seenAt: now } }, now);
  }
  return settleGarden(garden, now);
}

const HEARTBEAT_SLACK_MS = 6_000;
/**
 * Cold start: if the process died while foregrounded no background event was saved,
 * so the last persisted heartbeat stands in for the moment the user left.
 */
export function restoreGarden(garden: FocusGarden, now: number): FocusGarden {
  const current = garden.timer;
  if (current.status !== 'growing') return garden;
  const grace = graceSeconds();
  if (current.leftAt === null && now - current.seenAt > grace * 1000 + HEARTBEAT_SLACK_MS && current.seenAt < current.endsAt) {
    return returnTo({ ...garden, timer: { ...current, leftAt: current.seenAt } }, now);
  }
  return returnTo(garden, now);
}

export function heartbeat(garden: FocusGarden, now: number): FocusGarden {
  if (garden.timer.status !== 'growing' || garden.timer.leftAt !== null) return garden;
  return { ...garden, timer: { ...garden.timer, seenAt: now } };
}

/** Completion and history change in one persisted value, so resume/reload cannot grow twice. */
export function settleGarden(garden: FocusGarden, now: number): FocusGarden {
  const current = garden.timer;
  if (current.status !== 'growing' || current.leftAt !== null || now < current.endsAt) return garden;
  return finish(garden, 'grown', current.endsAt, null);
}

export function dismiss(garden: FocusGarden): FocusGarden {
  return garden.timer.status === 'grown' || garden.timer.status === 'withered' ? { ...garden, timer: { status: 'idle' } } : garden;
}

function editable(garden: FocusGarden) {
  return garden.timer.status !== 'growing';
}
export function configure(garden: FocusGarden, change: Partial<Pick<FocusGarden, 'duration' | 'species' | 'tag' | 'leaveRule' | 'blockApps' | 'verify'>>): FocusGarden {
  if (!editable(garden)) return garden;
  const next = gardenSchema.parse({ ...garden, ...change });
  return { ...next, timer: garden.timer.status === 'idle' ? garden.timer : { status: 'idle' } };
}
