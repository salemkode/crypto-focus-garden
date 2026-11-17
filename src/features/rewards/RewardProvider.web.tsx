import { createContext, useContext, useState, type ReactNode } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { GardenTransactionError } from '@focus-garden/protocol';
import { parseRewardAddress } from '../../wallet/address';

const recipientKey = 'focusgarden.public.recipient.chipnet';

function useWebRewards() {
  const [recipient, setRecipient] = useState(() => Storage.getItemSync(recipientKey) ?? '');
  const [notice, setNotice] = useState('');
  async function saveRecipient(input: string) {
    try {
      const parsed = parseRewardAddress(input.trim());
      Storage.setItemSync(recipientKey, parsed.address);
      setRecipient(parsed.address);
      setNotice('Wallet linked. Local sessions are available; verified rewards require the native app.');
      return true;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not link this address.');
      return false;
    }
  }
  async function unavailable() {
    setNotice('Verified transactions and helper-wallet credit are available in the iOS and Android apps. No browser key was created.');
  }
  async function refresh() { /* No account credential or private wallet exists in the browser. */ }
  return {
    account: null, recipient, notice, status: 'ready' as const,
    data: { state: 'unconfigured' as const }, pending: null,
    checkedAt: null, freshness: 'unknown' as const,
    saveRecipient, refresh, open: refresh, selectWallet: unavailable,
    transact: unavailable, plantAndRelease: unavailable,
  };
}

const Context = createContext<ReturnType<typeof useWebRewards> | null>(null);
export function RewardProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useWebRewards()}>{children}</Context.Provider>;
}
export function useRewards() {
  const value = useContext(Context);
  if (!value) throw new GardenTransactionError({ message: 'RewardProvider is missing.' });
  return value;
}
