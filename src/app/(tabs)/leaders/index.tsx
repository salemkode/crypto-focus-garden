import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FOREST_TIERS } from '@focus-garden/protocol/forest';
import { ItemView } from '../../../components/ItemView';
import { sampleLeaderboard, useSampleForest } from '../../../features/forest/samples';
import { useRewards } from '../../../features/rewards/RewardProvider';
import { fetchLeaderboard, focusHours, selectMember, type LeaderEntry } from '../../../services/community';
import { color, continuous, Group, icons, numerals, Row, Screen, Segmented, Stage } from '../../../ui';

const tierKey = (code: number) => FOREST_TIERS.find((tier) => tier.code === code)?.key ?? 'sprout';
// Podium metals: gold is the app's sun (earned); silver and bronze exist only here.
const PODIUM = [{ place: 2, height: 76, tint: '#C9D1D6' }, { place: 1, height: 108, tint: color.sun }, { place: 3, height: 56, tint: '#DDA77A' }] as const;
const PERIODS = [{ id: 'week', label: 'This week' }, { id: 'all', label: 'All time' }] as const;

/** Who focused the most this week, verified on Bitcoin Cash. Tap anyone to cheer them on with a tip. */
export default function LeadersScreen() {
  const rewards = useRewards();
  const samples = useSampleForest();
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [remote, setRemote] = useState<{ period: 'week' | 'all'; entries: LeaderEntry[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const connected = rewards.data.state === 'connected';
  const useSamples = samples !== null && __DEV__;
  useEffect(() => {
    if (useSamples || !connected) return;
    let active = true;
    fetchLeaderboard(period)
      .then((result) => { if (active) { setRemote(result); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [connected, period, useSamples, reload]);
  const entries = useSamples ? sampleLeaderboard() : !connected ? [] : remote?.period === period ? remote.entries : null;
  const state = useSamples ? 'ready' : !connected || failed ? 'offline' : entries === null ? 'loading' : 'ready';
  const load = () => setReload((value) => value + 1);

  const list = entries ?? [];
  const top = PODIUM.map((slot) => ({ ...slot, entry: list[slot.place - 1] })).filter((slot) => slot.entry);
  function open(entry: LeaderEntry) {
    void Haptics.selectionAsync();
    selectMember(entry);
    router.push('/member');
  }

  return <Screen title="Leaders" onRefresh={load} refreshing={state === 'loading' && entries !== null}>
    <Segmented options={PERIODS} value={period} onChange={setPeriod} />

    {state === 'loading' && entries === null ? <ActivityIndicator className="mt-10" color={color.moss} /> : null}

    {top.length > 0 ? <Stage className="flex-row items-end justify-center gap-3 px-4 pt-8">
      {top.map(({ place, height, tint, entry }, index) => <Animated.View key={place} entering={FadeInUp.delay(index * 120).springify()} className="flex-1">
        <Pressable accessibilityRole="button" accessibilityLabel={`${place === 1 ? 'First' : place === 2 ? 'Second' : 'Third'} place, ${entry!.name}, ${focusHours(entry!.points)}`} onPress={() => open(entry!)} className="items-center active:opacity-70">
          <ItemView tier={tierKey(entry!.bestTier)} species="oak" seed={place * 11} size={place === 1 ? 76 : 60} />
          <Text numberOfLines={1} className="mt-1 text-subhead font-semibold text-ink">{entry!.name}</Text>
          <Text style={numerals} className="text-footnote text-ink-2">{focusHours(entry!.points)}</Text>
          <View style={[continuous, { height, backgroundColor: tint }]} className="mt-2 w-full items-center rounded-t-2xl pt-2"><Text style={numerals} className="text-title-2 text-ink">{place}</Text></View>
        </Pressable>
      </Animated.View>)}
    </Stage> : null}

    {list.length > 3 ? <Group>
      {list.slice(3).map((entry, index) => <Animated.View key={entry.id} entering={FadeInDown.delay(index * 40)}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Rank ${entry.rank}, ${entry.name}, ${focusHours(entry.points)}`} onPress={() => open(entry)} className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:bg-sunk">
          <Text style={numerals} className="w-7 text-center text-headline text-ink-2">{entry.rank}</Text>
          <Stage style={{ width: 40, height: 46 }}><ItemView tier={tierKey(entry.bestTier)} species="oak" seed={entry.rank * 7} size={34} /></Stage>
          <View className="flex-1"><Text className="text-body text-ink">{entry.name}</Text><Text numberOfLines={1} className="text-footnote text-ink-2">{entry.about || `${entry.trees} rewards`}</Text></View>
          <Text style={numerals} className="text-headline text-ink">{focusHours(entry.points)}</Text>
        </Pressable>
      </Animated.View>)}
    </Group> : null}

    {state !== 'loading' && list.length === 0 ? <Group footer={state === 'offline' ? 'The leaderboard lives on Bitcoin Cash.' : undefined}>
      <Row icon={icons.person} title={state === 'offline' ? 'Connect to see the leaderboard' : 'Be the first on the board'}
        detail={state === 'offline' ? 'Set up your helper wallet in Profile' : 'Create a public profile in Profile'} onPress={() => router.push('/profile')} chevron />
    </Group> : null}

    {list.length ? <Text className="px-4 text-footnote text-ink-2">Ranked by verified focus. Merging never changes a score.</Text> : null}
  </Screen>;
}
