import { Alert, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FOREST_TIERS, parseTree } from '@focus-garden/protocol/forest';
import { ItemView } from '../components/ItemView';
import { PendingOperation } from '../components/PendingOperation';
import { nftTree } from '../features/forest/nft-style';
import { sampleRewardSessions, useSampleForest } from '../features/forest/samples';
import { useRewards } from '../features/rewards/RewardProvider';
import { mergeableTrees } from '../services/garden';
import { Button, color, continuous, Icon, icons, Notice, numerals, Screen, Stage } from '../ui';

const STEPS = FOREST_TIERS.filter((tier) => tier.mergeCount).map((tier) => ({ from: tier, to: FOREST_TIERS.find((next) => next.code === tier.code + 1)! }));

/** Turn small focus rewards into bigger ones. Value is kept: the score never changes. */
export default function MergeScreen() {
  const rewards = useRewards();
  const samples = useSampleForest();
  const sessions = samples !== null ? sampleRewardSessions(samples) : rewards.data.state === 'connected' ? rewards.data.sessions : [];
  const matured = mergeableTrees(sessions).sort((a, b) => a.plantedAt - b.plantedAt);
  const enabled = samples === null && rewards.status === 'ready' && Boolean(rewards.account) && !rewards.pending && rewards.freshness === 'current';

  function confirm(ingredients: string[], result: string) {
    void Haptics.selectionAsync();
    Alert.alert(`Grow a ${result}?`, `${ingredients.length} items are combined into one ${result}. Your verified focus score stays the same. This cannot be undone.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Merge', onPress: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); void rewards.transact({ action: 'merge', commitments: ingredients }); } },
    ]);
  }

  return <Screen>
    {samples !== null ? <Notice tone="warning">Sample forest for preview only. Merging is off.</Notice> : null}
    <Text className="px-4 text-body text-ink-2">Combine fully grown pieces into the next size up. Your verified focus score stays the same.</Text>
    <PendingOperation />
    {STEPS.map(({ from, to }) => {
      const ready = matured.filter((session) => parseTree(session.commitment)?.tier === from.code);
      const ingredients = ready.slice(0, from.mergeCount).map((session) => session.commitment);
      const first = ingredients[0] ? nftTree(ingredients[0]) : null;
      const enough = ingredients.length === from.mergeCount;
      const missing = from.mergeCount! - ready.length;
      return <View key={from.code} style={continuous} className="gap-4 rounded-[20px] bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <Stage className="flex-1 flex-row items-end justify-center pb-1" style={{ height: 96 }}>
            {Array.from({ length: from.mergeCount! }, (_, index) => <View key={index} style={{ marginLeft: index ? -16 : 0, opacity: index < ready.length ? 1 : 0.3 }}><ItemView tier={from.key} species={first?.localSpecies ?? 'oak'} seed={index + 2} size={44} /></View>)}
          </Stage>
          <Icon name={icons.chevron} size={16} tint={color.ink3} weight="bold" />
          <Stage style={{ width: 96, height: 96 }}><ItemView tier={to.key} species={first?.localSpecies ?? 'oak'} seed={7} size={70} /></Stage>
        </View>
        <View className="flex-row items-end justify-between gap-3">
          <View className="flex-1">
            <Text className="text-headline text-ink">{from.mergeCount} {from.name.toLowerCase()}s into a {to.name.toLowerCase()}</Text>
            <Text style={numerals} className="text-footnote text-ink-2">{Math.min(ready.length, from.mergeCount!)} of {from.mergeCount} ready · worth {to.points} focus units</Text>
          </View>
        </View>
        <Button variant={to.key === 'house' ? 'sun' : 'primary'} label={enough ? `Grow a ${to.name.toLowerCase()}` : `Grow ${missing} more ${from.name.toLowerCase()}${missing === 1 ? '' : 's'}`} disabled={!enabled || !enough} onPress={() => confirm(ingredients, to.name)} />
      </View>;
    })}
    {rewards.notice && samples === null ? <Notice tone="error">{rewards.notice}</Notice> : null}
  </Screen>;
}
