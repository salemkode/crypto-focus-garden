import { useState } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { OnChainSession } from '../components/OnChainSession';
import { RewardActions } from '../components/RewardActions';
import { useRewards } from '../features/rewards/RewardProvider';
import { color, Group, icons, Row, Screen } from '../ui';

export default function ChainScreen() {
  const rewards = useRewards();
  const [refreshing, setRefreshing] = useState(false);
  function refresh() {
    // Same guard as the refresh rows: only when the wallet is open and nothing else is running.
    if (rewards.status !== 'ready' || !rewards.account) return;
    setRefreshing(true);
    void rewards.refresh().finally(() => setRefreshing(false));
  }
  return <Screen onRefresh={rewards.account ? refresh : undefined} refreshing={refreshing}>
    <Text className="px-4 text-subhead text-ink-2">Grow trees on the Bitcoin Cash test network and keep them in your wallet.</Text>
    <OnChainSession />
    <RewardActions />
    <Group>
      <Row title="Why the wait?" icon={icons.hourglass} iconTint={color.ink2} onPress={() => router.push('/on-bitcoin')} chevron />
    </Group>
  </Screen>;
}
