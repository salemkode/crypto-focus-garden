import { router } from 'expo-router';
import { WalletLink } from '../components/WalletLink';
import { Screen } from '../ui';

export default function LinkWalletScreen() {
  return <Screen sheet={{ title: 'Your wallet' }}>
    <WalletLink onLinked={() => { if (router.canGoBack()) router.back(); }} />
  </Screen>;
}
