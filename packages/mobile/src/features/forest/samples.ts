import { useSyncExternalStore } from 'react';
import type { z } from 'zod';
import { mergedCommitment } from '@focus-garden/protocol/forest';
import type { gardenSchema } from '../../services/garden';

type Session = z.infer<typeof gardenSchema>['sessions'][number];

const OWNER = '5f'.repeat(20);
const PLANTER = '3c'.repeat(12);
function planted(tier: number, species: number, units: number, at: number) {
  const time = Math.floor(at / 1000);
  const stamp = [0, 8, 16, 24].map((shift) => ((time >>> shift) & 255).toString(16).padStart(2, '0')).join('');
  return `05${OWNER}${PLANTER}${stamp}${units.toString(16).padStart(2, '0')}${(tier * 16 + species).toString(16)}`;
}

/**
 * Development-only sample forest for previewing v5 before any real Chipnet tree exists.
 * Never used in release builds and always labelled in the UI.
 */
export function sampleRewardSessions(now: number): Session[] {
  const hour = 3_600_000;
  // [tier, species, units, state]
  const plan: [number, number, number, Session['state']][] = [
    [1, 1, 1, 'claimable'], [1, 1, 1, 'claimable'], [1, 2, 1, 'claimable'], [1, 3, 2, 'claimed'],
    [2, 2, 3, 'claimable'], [2, 1, 3, 'claimable'], [2, 4, 4, 'claimed'],
    [3, 3, 6, 'claimable'], [3, 5, 7, 'claimable'], [3, 4, 6, 'claimed'],
    [4, 1, 11, 'claimable'], [4, 2, 12, 'claimed'],
  ];
  const sessions: Session[] = plan.map(([tier, species, units, state], index) => {
    const plantedAt = now - (index + 2) * 7 * hour;
    return { commitment: planted(tier, species, units, plantedAt), plantedAt, releaseAt: plantedAt + units * 512_000 + 600_000, duration: units * 512, confirmations: 12, claimedAt: state === 'claimed' ? plantedAt + 3 * hour : null, plantTxid: null, claimTxid: null, state };
  });
  // A tree that was merged from three sprouts earlier.
  const oldSprouts = [1, 2, 3].map((offset) => planted(1, 6, 1, now - (200 + offset) * hour));
  sessions.push({ commitment: mergedCommitment(oldSprouts), plantedAt: now - 190 * hour, releaseAt: now - 190 * hour, duration: 0, confirmations: 30, claimedAt: null, plantTxid: null, claimTxid: null, state: 'claimable' });
  // One big tree still growing under its lock.
  const growingAt = now - 20 * 60_000;
  sessions.push({ commitment: planted(3, 2, 6, growingAt), plantedAt: growingAt, releaseAt: growingAt + 6 * 512_000, duration: 6 * 512, confirmations: 3, claimedAt: null, plantTxid: null, claimTxid: null, state: 'locked' });
  return sessions;
}

/** Development-only leaderboard so the Leaders tab can be previewed before Chipnet data exists. */
export function sampleLeaderboard() {
  const people = [
    ['Salem', 'Deep work every morning before the city wakes up.', 64, 19, 4],
    ['Noor', 'Medical student. Three pomodoros a day, no excuses.', 51, 14, 4],
    ['Kenji', 'Building a BCH wallet one focus block at a time.', 38, 12, 3],
    ['Amara', 'Writing my first novel.', 27, 9, 3],
    ['Leo', 'Learning Rust. Slowly.', 19, 11, 2],
    ['Fatima', 'Quran memorisation sessions.', 12, 6, 2],
    ['Diego', 'Night owl coder.', 7, 5, 2],
    ['Mei', 'Just started!', 3, 3, 1],
  ] as const;
  return people.map(([name, about, points, trees, bestTier], index) => ({ rank: index + 1, id: `sample${index}`, name, about, points, trees, bestTier, tipAddress: null as string | null }));
}

// Shared dev toggle so Forest and the merge workshop show the same sample forest.
let sampleSince: number | null = null;
const listeners = new Set<() => void>();
export function setSampleForest(at: number | null) {
  sampleSince = __DEV__ ? at : null;
  listeners.forEach((listener) => listener());
}
export function useSampleForest() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => sampleSince);
}
