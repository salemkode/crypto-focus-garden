import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Data from 'effect/Data';
import { loadInternalWallet } from '../../wallet/internal';
import { parseRewardAddress } from '../../wallet/address';
import { readNativeWalletIdentity } from '../wallet/wallet';
import { beginOperation, rebroadcastSaved, resumeSavedRequest, finishPreparedOperation, recoverOperation, savedOperation, saveServiceCredential } from '../../services/transactions';
import { z } from 'zod';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';
import { cachedGardenSchema, gardenCacheKey, loadGarden } from '../../services/garden';
import { consentsSchema, newConsent, nextRelease, RELEASE_FEE_CEILING_SATS, spendConsent, type ReleaseConsent } from './auto-release';

const CONSENTS_KEY = 'focusgarden.autorelease.v1';
function readConsents(): ReleaseConsent[] {
  try { return consentsSchema.parse(JSON.parse(Storage.getItemSync(CONSENTS_KEY) ?? '[]')); } catch { return []; }
}
function writeConsents(consents: ReleaseConsent[]) {
  // Keep spent consents for a day as a record, then drop them.
  const day = Date.now() - 24 * 3600 * 1000;
  Storage.setItemSync(CONSENTS_KEY, JSON.stringify(consents.filter((consent) => consent.usedFor === null || consent.approvedAt > day)));
}

class GardenWalletError extends Data.TaggedError('GardenWalletError')<{ message: string }> {}
async function readAppAccount() {
  const selected = Storage.getItemSync('focusgarden.active.wallet.v1');
  if (selected === 'xo') {
    const native = await readNativeWalletIdentity();
    if (!native) throw new GardenWalletError({ message: 'The selected XO wallet is unavailable. Its identity has not been replaced.' });
    return { address: native.address, kind: 'xo' as const };
  }
  const foundation = await loadInternalWallet();
  if (selected === 'foundation' && !foundation) throw new GardenWalletError({ message: 'The selected legacy app wallet is unavailable. Its identity has not been replaced.' });
  if (foundation) return { address: foundation.address, kind: 'foundation' as const };
  const native = await readNativeWalletIdentity();
  return native ? { address: native.address, kind: 'xo' as const } : null;
}

/**
 * The user's tap (after any confirmation dialog) is the approval: prepare, validate
 * locally, sign and submit in one step. Every step is saved first, so an interrupted
 * operation is recovered, never repeated or replaced automatically.
 */
async function beginAndSign(wallet: string, intent: Parameters<typeof beginOperation>[1]) {
  const started = await beginOperation(wallet, intent);
  const state = z.object({ state: z.string() }).safeParse(started);
  return state.success && state.data.state === 'prepared' ? finishPreparedOperation() : started;
}

function useRewardStore() {
  const [account, setAccount] = useState<Awaited<ReturnType<typeof readAppAccount>>>(null);
  const [recipient, setRecipient] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof loadGarden>>>({ state: 'unconfigured' });
  const [status, setStatus] = useState<'opening' | 'ready' | 'busy' | 'error'>('opening');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<ReturnType<typeof savedOperation>>(null);
  const mutation = useRef(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [freshness, setFreshness] = useState<'unknown' | 'current' | 'stale'>('unknown');
  async function open() {
    setStatus('opening');
    try {
      const appAccount = await readAppAccount();
      const saved = await SecureStore.getItemAsync('focusgarden.reward.chipnet');
      // Prefer an existing foundation account; never replace either vault.
      setPending(savedOperation());
      if (appAccount) Storage.setItemSync('focusgarden.active.wallet.v1', appAccount.kind);
      setAccount(appAccount);
      setRecipient(saved ? parseRewardAddress(saved).address : '');
      const cacheKey = appAccount ? gardenCacheKey({ address: appAccount.address, category: process.env.EXPO_PUBLIC_GARDEN_CATEGORY ?? '', checkpointHash: process.env.EXPO_PUBLIC_GARDEN_CHECKPOINT_HASH ?? '' }) : null;
      const cached = cacheKey ? Storage.getItemSync(cacheKey) : null;
      if (cached) {
        try {
          const parsed = cachedGardenSchema.parse(JSON.parse(cached));
          setData({ state: 'connected', ...parsed.garden }); setCheckedAt(parsed.checkedAt); setFreshness('stale');
        } catch { setNotice('Cached garden could not be read. Its data is preserved; refresh to recover from the service.'); }
      }
      setStatus('ready');
    } catch (cause) {
      if (__DEV__) console.warn('Opening wallets failed: ' + String(cause) + ' ' + String((cause as Error)?.stack ?? '').slice(0, 600));
      setNotice('Could not read your wallets. Existing keys have been preserved. Reopen the app to retry.');
      setStatus('error');
    }
  }
  useEffect(() => {
    const initial = setTimeout(() => { void open(); }, 0);
    return () => clearTimeout(initial);
  }, []);
  /** Links the user's wallet. Returns whether it was saved. */
  async function saveRecipient(draft: string): Promise<boolean> {
    if (status !== 'ready') return false;
    setStatus('busy');
    try {
      if (savedOperation()) throw new GardenWalletError({ message: 'Finish the saved operation before changing your reward address.' });
      const parsed = parseRewardAddress(draft.trim());
      const raw = await loadInternalWallet();
      const xo = await readNativeWalletIdentity();
      if ([raw?.address, xo?.address].some((address) => address && parseRewardAddress(address).lockingBytecode === parsed.lockingBytecode)) {
        throw new GardenWalletError({ message: 'Use a separate external wallet for rewards, not either on-device app account.' });
      }
      await SecureStore.setItemAsync('focusgarden.reward.chipnet', parsed.address);
      setRecipient(parsed.address);
      setData({ state: 'unconfigured' });
      setNotice('Wallet linked. Trees planted before keep their original destination.');
      return true;
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not link that wallet.'); return false; }
    finally { setStatus('ready'); }
  }
  const accountRef = useRef(account);
  useEffect(() => { accountRef.current = account; }, [account]);
  async function refresh() {
    const current = accountRef.current;
    if (!current || mutation.current) return;
    mutation.current = true;
    setStatus('busy');
    try {
      const next = await loadGarden(current.address);
      if (next.state === 'connected') {
        const time = Date.now();
        const key = gardenCacheKey({ address: current.address, category: process.env.EXPO_PUBLIC_GARDEN_CATEGORY ?? '', checkpointHash: process.env.EXPO_PUBLIC_GARDEN_CHECKPOINT_HASH ?? '' });
        if (key) Storage.setItemSync(key, JSON.stringify({ checkedAt: time, garden: next }));
        setCheckedAt(time);
      }
      await recoverOperation(current.address); setPending(savedOperation());
      setData(next);
      setFreshness(next.state === 'connected' ? 'current' : 'unknown');
      setNotice('');
    } catch (cause) { setFreshness('stale'); setNotice(cause instanceof Error ? cause.message : 'Could not refresh your garden.'); }
    finally { mutation.current = false; setStatus('ready'); }
  }
  useEffect(() => {
    if (!account) return;
    // Read-only status recovery. No grant, plant, claim, or broadcast is retried.
    const initial = setTimeout(() => { void refresh(); }, 0);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60000);
    return () => { clearTimeout(initial); listener.remove(); clearInterval(interval); };
    // The stable account ref prevents background callbacks reading an old wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address]);
  async function selectWallet(kind: 'foundation' | 'xo') {
    if (mutation.current || savedOperation()) throw new GardenWalletError({ message: 'Finish the saved operation before changing app wallets.' });
    const identity = kind === 'foundation' ? await loadInternalWallet() : await readNativeWalletIdentity();
    if (!identity) throw new GardenWalletError({ message: 'That wallet has not been created or restored in this installation.' });
    Storage.setItemSync('focusgarden.active.wallet.v1', kind);
    setAccount({ address: identity.address, kind });
    setData({ state: 'unconfigured' }); setFreshness('unknown');
  }
  async function transact(input: { action: 'credit-plant' | 'credit-claim' | 'credit-merge' | 'credit-register' | 'recover' | 'resume' | 'rebroadcast' | 'finish' } | { action: 'plant'; units: number; tier: number; species: number } | { action: 'claim'; commitment: string } | { action: 'merge'; commitments: string[] } | { action: 'register'; name: string; about: string } | { action: 'tip'; profile: string; recipient: string; amount: number } | { action: 'credential'; token: string }) {
    if (mutation.current || status !== 'ready') return;
    mutation.current = true;
    setStatus('busy');
    try {
      if (input.action === 'credential') {
        await saveServiceCredential(input.token);
        setNotice('Service access saved securely. Refresh your garden to verify this app wallet.');
        return;
      }
      if (!account) throw new GardenWalletError({ message: 'Open your app wallet first.' });
      const result = input.action === 'rebroadcast' ? await rebroadcastSaved()
        : input.action === 'resume' ? await resumeSavedRequest()
        : input.action === 'recover' ? await recoverOperation(account.address)
        : input.action === 'finish' ? await finishPreparedOperation()
        : input.action === 'plant' ? await beginAndSign(account.address, { action: 'plant', rewardAddress: recipient, units: input.units, tier: input.tier, species: input.species })
        : input.action === 'merge' ? await beginAndSign(account.address, { action: 'merge', commitments: input.commitments })
        : input.action === 'register' ? await beginAndSign(account.address, { action: 'register', name: input.name, about: input.about })
        : input.action === 'tip' ? await beginAndSign(account.address, { action: 'tip', profile: input.profile, recipient: input.recipient, amount: input.amount })
        : input.action === 'claim' ? await beginAndSign(account.address, { action: 'claim', commitment: input.commitment })
        : await beginOperation(account.address, input.action);
      const response = z.object({ state: z.string(), txid: z.string().nullable().optional(), confirmations: z.number().int().nonnegative().optional() }).parse(result);
      const messages: Record<string, string> = {
        idle: 'No saved operation on this device.', funded: 'Transaction credit is already available.',
        prepared: 'Transaction prepared. Review the saved destination, then sign and submit.',
        confirming: 'The node has observed the transaction. Waiting for the required confirmations.',
        pending: 'Submission is unresolved. Check saved status; no replacement will be sent automatically.',
        reserved: 'The service has reserved this request. It needs service recovery before another operation.',
        unrecorded: 'No recorded request was found. You may explicitly resume the same saved request; it has not been repeated automatically.',
        seen: 'Saved operation completed. Refresh the garden for its current network status.',
      };
      setNotice(`${messages[response.state] ?? response.state}${response.confirmations !== undefined ? ` ${response.confirmations} confirmations.` : ''}${response.txid ? ` Tx: ${response.txid}` : ''}`);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The request was interrupted. Check the saved status before starting another operation.'); }
    finally {
      mutation.current = false;
      try { setPending(savedOperation()); setStatus('ready'); }
      catch { setNotice('Saved operation could not be read. Its data has not been reset.'); setStatus('error'); }
    }
  }
  /**
   * The Plant tap is the approval for the whole session: lock it on Bitcoin Cash now, and release
   * the grown tree to the linked wallet automatically when its lock matures (one tree, this wallet,
   * at most the approved network fee). The consent is saved before the plant starts.
   */
  async function plantAndRelease(input: { units: number; tier: number; species: number }) {
    if (!recipient) throw new GardenWalletError({ message: 'Link your wallet first.' });
    const consent = newConsent({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, recipientBytecode: parseRewardAddress(recipient).lockingBytecode, units: input.units, approvedAt: Date.now() });
    writeConsents([...readConsents(), consent]);
    await transact({ action: 'plant', ...input });
  }
  // Schedule a consent-bound release after commit; unmount cancels an unstarted release.
  useEffect(() => {
    const scheduled = setTimeout(() => {
      if (data.state !== 'connected' || status !== 'ready' || mutation.current || pending) return;
      const consents = readConsents();
      const release = nextRelease(consents, data.sessions, { networkFeeSats: RELEASE_FEE_CEILING_SATS, busy: Boolean(savedOperation()) });
      if (!release) return;
      writeConsents(spendConsent(consents, release.consent.id, release.commitment));
      void transact({ action: 'claim', commitment: release.commitment });
    }, 0);
    return () => clearTimeout(scheduled);
    // Data/status/pending are the release trigger; mutation and saved-operation checks run again in the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, status, pending]);
  return { account, recipient, data, status, notice, pending, transact, plantAndRelease, open, selectWallet, checkedAt, freshness, saveRecipient, refresh };
}
const RewardContext = createContext<ReturnType<typeof useRewardStore> | null>(null);
export function RewardProvider({ children }: { children: ReactNode }) {
  const value = useRewardStore();
  return <RewardContext.Provider value={value}>{children}</RewardContext.Provider>;
}
export function useRewards() {
  const value = useContext(RewardContext);
  if (!value) throw new GardenWalletError({ message: 'RewardProvider is missing.' });
  return value;
}
