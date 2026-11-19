import '../../global.css';
import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Animated from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import { StatusBar } from 'expo-status-bar';
import { ModelSnapshotHost } from '../components/ModelSnapshots';
import { FocusProvider } from '../features/focus/FocusProvider';
import { RewardProvider, useRewards } from '../features/rewards/RewardProvider';
import { isOnboarded } from '../features/profile/local';
import { headerOptions, sheetOptions } from '../ui/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
// Let Tailwind classes style animated views the same way as plain views.
cssInterop(Animated.View, { className: 'style' });
// Open the introduction once per launch, even if effects run twice in development.
let introductionOpened = false;

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
    // First launch: a short introduction before the first tree.
    if (!isOnboarded() && !introductionOpened) {
      introductionOpened = true;
      setTimeout(() => router.push('/welcome'), 0);
    }
  }, []);
  return <ModelSnapshotHost><FocusProvider><RewardProvider>
    <StatusBar style="dark" />
    <GatedStack />
  </RewardProvider></FocusProvider></ModelSnapshotHost>;
}

/**
 * Nothing in Focus Garden works without a wallet: every tree, session and profile belongs to one.
 * Until a wallet is linked, only the introduction and the wallet screens open; every other route,
 * deep links and web URLs included, goes to /connect.
 */
function GatedStack() {
  const rewards = useRewards();
  const linked = Boolean(rewards.recipient);
  return <Stack screenOptions={{ ...headerOptions, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Protected guard={linked} redirectTo="/connect">
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="session" options={{ title: 'Next session', presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, ...sheetOptions }} />
      {/* The member card starts with the member's name, so the sheet has no empty title bar. */}
      <Stack.Screen name="member" options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, ...sheetOptions }} />
      <Stack.Screen name="species" options={{ title: 'Tree styles', presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ title: 'Focus rules', presentation: 'modal' }} />
      <Stack.Screen name="blocked-apps" options={{ title: 'Blocked apps' }} />
      <Stack.Screen name="on-bitcoin" options={{ title: 'On Bitcoin Cash', presentation: 'modal' }} />
      <Stack.Screen name="chain" options={{ title: 'Verified trees', headerLargeTitle: true }} />
      <Stack.Screen name="merge" options={{ title: 'Merge workshop', headerLargeTitle: true }} />
    </Stack.Protected>
    <Stack.Screen name="connect" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
    <Stack.Screen name="welcome" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
    {/* Sheet heights are fixed fractions: 'fitToContents' cannot measure a SwiftUI form (it scrolls
        and has no intrinsic height). Each sheet opens at roughly its content and can grow to full. */}
    <Stack.Screen name="link-wallet" options={{ title: 'Your wallet', presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, ...sheetOptions }} />
    <Stack.Screen name="wallet-backup" options={{ title: 'Back up wallet', presentation: 'modal' }} />
    <Stack.Screen name="restore-wallet" options={{ title: 'Restore wallet', presentation: 'modal' }} />
  </Stack>;
}
