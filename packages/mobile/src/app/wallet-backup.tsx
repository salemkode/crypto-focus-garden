import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { readRecoveryPhrase } from '../features/wallet/wallet';
import { useRewards } from '../features/rewards/RewardProvider';
import { Button, color, continuous, Group, Icon, icons, Notice, numerals, Row, Screen } from '../ui';

export default function WalletBackupScreen() {
  const rewards = useRewards();
  const [secret, setSecret] = useState('');
  const [notice, setNotice] = useState('');
  const [state, setState] = useState<'hidden' | 'unlocking' | 'visible'>('hidden');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const listener = AppState.addEventListener('change', (next) => {
      if (next !== 'active') { setSecret(''); setState('hidden'); }
    });
    return () => {
      active.current = false; listener.remove();
      void ScreenCapture.allowScreenCaptureAsync('focus-garden-backup').catch(() => undefined);
      if (Platform.OS === 'ios') void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    if (state !== 'visible') return;
    const timeout = setTimeout(() => { setSecret(''); setState('hidden'); }, 60000);
    return () => clearTimeout(timeout);
  }, [state]);
  async function reveal() {
    if (state !== 'hidden' || !rewards.account) return;
    setState('unlocking'); setNotice('');
    try {
      await ScreenCapture.preventScreenCaptureAsync('focus-garden-backup');
      if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync();
      if (await LocalAuthentication.getEnrolledLevelAsync() === LocalAuthentication.SecurityLevel.NONE) {
        setNotice('Set a device passcode or biometric unlock before viewing a wallet backup.'); setState('hidden'); return;
      }
      const unlocked = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your Focus Garden backup', cancelLabel: 'Cancel', disableDeviceFallback: false });
      if (!unlocked.success || !active.current || AppState.currentState !== 'active') { setState('hidden'); return; }
      const backup = rewards.account.kind === 'foundation' ? await SecureStore.getItemAsync('focusgarden.chipnet.internal.v1') : await readRecoveryPhrase();
      if (!backup) { setNotice('The original backup is unavailable. No key has been replaced.'); setState('hidden'); return; }
      if (!active.current || AppState.currentState !== 'active') return;
      setSecret(backup); setState('visible');
    } catch { setSecret(''); setState('hidden'); setNotice('Secure backup could not open on this device. Your wallet has not been changed.'); }
  }
  const what = rewards.account?.kind === 'foundation' ? 'key' : 'recovery phrase';
  return <Screen contentClassName="pt-4">
    <View className="items-center gap-3 px-4 pt-2">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-moss-soft"><Icon name={icons.key} size={24} tint={color.moss} /></View>
      <Text className="text-center text-body text-ink-2">Anyone with this {what} can use your helper wallet. Write it down and keep it private. Focus Garden will never ask for it.</Text>
    </View>
    {state === 'visible' ? <View className="gap-3">
      <View style={continuous} className="rounded-[20px] bg-surface p-5">
        <Text selectable={false} style={numerals} className="text-title-3 font-medium leading-8 text-ink" accessibilityLabel="Sensitive wallet backup">{secret}</Text>
      </View>
      <Text className="px-4 text-footnote text-ink-2">Hides after one minute or when you leave the app. Do not take a photo of it.</Text>
      <Button variant="secondary" label="Hide backup" onPress={() => { setSecret(''); setState('hidden'); }} />
    </View> : <Button label="Unlock and show backup" icon={icons.lock} busy={state === 'unlocking'} disabled={!rewards.account} onPress={reveal} />}
    {notice ? <Notice tone="error">{notice}</Notice> : null}
    {rewards.account ? <Group title="Helper wallet address">
      <Row title={rewards.account.address} accessibilityLabel="Helper wallet address" />
    </Group> : null}
  </Screen>;
}
