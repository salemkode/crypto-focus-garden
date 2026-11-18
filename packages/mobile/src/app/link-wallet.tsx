import { router } from 'expo-router';
import { WalletLink } from '../components/WalletLink';
import { Screen } from '../ui';

export default function LinkWalletScreen() {
  return <Screen>
    <WalletLink onLinked={() => { if (router.canGoBack()) router.back(); }} />
  </Screen>;
}
