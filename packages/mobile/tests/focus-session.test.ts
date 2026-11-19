import { expect, test } from 'bun:test';
import {
  configure, dismiss, gardenSchema, giveUp, growthProgress, growthStage, heartbeat, initialGarden, leave, migrateLegacy,
  plant, remainingSeconds, restoreGarden, returnTo, settleGarden, type FocusGarden,
} from '../src/features/focus/session';
import { currentStreak, focusBuckets, periodRange, recordsIn, shiftAnchor, summarize, tagTotals } from '../src/features/focus/stats';
import { treeArt } from '../src/features/focus/tree-art';
import { SPECIES } from '../src/features/focus/catalog';

const T0 = new Date(2026, 10, 15, 9, 0, 0).getTime();
function planted(change: Partial<FocusGarden> = {}) {
  return plant({ ...initialGarden(), duration: 600, ...change }, T0, 'tree-1');
}

test('a tree that stays in the foreground grows exactly once', () => {
  const garden = planted();
  expect(remainingSeconds(garden.timer, T0 + 300_000)).toBe(300);
  expect(settleGarden(garden, T0 + 599_999)).toBe(garden);
  const grown = settleGarden(garden, T0 + 900_000);
  expect(grown.timer.status).toBe('grown');
  expect(grown.records).toEqual([{ id: 'tree-1', duration: 600, species: 'oak', tag: 'focus', startedAt: T0, endedAt: T0 + 600_000, outcome: 'grown', reason: null }]);
  // Reloading the persisted value cannot grow twice.
  const reloaded = gardenSchema.parse(JSON.parse(JSON.stringify(grown)));
  expect(settleGarden(reloaded, T0 + 999_000)).toEqual(reloaded);
  expect(dismiss(reloaded).timer.status).toBe('idle');
});

test('giving up withers the tree', () => {
  const withered = giveUp(planted(), T0 + 120_000);
  expect(withered.timer).toMatchObject({ status: 'withered', reason: 'gave-up', endedAt: T0 + 120_000 });
  expect(withered.records[0].outcome).toBe('withered');
  expect(growthProgress(withered.timer, T0)).toBeCloseTo(0.2);
});

test('strict mode withers after the grace period away; a short absence is forgiven', () => {
  const away = leave(planted(), T0 + 60_000);
  expect(returnTo(away, T0 + 65_000).timer).toMatchObject({ status: 'growing', leftAt: null });
  const lost = returnTo(away, T0 + 200_000);
  expect(lost.timer).toMatchObject({ status: 'withered', reason: 'left-app', endedAt: T0 + 70_000 });
  // Leaving after the deadline-minus-grace point still finishes the tree.
  const late = leave(planted(), T0 + 595_000);
  expect(returnTo(late, T0 + 900_000).timer.status).toBe('grown');
  // A background deadline never completes while the user is away.
  expect(settleGarden(away, T0 + 900_000)).toBe(away);
});

test('older saved leave rules are treated as strict', () => {
  // Leaving is always strict now; "relaxed" and "off" from older versions no longer extend the grace.
  for (const leaveRule of ['relaxed', 'off'] as const) {
    const away = leave(planted({ leaveRule }), T0 + 60_000);
    expect(returnTo(away, T0 + 69_000).timer.status).toBe('growing');
    expect(returnTo(leave(planted({ leaveRule }), T0 + 60_000), T0 + 75_000).timer).toMatchObject({ status: 'withered', reason: 'left-app' });
  }
});

test('cold start after a foreground crash uses the last heartbeat', () => {
  const beating = heartbeat(planted(), T0 + 30_000);
  expect(restoreGarden(beating, T0 + 33_000).timer.status).toBe('growing');
  expect(restoreGarden(beating, T0 + 300_000).timer).toMatchObject({ status: 'withered', reason: 'left-app' });
  // An older "allow leaving" setting no longer protects a crashed session.
  expect(restoreGarden(heartbeat(planted({ leaveRule: 'off' }), T0 + 30_000), T0 + 300_000).timer).toMatchObject({ status: 'withered', reason: 'left-app' });
});

test('settings are frozen while growing, and every tree style is free', () => {
  const growing = planted();
  expect(configure(growing, { duration: 1200 })).toBe(growing);
  const idle = initialGarden();
  for (const { id } of SPECIES) expect(configure(idle, { species: id }).species).toBe(id);
  expect(configure(idle, { species: 'pine', tag: 'study', duration: 2700 })).toMatchObject({ species: 'pine', tag: 'study', duration: 2700 });
  expect(() => configure(idle, { duration: 99_999 })).toThrow();
});

test('a garden saved with the old sunlight currency still loads, without it', () => {
  const saved = { ...initialGarden(), sunlight: 340, unlocked: ['oak', 'birch'], timer: { status: 'grown', id: 'g', duration: 600, species: 'birch', tag: 'focus', startedAt: T0, endedAt: T0 + 600_000, earned: 10 } };
  const loaded = gardenSchema.parse(saved);
  expect(loaded).not.toHaveProperty('sunlight');
  expect(loaded).not.toHaveProperty('unlocked');
  expect(loaded.timer.status).toBe('grown');
});

test('v1 practice history migrates into grown oak records', () => {
  const migrated = migrateLegacy({ duration: 1500, timer: { status: 'paused', id: 'x', duration: 60, remaining: 20 }, sessions: [{ id: 'a', duration: 1500, completedAt: T0 }] });
  expect(migrated.timer.status).toBe('idle');
  expect(migrated.records).toEqual([{ id: 'a', duration: 1500, species: 'oak', tag: 'focus', startedAt: T0 - 1_500_000, endedAt: T0, outcome: 'grown', reason: null }]);
  expect(() => migrateLegacy({ nope: true })).toThrow();
});

test('growth stages advance with progress', () => {
  expect([0, 0.2, 0.5, 0.8, 1].map(growthStage)).toEqual([0, 1, 2, 3, 4]);
});

test('stats bucket grown minutes by period and count streaks', () => {
  const record = (day: number, hour: number, outcome: 'grown' | 'withered', tag: 'study' | 'work' = 'study') => ({
    id: `${day}-${hour}-${outcome}`, duration: 1500, species: 'oak' as const, tag, startedAt: 0, endedAt: new Date(2026, 10, day, hour).getTime(), outcome, reason: outcome === 'grown' ? null : 'gave-up' as const,
  });
  const records = [record(13, 9, 'grown'), record(14, 10, 'grown', 'work'), record(15, 8, 'grown'), record(15, 11, 'withered')];
  const now = new Date(2026, 10, 15, 18).getTime();
  expect(summarize(recordsIn(records, periodRange('day', now)))).toEqual({ grown: 1, withered: 1, focusedSeconds: 1500, successRate: 0.5 });
  const week = focusBuckets(records, 'week', now);
  expect(week.map((bucket) => bucket.minutes)).toEqual([0, 0, 0, 0, 25, 25, 25]);
  expect(focusBuckets(records, 'day', now)[8].minutes).toBe(25);
  expect(focusBuckets(records, 'month', now)).toHaveLength(30);
  expect(focusBuckets(records, 'year', now)[10].minutes).toBe(75);
  expect(tagTotals(records).map((entry) => [entry.id, entry.seconds])).toEqual([['study', 3000], ['work', 1500]]);
  expect(currentStreak(records, now)).toBe(3);
  expect(currentStreak(records, shiftAnchor('day', now, 2))).toBe(0);
});

test('every species renders every stage within the sprite canvas', () => {
  for (const species of SPECIES) for (const stage of [0, 1, 2, 3, 4]) for (const withered of [false, true]) {
    const runs = treeArt(species.id, stage, withered);
    expect(runs.length).toBeGreaterThan(3);
    for (const run of runs) {
      expect(run.x).toBeGreaterThanOrEqual(0);
      expect(run.x + run.w).toBeLessThanOrEqual(16);
      expect(run.y).toBeLessThan(20);
    }
  }
  expect(treeArt('oak', 4, true)).not.toEqual(treeArt('oak', 4, false));
});

test('app blocking is opt-in and older saved forests load with it off', () => {
  const { blockApps, ...older } = initialGarden();
  expect(blockApps).toBe(false);
  expect(gardenSchema.parse(older).blockApps).toBe(false);
  expect(configure(initialGarden(), { blockApps: true }).blockApps).toBe(true);
  // Cannot be switched off mid-session to dodge the block.
  const growing = { ...plant({ ...initialGarden(), blockApps: true }, T0, 'tree-x') };
  expect(configure(growing, { blockApps: false })).toBe(growing);
});
