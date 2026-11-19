import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { readRecoveryPhrase } from '../features/wallet/wallet';
import { useRewards } from '../features/rewards/RewardProvider';
import { Button, continuous, Group, icons, Notice, numerals, Row, Screen } from '../ui';

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
  const words = rewards.account?.kind === 'foundation' ? [] : secret.trim().split(/\s+/).filter(Boolean);
  return <Screen>
    <Notice tone="warning">{`Anyone with this ${what} can use your Focus Garden wallet. Keep it private; Focus Garden will never ask for it.`}</Notice>
    {state === 'visible' ? <View className="gap-3">
      <View style={continuous} className="rounded-[20px] bg-surface p-4" accessible accessibilityLabel={`Your ${what} is on screen. It is not read aloud, to keep it private.`}>
        {words.length ? <View className="flex-row flex-wrap">
          {words.map((word, index) => <View key={index} className="w-1/2 flex-row items-baseline gap-2 py-1.5 pr-2">
            <Text selectable={false} style={numerals} className="w-6 text-right text-footnote text-ink-3">{index + 1}</Text>
            <Text selectable={false} className="flex-1 text-headline text-ink">{word}</Text>
          </View>)}
        </View> : <Text selectable={false} style={numerals} className="text-title-3 font-medium leading-8 text-ink">{secret}</Text>}
      </View>
      <Text className="px-4 text-footnote text-ink-2">{`Write it down on paper${words.length ? ', in order,' : ''} and keep it offline. It hides after one minute or when you leave the app.`}</Text>
      <Button variant="secondary" label={`Hide ${what}`} onPress={() => { setSecret(''); setState('hidden'); }} />
    </View> : <Button label={`Show ${what}`} icon={icons.lock} busy={state === 'unlocking'} disabled={!rewards.account} onPress={reveal} />}
    {notice ? <Notice tone="error">{notice}</Notice> : null}
    {rewards.account ? <Group title="Focus Garden wallet address">
      <Row title={rewards.account.address} accessibilityLabel="Focus Garden wallet address" />
    </Group> : null}
  </Screen>;
}
