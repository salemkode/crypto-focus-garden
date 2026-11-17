import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FOREST_TIERS } from '@focus-garden/protocol/forest';
import { Model3D } from '../components/Model3D';
import { PendingOperation } from '../components/PendingOperation';
import { useRewards } from '../features/rewards/RewardProvider';
import { focusHours, useSelectedMember } from '../services/community';
import { Button, Group, icons, Notice, numerals, Screen, Segmented, Stage, Stats } from '../ui';

const AMOUNTS = [1000, 5000, 20000] as const;
const AMOUNT_OPTIONS = AMOUNTS.map((value) => ({ id: String(value), label: `${value.toLocaleString()} sats` }));

/** A member's public card. Tip them by name; the app finds their wallet for you. */
export default function MemberSheet() {
  const member = useSelectedMember();
  const rewards = useRewards();
  const [amount, setAmount] = useState<number>(5000);
  if (!member) return <View className="flex-1 items-center justify-center bg-canvas"><Text className="text-body text-ink-2">Pick someone on the leaderboard.</Text></View>;
  const tier = FOREST_TIERS.find((entry) => entry.code === member.bestTier) ?? FOREST_TIERS[0];
  const canTip = Boolean(member.tipAddress) && rewards.status === 'ready' && Boolean(rewards.account) && !rewards.pending;
  function tip() {
    void Haptics.selectionAsync();
    Alert.alert(`Tip ${member!.name}?`, `${amount.toLocaleString()} sats go straight to ${member!.name}'s reward wallet, plus a 2,000-sat network fee. Chipnet coins have no cash value.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send tip', onPress: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); void rewards.transact({ action: 'tip', profile: member!.id, recipient: member!.tipAddress!, amount }); } },
    ]);
  }
  return <Screen>
    <View className="items-center gap-2">
      <Animated.View entering={ZoomIn.springify()}><Stage round style={{ width: 152, height: 152 }}><Model3D spec={{ tier: tier.key, species: 'oak', seed: member.rank * 11 }} size={148} /></Stage></Animated.View>
      <Text className="mt-2 text-title-1 text-ink">{member.name}</Text>
      <View className="flex-row items-center gap-1.5 rounded-full bg-sun-soft px-3 py-1"><Text style={numerals} className="text-footnote font-semibold text-sun-ink">Rank {member.rank}</Text></View>
      {member.about ? <Text className="px-4 text-center text-body text-ink-2">“{member.about}”</Text> : null}
    </View>
    <Stats items={[{ value: focusHours(member.points), label: 'verified focus' }, { value: `${member.trees}`, label: 'rewards' }, { value: tier.name, label: 'best reward' }]} />
    <Group title="Send a tip" footer={!member.tipAddress ? `Tips open once ${member.name} has a verified reward.` : !rewards.account ? 'Set up your helper wallet in Profile to send tips.' : 'Goes straight to their wallet. You never need their address.'}>
      <Segmented options={AMOUNT_OPTIONS} value={String(amount)} onChange={(next) => setAmount(Number(next))} />
    </Group>
    <Button label={`Tip ${member.name}`} icon={icons.heart} disabled={!canTip} onPress={tip} />
    <PendingOperation />
    {rewards.notice ? <Notice tone="error">{rewards.notice}</Notice> : null}
  </Screen>;
}
