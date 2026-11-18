import { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import * as Haptics from 'expo-haptics';
import { useRewards } from '../rewards/RewardProvider';
import { startWizardConnect } from './wizardconnect';
import { METHOD_NAME, type LinkMethod, type LinkedWallet, type Pairing, type WalletApp } from './wallets';

const LINK_INFO = 'focusgarden.wallet.link.v1';

/** Which wallet and protocol linked the current reward address (display only). */
export function readLinkInfo(address: string): LinkedWallet | null {
  try {
    const saved = JSON.parse(Storage.getItemSync(LINK_INFO) ?? 'null') as LinkedWallet | null;
    return saved && saved.address === address ? saved : null;
  } catch { return null; }
}

export type LinkState =
  | { phase: 'idle' }
  | { phase: 'starting'; method: LinkMethod; app?: WalletApp }
  | { phase: 'waiting'; method: LinkMethod; app?: WalletApp; uri: string };

/** Whether a wallet app is on this phone (needs its scheme in LSApplicationQueriesSchemes on iOS). */
export async function isInstalled(app: WalletApp) {
  return Linking.canOpenURL(app.probe).catch(() => false);
}

/** Opens the wallet with the pairing link; sends the user to the store when it is not installed. */
async function openWallet(app: WalletApp, uri: string): Promise<boolean> {
  if (!await isInstalled(app)) {
    await Linking.openURL(Platform.OS === 'ios' ? app.appStore : app.playStore).catch(() => undefined);
    return false;
  }
  await Linking.openURL(uri);
  return true;
}

/**
 * Links the user's own wallet over WalletConnect or WizardConnect: create a pairing, open the
 * wallet (or show the link), wait for approval, then save the address the wallet shared.
 */
export function useWalletLink(onLinked?: () => void) {
  const rewards = useRewards();
  const [state, setState] = useState<LinkState>({ phase: 'idle' });
  const [error, setError] = useState('');
  const current = useRef<Pairing | null>(null);
  useEffect(() => () => current.current?.cancel(), []);

  async function start(method: LinkMethod, app?: WalletApp) {
    current.current?.cancel();
    current.current = null;
    setError('');
    setState({ phase: 'starting', method, app });
    let pairing: Pairing | null = null;
    try {
      // WalletConnect loads its React Native compatibility layer only when it is used.
      pairing = method === 'walletconnect' ? await (await import('./walletconnect')).startWalletConnect() : startWizardConnect();
      current.current = pairing;
      setState({ phase: 'waiting', method, app, uri: pairing.uri });
      if (app && !await openWallet(app, pairing.uri)) {
        throw new Error(`${app.name} isn't installed. Install it from the store, then try again.`);
      }
      const linked = await pairing.result;
      if (current.current !== pairing) return;
      current.current = null;
      if (!await rewards.saveRecipient(linked.address)) throw new Error(rewards.notice || 'The linked wallet could not be saved.');
      Storage.setItemSync(LINK_INFO, JSON.stringify(linked));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState({ phase: 'idle' });
      onLinked?.();
    } catch (cause) {
      // Only the active pairing reports: a cancelled or replaced one ends silently.
      if (pairing && current.current !== pairing) return;
      pairing?.cancel();
      current.current = null;
      setState({ phase: 'idle' });
      if (__DEV__) console.warn(`[wallet-link] ${method}: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`);
      const message = cause instanceof Error ? cause.message : '';
      setError(message || `${METHOD_NAME[method]} could not connect. Try again.`);
    }
  }

  function cancel() {
    current.current?.cancel();
    current.current = null;
    setState({ phase: 'idle' });
  }

  /** Opens the pairing link again: in the chosen wallet, or in whichever wallet handles the link. */
  async function reopen() {
    if (state.phase !== 'waiting') return;
    if (state.app) { await openWallet(state.app, state.uri).catch(() => undefined); return; }
    await Linking.openURL(state.uri).catch(() => setError('No wallet on this phone opens this link. Copy it, or scan the code from another phone.'));
  }

  return { state, error, start, cancel, reopen };
}
