import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { FOREST_TIERS } from '@focus-garden/protocol/forest';
import { ItemView } from '../../../components/ItemView';
import { SESSION_STEP } from '../../../features/focus/catalog';
import { formatDuration } from '../../../features/focus/stats';
import { sampleLeaderboard, useSampleForest } from '../../../features/forest/samples';
import { useRewards } from '../../../features/rewards/RewardProvider';
import { fetchLeaderboard, fetchProfile, selectMember, type LeaderEntry } from '../../../services/community';
import { color, continuous, EmptyState, Footnote, Group, icons, numerals, Screen, Segmented, Stage } from '../../../ui';

const tierKey = (code: number) => FOREST_TIERS.find((tier) => tier.code === code)?.key ?? 'sprout';
// Podium metals: gold is the app's sun (earned); silver and bronze exist only here.
const PODIUM = [{ place: 2, height: 76, tint: '#C9D1D6' }, { place: 1, height: 108, tint: color.sun }, { place: 3, height: 56, tint: '#DDA77A' }] as const;
const PERIODS = [{ id: 'week', label: 'This week' }, { id: 'all', label: 'All time' }] as const;
/** Verified focus in the app's one duration format. A point is one 512-second lock step. */
const focused = (points: number) => formatDuration(points * SESSION_STEP);

/** Who focused the most this week, verified on Bitcoin Cash. Tap anyone to cheer them on with a tip. */
export default function LeadersScreen() {
  const rewards = useRewards();
  const samples = useSampleForest();
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [remote, setRemote] = useState<{ period: 'week' | 'all'; entries: LeaderEntry[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  /** A pull to refresh or retry is in flight, so the spinner stays until the board answers. */
  const [refreshing, setRefreshing] = useState(false);
  /** Your own leaderboard entry, kept with the wallet it was read for so another wallet never shows it. */
  const [me, setMe] = useState<{ wallet: string; id: string; state: 'pending' | 'public' } | null>(null);
  // The leaderboard is read through the Focus Garden wallet's service session.
  const connected = rewards.data.state === 'connected';
  const useSamples = samples !== null && __DEV__;
  const wallet = connected ? rewards.account?.address : undefined;
  // No fetch runs while disconnected (or on samples), so a pull cut short there must not spin forever.
  if (refreshing && (useSamples || !connected)) setRefreshing(false);
  // A different wallet (or none) is not "you" until its own profile has been read.
  if (me && me.wallet !== wallet) setMe(null);
  useEffect(() => {
    if (useSamples || !connected) return;
    let active = true;
    fetchLeaderboard(period)
      .then((result) => { if (active) { setRemote(result); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [connected, period, useSamples, reload]);
  useEffect(() => {
    if (useSamples || !wallet) return;
    let active = true;
    fetchProfile(wallet).then((result) => { if (active) setMe(result.state === 'none' ? null : { wallet, id: result.id, state: result.state }); }).catch(() => undefined);
    return () => { active = false; };
  }, [wallet, useSamples, reload]);

  const entries = useSamples ? sampleLeaderboard() : !connected ? [] : remote?.period === period ? remote.entries : null;
  const opening = rewards.status === 'opening' || (Boolean(rewards.account) && !connected && rewards.status === 'busy');
  const state = useSamples ? 'ready'
    : !connected ? (opening ? 'loading' : rewards.account ? 'offline' : 'setup')
    : failed ? 'offline' : entries === null ? 'loading' : 'ready';
  function load() {
    if (connected) {
      // Show progress at once: the retry row gives way to the spinner, a pull keeps its spinner.
      setFailed(false);
      setRefreshing(entries !== null);
      setReload((value) => value + 1);
    } else if (rewards.account) void rewards.refresh();
  }

  const list = entries ?? [];
  const mine = (entry: LeaderEntry) => !useSamples && me?.id === entry.id;
  const top = PODIUM.map((slot) => ({ ...slot, entry: list[slot.place - 1] })).filter((slot) => slot.entry);
  function open(entry: LeaderEntry) {
    selectMember(entry);
    router.push('/member');
  }

  return <Screen title="Leaders" onRefresh={load} refreshing={refreshing || (state === 'loading' && entries !== null)}>
    {state === 'ready' || (connected && state === 'loading') ? <Segmented options={PERIODS} value={period} onChange={setPeriod} /> : null}

    {state === 'loading' && list.length === 0 ? <ActivityIndicator className="mt-10" color={color.moss} /> : null}

    {top.length > 0 ? <Stage className="flex-row items-end justify-center gap-3 px-4 pt-8">
      {top.map(({ place, height, tint, entry }, index) => <Animated.View key={place} entering={FadeInUp.delay(index * 120).springify()} className="flex-1">
        <Pressable accessibilityRole="button" accessibilityLabel={`${place === 1 ? 'First' : place === 2 ? 'Second' : 'Third'} place, ${mine(entry!) ? 'you' : entry!.name}, ${focused(entry!.points)}`} onPress={() => open(entry!)} className="items-center active:opacity-70">
          <ItemView tier={tierKey(entry!.bestTier)} species="oak" seed={place * 11} size={place === 1 ? 76 : 60} />
          <Text numberOfLines={1} className="mt-1 text-subhead font-semibold text-ink">{entry!.name}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={numerals} className="text-footnote text-ink-2">{mine(entry!) ? `You · ${focused(entry!.points)}` : focused(entry!.points)}</Text>
          <View style={[continuous, { height, backgroundColor: tint }]} className="mt-2 w-full items-center rounded-t-2xl pt-2"><Text style={numerals} className="text-title-2 text-ink">{place}</Text></View>
        </Pressable>
      </Animated.View>)}
    </Stage> : null}

    {list.length > 3 ? <Group footer="Ranked by verified focus.">
      {list.slice(3).map((entry, index) => <Animated.View key={entry.id} entering={FadeInDown.delay(index * 40)}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Rank ${entry.rank}, ${mine(entry) ? 'you' : entry.name}, ${focused(entry.points)}`} onPress={() => open(entry)}
          className={mine(entry) ? 'min-h-14 flex-row items-center gap-3 bg-sun-soft px-4 py-2 active:bg-sunk' : 'min-h-14 flex-row items-center gap-3 px-4 py-2 active:bg-sunk'}>
          <Text style={numerals} className="w-8 text-center text-headline text-sun-ink">{entry.rank}</Text>
          <Stage style={{ width: 40, height: 46 }}><ItemView tier={tierKey(entry.bestTier)} species="oak" seed={entry.rank * 7} size={34} /></Stage>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-body text-ink">{entry.name}</Text>
            <Text numberOfLines={1} className="text-footnote text-ink-2">{mine(entry) ? 'You' : entry.about || `${entry.trees} ${entry.trees === 1 ? 'reward' : 'rewards'}`}</Text>
          </View>
          <Text style={numerals} className="text-headline text-ink">{focused(entry.points)}</Text>
        </Pressable>
      </Animated.View>)}
    </Group> : list.length ? <Footnote>Ranked by verified focus.</Footnote> : null}

    {state === 'setup' ? <EmptyState icon={icons.wallet} title="Set up your Focus Garden wallet" detail="Needed to see the leaderboard" onPress={() => router.navigate('/profile')} /> : null}

    {state === 'offline' ? <EmptyState icon={icons.refresh} title="Try again" detail="The leaderboard didn't load" onPress={load} chevron={false} disabled={rewards.status === 'busy'} /> : null}

    {state === 'ready' && list.length === 0 ? (me
      ? <EmptyState icon={icons.tree} title="Plant a verified tree" detail={`Nobody is on the board ${period === 'week' ? 'this week' : 'yet'}`} onPress={() => router.navigate('/')} />
      : <EmptyState icon={icons.globe} title="Join the leaderboard" detail={`Nobody is on the board ${period === 'week' ? 'this week' : 'yet'}`} onPress={() => router.navigate({ pathname: '/profile', params: { join: '1' } })} />) : null}
  </Screen>;
}
