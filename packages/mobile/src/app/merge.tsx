import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FOREST_TIERS, parseTree } from '@focus-garden/protocol/forest';
import { ItemView } from '../components/ItemView';
import { PendingOperation, RewardNotice } from '../components/PendingOperation';
import { nftTree } from '../features/forest/nft-style';
import { sampleRewardSessions, useSampleForest } from '../features/forest/samples';
import { useRewards } from '../features/rewards/RewardProvider';
import { mergeableTrees } from '../services/garden';
import { Arc, Button, color, continuous, Icon, icons, Notice, numerals, Screen, Stage } from '../ui';
import { MONEY_NOTE } from '../services/network';

const STEPS = FOREST_TIERS.filter((tier) => tier.mergeCount).map((tier) => ({ from: tier, to: FOREST_TIERS.find((next) => next.code === tier.code + 1)! }));

/** Turn small focus rewards into bigger ones. Value is kept: the score never changes. */
export default function MergeScreen() {
  const rewards = useRewards();
  const samples = useSampleForest();
  const sessions = samples !== null ? sampleRewardSessions(samples) : rewards.data.state === 'connected' ? rewards.data.sessions : [];
  const matured = mergeableTrees(sessions).sort((a, b) => a.plantedAt - b.plantedAt);
  const enabled = samples === null && rewards.status === 'ready' && Boolean(rewards.account) && !rewards.pending && rewards.freshness === 'current';
  const [refreshing, setRefreshing] = useState(false);
  /** The recipe whose merge this screen started, for its loading state. */
  const [merging, setMerging] = useState<number | null>(null);
  function refresh() {
    if (samples !== null || rewards.status !== 'ready' || !rewards.account) return;
    setRefreshing(true);
    void rewards.refresh().finally(() => setRefreshing(false));
  }
  // Recipes that can merge now. Only the first gets the primary button; any others are secondary.
  const possible = samples === null ? STEPS.filter(({ from }) => matured.filter((session) => parseTree(session.commitment)?.tier === from.code).length >= from.mergeCount!).map(({ from }) => from.code) : [];

  function confirm(code: number, ingredients: string[], result: string, source: string) {
    void Haptics.selectionAsync();
    Alert.alert(`Merge into a ${result.toLowerCase()}?`, `${ingredients.length} ${source.toLowerCase()}s become one ${result.toLowerCase()}, which shows up in Verified trees. Your verified focus score stays the same. This can't be undone.\n\nCost: a 2,000-sat network fee, ${MONEY_NOTE}.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Merge', onPress: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMerging(code);
        void rewards.transact({ action: 'merge', commitments: ingredients }).finally(() => setMerging(null));
      } },
    ]);
  }

  return <Screen onRefresh={samples === null && rewards.account ? refresh : undefined} refreshing={refreshing}>
    {samples !== null ? <Notice tone="warning">Sample forest for preview only. Merging is off.</Notice> : null}
    <Text className="px-4 text-subhead text-ink-2">Combine grown trees into the next size. Your focus score stays the same.</Text>
    <PendingOperation />
    {rewards.freshness !== 'current' && samples === null && possible.length ? <Notice tone="warning">Pull down to refresh before merging.</Notice> : null}
    {STEPS.map(({ from, to }) => {
      const ready = matured.filter((session) => parseTree(session.commitment)?.tier === from.code);
      const ingredients = ready.slice(0, from.mergeCount).map((session) => session.commitment);
      const first = ingredients[0] ? nftTree(ingredients[0]) : null;
      const enough = ingredients.length === from.mergeCount;
      const have = Math.min(ready.length, from.mergeCount!);
      const plural = (count: number) => `${from.name.toLowerCase()}${count === 1 ? '' : 's'}`;
      const progress = enough ? 'Ready to merge' : `${have} of ${from.mergeCount} ${plural(from.mergeCount!)} grown`;
      return <View key={from.code} style={continuous} className="gap-4 rounded-[20px] bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <Stage className="flex-1 flex-row items-end justify-center pb-1" style={{ height: 96 }}>
            {Array.from({ length: from.mergeCount! }, (_, index) => <View key={index} style={{ marginLeft: index ? -16 : 0, opacity: index < ready.length ? 1 : 0.3 }}><ItemView tier={from.key} species={first?.localSpecies ?? 'oak'} seed={index + 2} size={44} /></View>)}
          </Stage>
          <Icon name={icons.chevron} size={16} tint={color.ink3} weight="bold" />
          <Stage style={{ width: 96, height: 96 }}><ItemView tier={to.key} species={first?.localSpecies ?? 'oak'} seed={7} size={70} /></Stage>
        </View>
        <View className="flex-row items-center gap-3">
          <Arc progress={have / from.mergeCount!} size={28} stroke={3} accessibilityLabel={progress} />
          <View className="flex-1">
            <Text className="text-headline text-ink">{from.mergeCount} {plural(from.mergeCount!)} into a {to.name.toLowerCase()}</Text>
            <Text style={numerals} className="text-footnote text-ink-2">{progress}</Text>
          </View>
        </View>
        {enough && samples === null ? <Button variant={possible[0] === from.code ? 'primary' : 'secondary'} label={`Merge into a ${to.name.toLowerCase()}`} busy={merging === from.code} disabled={!enabled} onPress={() => confirm(from.code, ingredients, to.name, from.name)} /> : null}
      </View>;
    })}
    {samples === null ? <RewardNotice /> : null}
  </Screen>;
}
