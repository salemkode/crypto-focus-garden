import { router } from 'expo-router';
import { Text } from 'react-native';
import { OnChainSession } from '../components/OnChainSession';
import { RewardActions } from '../components/RewardActions';
import { color, Group, icons, Row, Screen } from '../ui';

const INTRO = "A verified tree is a collectible on Bitcoin Cash. One public contract holds every player's trees until their focus time has passed, then sends each to its owner's wallet.";

export default function ChainScreen() {
  return <Screen>
    <Text className="px-4 text-body text-ink-2">{INTRO}</Text>
    <OnChainSession />
    <RewardActions />
    <Group>
      <Row title="Why the wait?" detail="One contract for everyone, and timing set by Bitcoin" icon={icons.hourglass} iconTint={color.sunInk} onPress={() => router.push('/on-bitcoin')} chevron />
    </Group>
  </Screen>;
}
