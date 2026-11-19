import { TAGS, type TagId } from './catalog';
import type { FocusRecord } from './session';

export type Period = 'day' | 'week' | 'month' | 'year';
export const PERIODS: readonly { id: Period; label: string }[] = [
  { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Local-time [start, end) for the period that contains `anchor`. Weeks start on Monday. */
export function periodRange(period: Period, anchor: number): { start: number; end: number } {
  const date = new Date(anchor);
  if (period === 'day') {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return { start: start.getTime(), end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() };
  }
  if (period === 'week') {
    const offset = (date.getDay() + 6) % 7;
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
    return { start: start.getTime(), end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime() };
  }
  if (period === 'month') return { start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), end: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() };
  return { start: new Date(date.getFullYear(), 0, 1).getTime(), end: new Date(date.getFullYear() + 1, 0, 1).getTime() };
}

export function shiftAnchor(period: Period, anchor: number, delta: number) {
  const date = new Date(anchor);
  if (period === 'day') return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta, 12).getTime();
  if (period === 'week') return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta * 7, 12).getTime();
  if (period === 'month') return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12).getTime();
  return new Date(date.getFullYear() + delta, 0, 1, 12).getTime();
}

export function periodLabel(period: Period, anchor: number, now: number) {
  const { start, end } = periodRange(period, anchor);
  const current = periodRange(period, now).start === start;
  const first = new Date(start);
  if (period === 'day') return current ? 'Today' : `${DAYS[(first.getDay() + 6) % 7]} ${first.getDate()} ${MONTHS[first.getMonth()]}`;
  if (period === 'week') {
    const last = new Date(end - 1);
    return current ? 'This week' : `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
  }
  if (period === 'month') return current ? 'This month' : `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  return current ? 'This year' : `${first.getFullYear()}`;
}

/** Records are attributed to the moment they ended, like a finished tree. */
export function recordsIn(records: readonly FocusRecord[], range: { start: number; end: number }) {
  return records.filter((entry) => entry.endedAt >= range.start && entry.endedAt < range.end);
}

export function summarize(records: readonly FocusRecord[]) {
  const grown = records.filter((entry) => entry.outcome === 'grown');
  const withered = records.length - grown.length;
  const focusedSeconds = grown.reduce((total, entry) => total + entry.duration, 0);
  return { grown: grown.length, withered, focusedSeconds, successRate: records.length === 0 ? null : grown.length / records.length };
}

/** Focused minutes per bucket: hours of a day, days of a week/month, months of a year. */
export function focusBuckets(records: readonly FocusRecord[], period: Period, anchor: number) {
  const { start, end } = periodRange(period, anchor);
  const first = new Date(start);
  const count = period === 'day' ? 24 : period === 'week' ? 7 : period === 'month' ? Math.round((end - start) / 86_400_000) : 12;
  const buckets = Array.from({ length: count }, (_, index) => ({
    label: period === 'day' ? `${index}` : period === 'week' ? DAYS[index] : period === 'month' ? `${index + 1}` : MONTHS[index],
    minutes: 0,
  }));
  for (const entry of recordsIn(records, { start, end })) {
    if (entry.outcome !== 'grown') continue;
    const at = new Date(entry.endedAt);
    const index = period === 'day' ? at.getHours()
      : period === 'year' ? at.getMonth()
      : Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() - first.getTime()) / 86_400_000); // round: DST days are 23 or 25 h
    const bucket = buckets[index];
    if (bucket) bucket.minutes += entry.duration / 60;
  }
  return buckets.map((bucket) => ({ ...bucket, minutes: Math.round(bucket.minutes) }));
}

export function tagTotals(records: readonly FocusRecord[]) {
  const totals = new Map<TagId, number>();
  for (const entry of records) if (entry.outcome === 'grown') totals.set(entry.tag, (totals.get(entry.tag) ?? 0) + entry.duration);
  return TAGS.filter((tag) => totals.has(tag.id)).map((tag) => ({ ...tag, seconds: totals.get(tag.id)! })).sort((a, b) => b.seconds - a.seconds);
}

/** Consecutive local days with at least one grown tree, ending today (or yesterday if today is still empty). */
export function currentStreak(records: readonly FocusRecord[], now: number) {
  const days = new Set(records.filter((entry) => entry.outcome === 'grown').map((entry) => periodRange('day', entry.endedAt).start));
  let cursor = periodRange('day', now).start;
  if (!days.has(cursor)) cursor = periodRange('day', shiftAnchor('day', now, -1)).start;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = periodRange('day', shiftAnchor('day', cursor, -1)).start;
  }
  return streak;
}

export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

export function formatClock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const rest = (seconds % 60).toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}
