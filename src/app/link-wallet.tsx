import { router } from 'expo-router';
import { Text } from 'react-native';
import { WalletLink } from '../components/WalletLink';
import { Screen } from '../ui';

export default function LinkWalletScreen() {
  return <Screen>
    <Text className="px-4 text-subhead text-ink-2">Your trees are sent to this wallet.</Text>
    <WalletLink onLinked={() => { if (router.canGoBack()) router.back(); }} />
  </Screen>;
}
