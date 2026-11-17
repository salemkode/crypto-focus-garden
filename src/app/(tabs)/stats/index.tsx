import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PeriodPicker } from '../../../components/PeriodPicker';
import { TreeSprite } from '../../../components/TreeSprite';
import { speciesById, tagById } from '../../../features/focus/catalog';
import { useFocusGarden } from '../../../features/focus/FocusProvider';
import { continuous, Group, numerals, Screen, Stats } from '../../../ui';
import { currentStreak, focusBuckets, formatDuration, periodRange, recordsIn, summarize, tagTotals, type Period } from '../../../features/focus/stats';

const CHART_HEIGHT = 140;

export default function StatsScreen() {
  const { garden, now } = useFocusGarden();
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(now);
  const records = recordsIn(garden.records, periodRange(period, anchor));
  const summary = summarize(records);
  const tags = tagTotals(records);
  const tagMax = Math.max(1, ...tags.map((entry) => entry.seconds));
  return <Screen title="Stats">
    <PeriodPicker period={period} anchor={anchor} now={now} onChange={(next, at) => { setPeriod(next); setAnchor(at); }} />

    <View className="gap-2 px-1">
      <Text accessibilityLabel={`Focused ${formatDuration(summary.focusedSeconds)}`}>
        <Text style={numerals} className="text-large-title text-ink">{formatDuration(summary.focusedSeconds)}</Text>
        <Text className="text-title-3 font-normal text-ink-2"> focused</Text>
      </Text>
      <Stats items={[
        { value: summary.successRate === null ? '-' : `${Math.round(summary.successRate * 100)}%`, label: 'success' },
        { value: `${summary.grown}`, label: summary.grown === 1 ? 'tree' : 'trees' },
        { value: `${currentStreak(garden.records, now)}`, label: 'day streak' },
      ]} />
    </View>

    <FocusChart period={period} anchor={anchor} records={garden.records} />

    <Group title="By tag">
      {tags.length === 0 ? <View className="px-4 py-3"><Text className="text-body text-ink-2">No focused time in this period.</Text></View> : tags.map((entry) => <View key={entry.id} className="gap-2 px-4 py-3">
        <View className="flex-row justify-between"><Text className="text-body text-ink">{entry.label}</Text><Text style={numerals} className="text-subhead text-ink-2">{formatDuration(entry.seconds)} · {Math.round((entry.seconds / summary.focusedSeconds) * 100)}%</Text></View>
        <View style={{ width: `${Math.max(2, (entry.seconds / tagMax) * 100)}%`, backgroundColor: entry.color }} className="h-2 rounded-full" />
      </View>)}
    </Group>

    <Group title="Sessions">
      {records.length === 0 ? <View className="px-4 py-3"><Text className="text-body text-ink-2">Nothing planted in this period.</Text></View> : [...records].reverse().slice(0, 30).map((entry) => <View key={entry.id} className="min-h-14 flex-row items-center gap-3 px-4 py-2">
        <TreeSprite species={entry.species} withered={entry.outcome === 'withered'} size={28} />
        <View className="flex-1">
          <Text className="text-body text-ink">{speciesById(entry.species).name}</Text>
          <Text className="text-footnote text-ink-2">{tagById(entry.tag).label} · {new Date(entry.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</Text>
        </View>
        <Text style={numerals} className={entry.outcome === 'grown' ? 'text-subhead text-ink' : 'text-subhead text-ember'}>{entry.outcome === 'grown' ? formatDuration(entry.duration) : 'Withered'}</Text>
      </View>)}
    </Group>
  </Screen>;
}

/** Single-series bar chart of focused minutes; tap a bar for its value. */
function FocusChart({ period, anchor, records }: { period: Period; anchor: number; records: Parameters<typeof focusBuckets>[0] }) {
  const buckets = focusBuckets(records, period, anchor);
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...buckets.map((bucket) => bucket.minutes));
  const ceiling = max <= 60 ? 60 : Math.ceil(max / 60) * 60;
  const labelEvery = period === 'day' ? 6 : period === 'month' ? 5 : 1;
  const picked = selected !== null ? buckets[selected] : null;
  return <View className="gap-2">
    <View className="flex-row items-baseline justify-between px-4">
      <Text accessibilityRole="header" className="text-footnote font-semibold text-ink-2">Focused minutes</Text>
      <Text style={numerals} className="text-footnote text-ink-2">{picked ? `${period === 'day' ? `${picked.label}:00` : period === 'month' ? `Day ${picked.label}` : picked.label}: ${picked.minutes} min` : `Scale ${ceiling} min`}</Text>
    </View>
    <View style={continuous} className="rounded-[20px] bg-surface px-3 pb-2 pt-4">
      <View style={{ height: CHART_HEIGHT }} className="flex-row items-end border-b border-divider" accessibilityLabel={`Focused minutes per ${period === 'day' ? 'hour' : period === 'year' ? 'month' : 'day'}`}>
        {buckets.map((bucket, index) => <Pressable key={bucket.label} accessibilityRole="button" accessibilityLabel={`${bucket.label}: ${bucket.minutes} minutes`} onPress={() => setSelected(selected === index ? null : index)} style={{ height: CHART_HEIGHT }} className="flex-1 justify-end px-px">
          {bucket.minutes > 0 ? <View style={{ height: Math.max(3, (bucket.minutes / ceiling) * CHART_HEIGHT), opacity: selected === null || selected === index ? 1 : 0.4 }} className="rounded-t-[3px] bg-moss" /> : null}
        </Pressable>)}
      </View>
      <View className="mt-1.5 flex-row">
        {buckets.map((bucket, index) => <Text key={bucket.label} numberOfLines={1} className="flex-1 text-center text-caption text-ink-2">{index % labelEvery === 0 ? (period === 'year' ? bucket.label.slice(0, 1) : bucket.label) : ''}</Text>)}
      </View>
    </View>
  </View>;
}
