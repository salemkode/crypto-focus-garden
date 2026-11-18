import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { PeriodPicker } from '../../../components/PeriodPicker';
import { TreeSprite } from '../../../components/TreeSprite';
import { speciesById, tagById } from '../../../features/focus/catalog';
import { useFocusGarden } from '../../../features/focus/FocusProvider';
import { continuous, Group, icons, numerals, Row, Screen, Stats } from '../../../ui';
import { currentStreak, focusBuckets, formatDuration, periodLabel, periodRange, recordsIn, summarize, tagTotals, type Period } from '../../../features/focus/stats';

const CHART_HEIGHT = 140;

/** "this week", "today", or the past period's own name ("on Mon 3 Nov", "in Oct 2026"). */
function periodPhrase(period: Period, anchor: number, now: number) {
  const label = periodLabel(period, anchor, now);
  if (periodRange(period, anchor).start === periodRange(period, now).start) return label.toLowerCase();
  return period === 'day' ? `on ${label}` : period === 'week' ? label : `in ${label}`;
}

/** Session time, as precise as the period needs: time for a day, weekday for a week, date otherwise. */
function sessionTime(period: Period, at: number) {
  const time = { hour: 'numeric', minute: '2-digit' } as const;
  if (period === 'day') return new Date(at).toLocaleTimeString([], time);
  if (period === 'week') return new Date(at).toLocaleString([], { weekday: 'short', ...time });
  return new Date(at).toLocaleString([], { day: 'numeric', month: 'short', ...time });
}

export default function StatsScreen() {
  const { garden, now } = useFocusGarden();
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(now);
  const records = recordsIn(garden.records, periodRange(period, anchor));
  const summary = summarize(records);
  const tags = tagTotals(records);
  const tagMax = Math.max(1, ...tags.map((entry) => entry.seconds));
  const streak = currentStreak(garden.records, now);
  const empty = records.length === 0;
  const facts = [
    ...(summary.successRate === null ? [] : [{ value: `${Math.round(summary.successRate * 100)}%`, label: 'grown' }]),
    ...(empty ? [] : [{ value: `${summary.grown}`, label: summary.grown === 1 ? 'tree' : 'trees' }]),
    ...(empty && streak === 0 ? [] : [{ value: `${streak}`, label: 'day streak' }]),
  ];
  return <Screen title="Stats">
    <PeriodPicker period={period} anchor={anchor} now={now} onChange={(next, at) => { setPeriod(next); setAnchor(at); }} />

    <View className="gap-2 px-1">
      <Text accessibilityLabel={`Focused ${formatDuration(summary.focusedSeconds)}`}>
        <Text style={numerals} className="text-large-title text-ink">{formatDuration(summary.focusedSeconds)}</Text>
        <Text className="text-title-3 font-normal text-ink-2"> focused</Text>
      </Text>
      {facts.length ? <Stats items={facts} /> : null}
    </View>

    {empty ? <Group>
      <Row icon={icons.tree} title={`Nothing planted ${periodPhrase(period, anchor, now)}`} value="Plant a tree" onPress={() => router.navigate('/')} chevron />
    </Group> : null}

    {summary.focusedSeconds > 0 ? <FocusChart key={`${period}-${periodRange(period, anchor).start}`} period={period} anchor={anchor} records={garden.records} /> : null}

    {tags.length ? <Group title="By tag">
      {tags.map((entry) => <View key={entry.id} className="gap-2 px-4 py-3">
        <View className="flex-row justify-between"><Text className="text-body text-ink">{entry.label}</Text><Text style={numerals} className="text-subhead text-ink-2">{formatDuration(entry.seconds)} · {Math.round((entry.seconds / summary.focusedSeconds) * 100)}%</Text></View>
        <View style={{ width: `${Math.max(2, (entry.seconds / tagMax) * 100)}%`, backgroundColor: entry.color }} className="h-2 rounded-full" />
      </View>)}
    </Group> : null}

    {!empty ? <Group title="Sessions">
      {[...records].reverse().slice(0, 30).map((entry) => <View key={entry.id} className="min-h-14 flex-row items-center gap-3 px-4 py-2">
        <TreeSprite species={entry.species} withered={entry.outcome === 'withered'} size={28} />
        <View className="flex-1">
          <Text className="text-body text-ink">{tagById(entry.tag).label}</Text>
          <Text className="text-footnote text-ink-2">{speciesById(entry.species).name} · {sessionTime(period, entry.startedAt)}</Text>
        </View>
        <Text style={numerals} className={entry.outcome === 'grown' ? 'text-subhead text-ink' : 'text-subhead text-ember'}>{entry.outcome === 'grown' ? formatDuration(entry.duration) : 'Withered'}</Text>
      </View>)}
    </Group> : null}
  </Screen>;
}

/** Single-series bar chart of focused time. The top line is the axis maximum; tap a bar for its value. */
function FocusChart({ period, anchor, records }: { period: Period; anchor: number; records: Parameters<typeof focusBuckets>[0] }) {
  const buckets = focusBuckets(records, period, anchor);
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...buckets.map((bucket) => bucket.minutes));
  const ceiling = max <= 60 ? 60 : Math.ceil(max / 60) * 60;
  const labelEvery = period === 'day' ? 6 : period === 'month' ? 5 : 1;
  const unit = period === 'day' ? 'hour' : period === 'year' ? 'month' : 'day';
  const start = new Date(periodRange(period, anchor).start);
  const bucketName = (label: string) => period === 'day' ? `${label}:00`
    : period === 'month' ? new Date(start.getFullYear(), start.getMonth(), Number(label)).toLocaleDateString([], { day: 'numeric', month: 'short' })
    : label;
  const picked = selected !== null ? buckets[selected] : undefined;
  return <View style={continuous} className="gap-1 rounded-[20px] bg-surface px-3 pb-2 pt-3">
    <View className="flex-row items-baseline justify-between px-1">
      <Text style={numerals} accessibilityLiveRegion="polite" className="text-footnote font-semibold text-ink">{picked ? `${bucketName(picked.label)}: ${formatDuration(picked.minutes * 60)}` : ''}</Text>
      <Text style={numerals} accessibilityLabel={`Scale up to ${formatDuration(ceiling * 60)}`} className="text-caption text-ink-2">{formatDuration(ceiling * 60)}</Text>
    </View>
    <View style={{ height: CHART_HEIGHT }} className="flex-row items-end border-y border-divider" accessibilityLabel={`Focused time per ${unit}`}>
      {buckets.map((bucket, index) => <Pressable key={bucket.label} accessibilityRole="button" accessibilityLabel={`${bucketName(bucket.label)}: ${formatDuration(bucket.minutes * 60)}`} onPress={() => setSelected(selected === index ? null : index)} style={{ height: CHART_HEIGHT }} className="flex-1 justify-end px-px">
        {bucket.minutes > 0 ? <View style={{ height: Math.max(3, (bucket.minutes / ceiling) * CHART_HEIGHT), opacity: selected === null || selected === index ? 1 : 0.4 }} className="rounded-t-[3px] bg-moss" /> : null}
      </Pressable>)}
    </View>
    <View className="mt-0.5 flex-row">
      {buckets.map((bucket, index) => <Text key={bucket.label} numberOfLines={1} className="flex-1 text-center text-caption text-ink-2">{index % labelEvery === 0 ? (period === 'year' ? bucket.label.slice(0, 1) : bucket.label) : ''}</Text>)}
    </View>
  </View>;
}
