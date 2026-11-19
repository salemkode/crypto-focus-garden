import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FOREST_TIERS } from '@focus-garden/protocol/forest';
import { Model3D } from '../components/Model3D';
import { PendingOperation, RewardNotice } from '../components/PendingOperation';
import { useRewards } from '../features/rewards/RewardProvider';
import { useSelectedMember } from '../services/community';
import { SESSION_STEP } from '../features/focus/catalog';
import { formatDuration } from '../features/focus/stats';
import { Button, EmptyState, Group, icons, numerals, Screen, Segmented, Stage, Stats } from '../ui';
import { MONEY_NOTE } from '../services/network';

const AMOUNTS = [1000, 5000, 20000] as const;
const AMOUNT_OPTIONS = AMOUNTS.map((value) => ({ id: String(value), label: `${value.toLocaleString()} sats` }));

function close() {
  if (router.canGoBack()) router.back(); else router.replace('/leaders');
}

/** A member's public card. Tip them by name; the app finds their wallet for you. */
export default function MemberSheet() {
  const member = useSelectedMember();
  const rewards = useRewards();
  const [amount, setAmount] = useState<number>(5000);
  const [sending, setSending] = useState(false);
  if (!member) return <Screen sheet={{}}>
    <EmptyState icon={icons.people} title="Nobody selected" detail="Open someone from the leaderboard" />
    <Button variant="secondary" label="Close" onPress={close} />
  </Screen>;
  const tier = FOREST_TIERS.find((entry) => entry.code === member.bestTier) ?? FOREST_TIERS[0];
  const canTip = Boolean(member.tipAddress) && rewards.status === 'ready' && Boolean(rewards.account) && !rewards.pending;
  function tip() {
    void Haptics.selectionAsync();
    Alert.alert(`Tip ${member!.name}?`, `${amount.toLocaleString()} sats go straight to ${member!.name}'s wallet from your Focus Garden wallet, plus a 2,000-sat network fee, ${MONEY_NOTE}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send tip', onPress: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSending(true);
        void rewards.transact({ action: 'tip', profile: member!.id, recipient: member!.tipAddress!, amount }).finally(() => setSending(false));
      } },
    ]);
  }
  return <Screen sheet={{}}>
    <View className="flex-row items-center gap-4">
      <Stage round style={{ width: 76, height: 76 }}><Model3D spec={{ tier: tier.key, species: 'oak', seed: member.rank * 11 }} size={74} /></Stage>
      <View className="flex-1 items-start gap-1.5">
        <Text numberOfLines={1} className="text-title-2 text-ink">{member.name}</Text>
        <View className="rounded-full bg-sun-soft px-2.5 py-0.5"><Text style={numerals} className="text-footnote font-semibold text-sun-ink">Rank {member.rank}</Text></View>
      </View>
    </View>
    {member.about ? <Text className="-mt-3 px-1 text-body text-ink-2">“{member.about}”</Text> : null}
    <View className="-mt-2 px-1"><Stats items={[
      { value: formatDuration(member.points * SESSION_STEP), label: 'verified focus' },
      { value: `${member.trees}`, label: member.trees === 1 ? 'reward' : 'rewards' },
      { value: tier.name.charAt(0) + tier.name.slice(1).toLowerCase(), label: 'best reward' },
    ]} /></View>
    <Group title="Send a tip" footer={!member.tipAddress ? `Tips open once ${member.name} has a verified reward.` : !rewards.account ? 'Set up your Focus Garden wallet in Profile to send tips.' : 'Goes straight to their wallet. A sat is the smallest unit of Bitcoin Cash.'}>
      <Segmented options={AMOUNT_OPTIONS} value={String(amount)} onChange={(next) => setAmount(Number(next))} />
    </Group>
    <Button label="Send tip" icon={icons.heart} busy={sending} disabled={!canTip} onPress={tip} />
    <PendingOperation />
    <RewardNotice />
  </Screen>;
}
