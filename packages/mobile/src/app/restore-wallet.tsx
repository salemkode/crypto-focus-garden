import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import { restoreNativeWallet } from '../features/wallet/wallet';
import { recoveryPhraseSchema } from '../features/wallet/mnemonic';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { restoreRawWallet, rawKeySchema } from '../features/wallet/raw-recovery';
import { savedOperation } from '../services/transactions';
import { useRewards } from '../features/rewards/RewardProvider';
import { Button, Field, Screen, Segmented } from '../ui';

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
    if (savedOperation()) { setNotice('Finish the saved operation before restoring or changing app-wallet identity.'); return; }
    const validated = (kind === 'xo' ? recoveryPhraseSchema : rawKeySchema).safeParse(phrase);
    if (!validated.success) { setNotice(validated.error.issues[0]?.message ?? 'Check the words and their order.'); return; }
    setStatus('saving'); setNotice('');
    try {
      if (kind === 'xo') await restoreNativeWallet(validated.data);
      else await restoreRawWallet(validated.data, { read: () => SecureStore.getItemAsync('focusgarden.chipnet.internal.v1'), save: (key) => SecureStore.setItemAsync('focusgarden.chipnet.internal.v1', key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }) });
      Storage.setItemSync('focusgarden.active.wallet.v1', kind);
      await rewards.open();
      setPhrase('');
      router.replace('/profile');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not save the recovery phrase. Unlock your device and retry.');
      setStatus('editing');
    }
  }
  const field = kind === 'xo'
    ? { label: 'Recovery phrase', helper: 'Your words in order, separated by spaces.', placeholder: 'Enter your words' }
    : { label: 'Early key', helper: 'The 64-character key from an early test version.', placeholder: '64 characters' };
  return <Screen>
    <Text className="px-4 text-subhead text-ink-2">Bring back your Focus Garden wallet with the backup you wrote down. It stays on this phone, in secure storage.</Text>
    <Segmented options={KINDS} value={kind} disabled={status === 'saving'} onChange={(next) => { setKind(next); setPhrase(''); setNotice(''); }} />
    <Field label={field.label} helper={field.helper} error={notice || undefined} value={phrase} onChangeText={setPhrase} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" importantForAutofill="no" maxLength={512} editable={status === 'editing'} placeholder={field.placeholder} />
    <Button label="Restore wallet" busy={status === 'saving'} disabled={phrase.trim().length === 0} onPress={restore} />
    <Text className="px-4 text-footnote text-ink-2">Restoring works only while this phone has no wallet yet; an existing wallet is never replaced. Session history from another phone does not come with it.</Text>
  </Screen>;
}
