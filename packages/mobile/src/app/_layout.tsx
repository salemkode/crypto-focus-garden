import '../../global.css';
import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Animated from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import { StatusBar } from 'expo-status-bar';
import { ModelSnapshotHost } from '../components/ModelSnapshots';
import { FocusProvider } from '../features/focus/FocusProvider';
import { RewardProvider } from '../features/rewards/RewardProvider';
import { isOnboarded } from '../features/profile/local';
import { headerOptions } from '../ui/tokens';

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
    <Stack screenOptions={{ ...headerOptions, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="session" options={{ title: 'Next session', presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true }} />
      <Stack.Screen name="member" options={{ title: '', presentation: 'formSheet', sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true }} />
      <Stack.Screen name="species" options={{ title: 'Tree styles', presentation: 'modal' }} />
      <Stack.Screen name="link-wallet" options={{ title: 'Your wallet', presentation: 'formSheet', sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true }} />
      <Stack.Screen name="settings" options={{ title: 'Focus rules', presentation: 'modal' }} />
      <Stack.Screen name="blocked-apps" options={{ title: 'Blocked apps' }} />
      <Stack.Screen name="on-bitcoin" options={{ title: 'On Bitcoin Cash', presentation: 'modal' }} />
      <Stack.Screen name="chain" options={{ title: 'Verified rewards', headerLargeTitle: true }} />
      <Stack.Screen name="merge" options={{ title: 'Merge workshop', headerLargeTitle: true }} />
      <Stack.Screen name="wallet-backup" options={{ title: 'Back up wallet', presentation: 'modal' }} />
      <Stack.Screen name="restore-wallet" options={{ title: 'Restore wallet', presentation: 'modal' }} />
    </Stack>
  </RewardProvider></FocusProvider></ModelSnapshotHost>;
}
