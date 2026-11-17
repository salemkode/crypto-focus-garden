import { Stack } from 'expo-router';
import { largeTitleOptions } from '../../../ui/tokens';

export default function ProfileStack() {
  return <Stack screenOptions={{ ...largeTitleOptions, headerShown: false }}>
    <Stack.Screen name="index" options={{ title: 'Profile' }} />
  </Stack>;
}
