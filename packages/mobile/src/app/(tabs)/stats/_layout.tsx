import { Stack } from 'expo-router';
import { largeTitleOptions } from '../../../ui/tokens';

export default function StatsStack() {
  return <Stack screenOptions={{ ...largeTitleOptions, headerShown: false }}>
    <Stack.Screen name="index" options={{ title: 'Stats' }} />
  </Stack>;
}
