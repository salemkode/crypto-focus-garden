import { useEffect } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRewards } from '../features/rewards/RewardProvider';
import { Button, color, icons, Notice } from '../ui';

/**
 * The only screen before a wallet is linked. Every tree, session and profile belongs to a
 * Bitcoin Cash wallet, so nothing else in the app opens until one is connected (the root
 * layout guards every other route and sends people here).
 */
export default function ConnectScreen() {
  const rewards = useRewards();
  const linked = Boolean(rewards.recipient);

  // Once a wallet is linked (here, or restored elsewhere), go straight into the app.
  useEffect(() => {
    if (linked) router.replace('/');
  }, [linked]);

  if (rewards.status === 'opening' || linked) {
    return <SafeAreaView className="flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color={color.moss} accessibilityLabel="Opening your wallet" />
    </SafeAreaView>;
  }

  return <SafeAreaView className="flex-1 bg-canvas">
    <View className="flex-1 items-center justify-center gap-5 px-8">
      <Image source={require('../../assets/icon.png')} accessibilityIgnoresInvertColors resizeMode="contain" style={{ width: 96, height: 96, borderRadius: 24 }} />
      <View className="items-center gap-2">
        <Text accessibilityRole="header" className="text-center text-title-1 font-bold text-ink">Connect your wallet</Text>
        <Text className="text-center text-body text-ink-2">Your trees, sessions and profile live in your Bitcoin Cash wallet. Connect one to start.</Text>
      </View>
      {rewards.notice ? <Notice tone="error">{rewards.notice}</Notice> : null}
    </View>
    <View className="gap-2 px-4 pb-4">
      <Button label="Connect wallet" icon={icons.wallet} onPress={() => router.push('/link-wallet')} />
      <Button label="Restore from recovery phrase" variant="plain" icon={icons.restore} onPress={() => router.push('/restore-wallet')} />
    </View>
  </SafeAreaView>;
}
