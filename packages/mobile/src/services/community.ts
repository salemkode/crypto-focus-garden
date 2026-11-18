import { z } from 'zod';
import { useSyncExternalStore } from 'react';

export const leaderEntrySchema = z.object({
  rank: z.number().int().positive(),
  id: z.string(),
  name: z.string(),
  about: z.string(),
  points: z.number().int().nonnegative(),
  trees: z.number().int().nonnegative(),
  bestTier: z.number().int().min(0).max(4),
  tipAddress: z.string().nullable(),
});
export type LeaderEntry = z.infer<typeof leaderEntrySchema>;

/** Verified focus leaderboard from the garden service (opt-in profiles only). */
export async function fetchLeaderboard(period: 'week' | 'all') {
  const { rpc } = await import('./transactions');
  return z.object({ period: z.enum(['week', 'all']), entries: z.array(leaderEntrySchema) }).parse(await rpc({ method: 'leaderboard', period }));
}
export async function fetchProfile(wallet: string) {
  const { rpc } = await import('./transactions');
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('none') }),
    z.object({ state: z.enum(['pending', 'public']), name: z.string(), about: z.string(), id: z.string() }),
  ]).parse(await rpc({ method: 'profile', wallet }));
}

/** 1 focus unit = 512 verified seconds. */
export function focusHours(points: number) {
  const hours = (points * 512) / 3600;
  return hours >= 10 ? `${Math.round(hours)} h` : `${hours.toFixed(1)} h`;
}

// The member the user tapped, handed to the member sheet without putting data in the URL.
let selected: LeaderEntry | null = null;
const listeners = new Set<() => void>();
export function selectMember(entry: LeaderEntry) {
  selected = entry;
  listeners.forEach((listener) => listener());
}
export function useSelectedMember() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => selected);
}
