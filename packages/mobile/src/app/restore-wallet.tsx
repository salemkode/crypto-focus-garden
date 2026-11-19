import { internalWalletKey, activeWalletKey } from '../services/network';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { restoreNativeWallet } from '../features/wallet/wallet';
import { recoveryPhraseSchema } from '../features/wallet/mnemonic';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { restoreRawWallet, rawKeySchema } from '../features/wallet/raw-recovery';
import { savedOperation } from '../services/transactions';
import { useRewards } from '../features/rewards/RewardProvider';
import { Button, Field, Notice, Screen, Segmented } from '../ui';

const KINDS = [{ id: 'xo', label: 'Recovery phrase' }, { id: 'foundation', label: 'Early key' }] as const;

export default function RestoreWalletScreen() {
  const rewards = useRewards();
  const [kind, setKind] = useState<'xo' | 'foundation'>('xo');
  const [phrase, setPhrase] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<'editing' | 'saving'>('editing');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') setPhrase('');
    });
    return () => subscription.remove();
  }, []);
  async function restore() {
    if (savedOperation()) { setNotice('Finish the unfinished transaction in Profile first. Restoring waits until nothing is in progress.'); return; }
    const validated = (kind === 'xo' ? recoveryPhraseSchema : rawKeySchema).safeParse(phrase);
    if (!validated.success) { setNotice(validated.error.issues[0]?.message ?? 'Check the words and their order.'); return; }
    setStatus('saving'); setNotice('');
    try {
      if (kind === 'xo') await restoreNativeWallet(validated.data);
      else await restoreRawWallet(validated.data, { read: () => SecureStore.getItemAsync(internalWalletKey), save: (key) => SecureStore.setItemAsync(internalWalletKey, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }) });
      Storage.setItemSync(activeWalletKey, kind);
      await rewards.open();
      setPhrase('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/profile');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not save the recovery phrase. Unlock your device and retry.');
      setStatus('editing');
    }
  }
  const field = kind === 'xo'
    ? { label: 'Recovery phrase', helper: 'Your words in order, separated by spaces.', placeholder: 'Enter your words' }
    : { label: 'Early key', helper: 'The 64-character key from an early test version.', placeholder: '64 characters' };
  // Display only: the restore functions keep their own no-replace guard. This shows the case the
  // app already knows about (the open wallet is of the selected kind) before anything is typed.
  const exists = rewards.account?.kind === kind;
  return <Screen>
    <Segmented options={KINDS} value={kind} disabled={status === 'saving'} onChange={(next) => { setKind(next); setPhrase(''); setNotice(''); }} />
    {exists ? <Notice>{kind === 'xo' ? 'This phone already has a Focus Garden wallet. Restoring never replaces it.' : 'This phone already has an early key. Restoring never replaces it.'}</Notice> : null}
    <Field label={field.label} helper={field.helper} error={notice || undefined} value={phrase} onChangeText={setPhrase} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" importantForAutofill="no" maxLength={512} editable={status === 'editing' && !exists} placeholder={field.placeholder} />
    <Button label="Restore wallet" busy={status === 'saving'} disabled={exists || phrase.trim().length === 0} onPress={restore} />
    <Text className="px-4 text-footnote text-ink-2">{"The wallet stays in this phone's secure storage. Session history from another phone doesn't come with it."}</Text>
  </Screen>;
}
