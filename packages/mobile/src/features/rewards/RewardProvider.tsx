import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Data from 'effect/Data';
import { loadInternalWallet } from '../../wallet/internal';
import { parseRewardAddress } from '../../wallet/address';
import { networkAddress } from '../wallet-link/address';
import { readNativeWalletIdentity } from '../wallet/wallet';
import { checkSaved, resendSaved, savedOperation, submit } from '../../services/transactions';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';
import { cachedGardenSchema, gardenCacheKey, loadGarden } from '../../services/garden';
import { DEPLOYMENT } from '../../services/network';
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

const RECIPIENT_KEY = 'focusgarden.reward.chipnet';
/** The linked wallet, saved under its original storage name and shown on this build's network. */
function readRecipient(saved: string) {
  try { return parseRewardAddress(networkAddress(saved)).address; } catch { return ''; }
}
const MESSAGES = {
  idle: 'No saved operation on this device.',
  sent: 'Sent to Bitcoin Cash.',
  seen: 'Saved operation completed. Refresh the garden for its current network status.',
  pending: 'Submission is unresolved. Check saved status; no replacement will be sent automatically.',
  dropped: 'That transaction can no longer go through, so it was cleared. Nothing was spent by it.',
} as const;

type TransactInput = Parameters<ReturnType<typeof useRewardStore>['transact']>[0];
/** The on-chain request for a wallet action; plants go to the linked wallet. */
function intentOf(input: Exclude<TransactInput, { action: 'recover' | 'rebroadcast' }>, recipient: string): Parameters<typeof submit>[1] {
  return input.action === 'plant' ? { action: 'plant', rewardAddress: recipient, units: input.units, tier: input.tier, species: input.species } : input;
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

function useRewardStore() {
  const [account, setAccount] = useState<Awaited<ReturnType<typeof readAppAccount>>>(null);
  const [recipient, setRecipient] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof loadGarden>> | { state: 'unconfigured' }>({ state: 'unconfigured' });
  const [status, setStatus] = useState<'opening' | 'ready' | 'busy' | 'error'>('opening');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<ReturnType<typeof savedOperation>>(null);
  const mutation = useRef(false);
  /** The background refresh in flight, if any. Wallet actions wait for it instead of being dropped. */
  const refreshing = useRef<Promise<void> | null>(null);
  /** Takes the one operation lock, after any running refresh finishes. False if another action holds it. */
  async function acquire() {
    if (mutation.current) return false;
    mutation.current = true;
    setStatus('busy');
    await refreshing.current;
    return true;
  }
  async function open() {
    setStatus('opening');
    try {
      const appAccount = await readAppAccount();
      const saved = await SecureStore.getItemAsync(RECIPIENT_KEY);
      // Prefer an existing foundation account; never replace either vault.
      setPending(savedOperation());
      if (appAccount) Storage.setItemSync('focusgarden.active.wallet.v1', appAccount.kind);
      setAccount(appAccount);
      setRecipient(saved ? readRecipient(saved) : '');
      const cacheKey = appAccount ? gardenCacheKey({ address: appAccount.address, category: DEPLOYMENT.forest.category }) : null;
      const cached = cacheKey ? Storage.getItemSync(cacheKey) : null;
      if (cached) {
        try {
          const parsed = cachedGardenSchema.parse(JSON.parse(cached));
          setData({ state: 'connected', ...parsed.garden }); setCheckedAt(parsed.checkedAt); setFreshness('stale');
        } catch { setNotice('Cached garden could not be read. Pull to refresh it from Bitcoin Cash.'); }
      }
      setStatus('ready');
    } catch (cause) {
      if (__DEV__) console.warn('Opening wallets failed: ' + String(cause) + ' ' + String((cause as Error)?.stack ?? '').slice(0, 600));
      setNotice('Could not read your wallets. Existing keys have been preserved. Reopen the app to retry.');
      setStatus('error');
    }
  }
  useEffect(() => { void open(); }, []);
  /** Links the user's wallet. Resolves to null once saved, or to the reason it was not (also shown as the notice). */
  async function saveRecipient(draft: string): Promise<string | null> {
    const refuse = (reason: string) => { setNotice(reason); return reason; };
    if (status === 'opening' || status === 'error') return refuse('Your wallets are not open yet. Reopen the app to try again.');
    if (!await acquire()) return refuse('Another wallet action is still running. Try again when it finishes.');
    try {
      if (savedOperation()) throw new GardenWalletError({ message: 'Finish the saved operation before changing your reward address.' });
      const parsed = parseRewardAddress(draft.trim());
      const raw = await loadInternalWallet();
      const xo = await readNativeWalletIdentity();
      if ([raw?.address, xo?.address].some((address) => address && parseRewardAddress(address).lockingBytecode === parsed.lockingBytecode)) {
        throw new GardenWalletError({ message: 'Use a separate external wallet for rewards, not either on-device app account.' });
      }
      await SecureStore.setItemAsync(RECIPIENT_KEY, parsed.address);
      setRecipient(parsed.address);
      setData({ state: 'unconfigured' });
      setNotice('Wallet linked. Trees planted before keep their original destination.');
      return null;
    } catch (cause) { return refuse(cause instanceof Error ? cause.message : 'Could not link that wallet.'); }
    finally { mutation.current = false; setStatus('ready'); }
  }
  const accountRef = useRef(account);
  accountRef.current = account;
  const recipientRef = useRef(recipient);
  recipientRef.current = recipient;
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [freshness, setFreshness] = useState<'unknown' | 'current' | 'stale'>('unknown');
  function refresh(): Promise<void> {
    if (refreshing.current) return refreshing.current;
    const current = accountRef.current;
    if (!current || mutation.current) return Promise.resolve();
    setStatus('busy');
    async function load(current: NonNullable<typeof account>) { try {
      // Read-only: settle a saved transaction from what the chain shows; nothing is sent from here.
      if (savedOperation()) { await checkSaved(); setPending(savedOperation()); }
      const next = await loadGarden(current.address, recipientRef.current || null);
      const time = Date.now();
      const key = gardenCacheKey({ address: current.address, category: DEPLOYMENT.forest.category });
      if (key) Storage.setItemSync(key, JSON.stringify({ checkedAt: time, garden: next }));
      setCheckedAt(time);
      setData(next);
      setFreshness('current');
      setNotice('');
    } catch (cause) { setFreshness('stale'); setNotice(cause instanceof Error ? cause.message : 'Could not refresh your garden.'); }
    finally {
      // A wallet action queued behind this refresh keeps the busy state until it finishes.
      if (!mutation.current) setStatus('ready');
    } }
    const run = load(current);
    refreshing.current = run;
    void run.finally(() => { if (refreshing.current === run) refreshing.current = null; });
    return run;
  }
  useEffect(() => {
    if (!account) return;
    // Read-only status recovery. No grant, plant, claim, or broadcast is retried.
    void refresh();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60000);
    return () => { listener.remove(); clearInterval(interval); };
    // The stable account ref prevents background callbacks reading an old wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, recipient]);
  async function selectWallet(kind: 'foundation' | 'xo') {
    await refreshing.current;
    if (mutation.current || savedOperation()) throw new GardenWalletError({ message: 'Finish the saved operation before changing app wallets.' });
    const identity = kind === 'foundation' ? await loadInternalWallet() : await readNativeWalletIdentity();
    if (!identity) throw new GardenWalletError({ message: 'That wallet has not been created or restored in this installation.' });
    Storage.setItemSync('focusgarden.active.wallet.v1', kind);
    setAccount({ address: identity.address, kind });
    setData({ state: 'unconfigured' }); setFreshness('unknown');
  }
  async function transact(input: { action: 'recover' } | { action: 'rebroadcast' } | { action: 'plant'; units: number; tier: number; species: number } | { action: 'claim'; commitment: string } | { action: 'merge'; commitments: string[] } | { action: 'register'; name: string; about: string } | { action: 'tip'; profile: string; recipient: string; amount: number }, beforeStart?: () => void): Promise<boolean> {
    if (status === 'opening' || status === 'error') return false;
    if (!await acquire()) { setNotice('Another wallet action is still running. Try again when it finishes.'); return false; }
    let sent = false;
    try {
      if (!account) throw new GardenWalletError({ message: 'Open your app wallet first.' });
      beforeStart?.();
      const result = input.action === 'rebroadcast' ? await resendSaved()
        : input.action === 'recover' ? await checkSaved()
        : await submit(account.address, intentOf(input, recipient));
      sent = result.state !== 'idle';
      setNotice(`${MESSAGES[result.state]}${'txid' in result ? ` Tx: ${result.txid}` : ''}`);
      return result.state === 'sent' || result.state === 'seen' || result.state === 'idle';
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The request was interrupted. Check the unfinished transaction before starting another.'); return false; }
    finally {
      mutation.current = false;
      try { setPending(savedOperation()); setStatus('ready'); }
      catch { setNotice('Saved operation could not be read. Its data has not been reset.'); setStatus('error'); }
      // Show what the chain now holds (the new tree, a released tree, the new balance).
      if (sent) setTimeout(() => { void refresh(); }, 1500);
    }
  }
  /**
   * The Plant tap is the approval for the whole session: lock it on Bitcoin Cash now, and release
   * the grown tree to the linked wallet automatically when its lock matures (one tree, this wallet,
   * at most the approved network fee). The consent is saved before the plant starts, and only once
   * this action holds the operation lock, so a refused plant leaves no consent behind.
   * Resolves to whether the plant was submitted.
   */
  async function plantAndRelease(input: { units: number; tier: number; species: number }): Promise<boolean> {
    if (!recipient) { setNotice('Link your wallet first.'); return false; }
    const approvedAt = Date.now();
    const consent = newConsent({ id: `${approvedAt}-${Math.random().toString(36).slice(2, 8)}`, recipientBytecode: parseRewardAddress(recipient).lockingBytecode, units: input.units, approvedAt });
    return transact({ action: 'plant', ...input }, () => writeConsents([...readConsents(), consent]));
  }
  // Release grown trees covered by a Plant-time consent, one at a time. Never retried: the consent
  // is spent before the claim starts, and any unresolved operation blocks the next one.
  useEffect(() => {
    if (data.state !== 'connected' || status !== 'ready' || mutation.current || pending) return;
    const consents = readConsents();
    const release = nextRelease(consents, data.sessions, { networkFeeSats: RELEASE_FEE_CEILING_SATS, busy: Boolean(savedOperation()) });
    if (!release) return;
    writeConsents(spendConsent(consents, release.consent.id, release.commitment));
    void transact({ action: 'claim', commitment: release.commitment });
    // transact is recreated each render; data/status/pending capture every input it needs.
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
