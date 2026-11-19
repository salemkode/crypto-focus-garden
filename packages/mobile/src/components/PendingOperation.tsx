import { currencyDisclosure, isMainnet } from '../services/network';
import { useState } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { parseTree } from '@focus-garden/protocol/forest';
import { useRewards } from '../features/rewards/RewardProvider';
import { rewardAddressOf } from '../features/forest/address';
import { color, Group, icons, nativeAware, Notice, Row } from '../ui';

const CREDIT = { plant: 'planting', claim: 'sending', merge: 'merging', register: 'the leaderboard' } as const;

/** "bchtest:qq…abcdef": the network prefix, then the first 14 and last 6 characters of the address. */
function shortAddress(address: string) {
  const [prefix, body] = address.includes(':') ? address.split(':') as [string, string] : ['', address];
  const shown = body.length > 22 ? `${body.slice(0, 14)}…${body.slice(-6)}` : body;
  return prefix ? `${prefix}:${shown}` : shown;
}

/**
 * The single saved operation: explicit sign/submit, status check or same-bytes resubmission. Never automatic.
 * Shows one status row and the one next step; the other recovery options sit behind "More options".
 * Failures are reported by the host screen's notice (`RewardNotice`, ember for failures).
 */
export const PendingOperation = nativeAware(function PendingOperation() {
  const rewards = useRewards();
  const [more, setMore] = useState(false);
  const enabled = rewards.status === 'ready' && Boolean(rewards.account);
  const saved = rewards.pending;
  if (!saved) return null;
  const intent = saved.intent;
  const destination = intent?.action === 'tip' ? intent.recipient
    : intent?.action === 'plant' ? intent.rewardAddress
    : intent?.action === 'claim' ? rewardAddressOf(parseTree(intent.commitment)!.ownerBytecode)
    : intent?.action === 'merge' ? rewardAddressOf(parseTree(intent.commitments[0])!.ownerBytecode) : '';
  const label = intent?.action === 'plant' ? 'Planting a tree'
    : intent?.action === 'claim' ? 'Sending a tree to your wallet'
    : intent?.action === 'merge' ? `Merging ${intent.commitments.length} trees`
    : intent?.action === 'register' ? `Joining the leaderboard as ${intent.name}`
    : intent?.action === 'tip' ? 'Sending a tip'
    : saved.creditAction ? `Getting fee credit for ${CREDIT[saved.creditAction]}` : 'Getting fee credit';
  // What signing spends, in the same words as the confirmations elsewhere (fees from the service's fixed policy).
  const cost = intent?.action === 'tip' ? `${intent.amount.toLocaleString()} sats and a 2,000-sat network fee`
    : intent?.action === 'plant' ? 'a 2,000-sat network fee and a 1,000-sat deposit that stays with the tree'
    : intent?.action === 'register' ? 'a 2,000-sat network fee and a 1,000-sat deposit that stays with the leaderboard card' : 'a 2,000-sat network fee';
  // One confirm before anything is signed or sent; the row and its guards are unchanged.
  function confirmFinish() {
    void Haptics.selectionAsync();
    Alert.alert(saved!.raw ? 'Submit this transaction?' : 'Sign and submit?', `${label}. Your Focus Garden wallet ${saved!.raw ? 'sends the transaction it already signed' : 'signs the saved transaction and sends it'} to Bitcoin Cash. ${destination ? `Goes to ${isMainnet ? destination : shortAddress(destination)}. ` : ''}Cost: ${cost}, ${currencyDisclosure}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: saved!.raw ? 'Submit' : 'Sign and submit', onPress: () => void rewards.transact({ action: 'finish' }) },
    ]);
  }
  // Same rows and guards as before. "Sign and submit" is only shown when it can ever be enabled (it needs an id and an intent).
  function confirmCancel() {
    Alert.alert('Cancel this preparation?', 'This releases the reserved inputs through Focus Garden. A signed copy held outside this app can still be sent separately.', [
      { text: 'Keep preparation', style: 'cancel' },
      { text: 'Cancel preparation', style: 'destructive', onPress: () => void rewards.transact({ action: 'cancel-preparation' }) },
    ]);
  }
  const next = !saved.id ? 'resume' : intent ? 'finish' : 'check';
  const resume = <Row title="Resume the same request" disabled={!enabled} onPress={() => rewards.transact({ action: 'resume' })} chevron />;
  const finish = <Row title={saved.raw ? 'Submit saved transaction' : 'Sign and submit saved transaction'} disabled={!enabled || !saved.intent || !saved.id} onPress={confirmFinish} chevron />;
  const check = <Row title="Check status" disabled={!enabled} onPress={() => rewards.transact({ action: 'recover' })} chevron />;
  const rebroadcast = <Row title="Resubmit the same signed transaction" disabled={!enabled} onPress={() => rewards.transact({ action: 'rebroadcast' })} chevron />;
  return <Group title="Unfinished transaction" footer="Nothing is sent again unless you choose it here.">
    <Row title={label} detail={rewards.status === 'busy' ? 'Working on it…' : 'Not finished yet'} icon={icons.clock} iconTint={color.ink2} />
    {next === 'resume' ? resume : next === 'finish' ? finish : check}
    {/* Before signing, where the tree goes is always in view, not behind More options. */}
    {next === 'finish' && destination ? <Row title="Goes to" detail={destination} /> : null}
    <Row title={more ? 'Fewer options' : 'More options'} onPress={() => setMore(!more)} chevron={!more} />
    {more && next !== 'check' ? check : null}
    {more && saved.id ? rebroadcast : null}
    {more && isMainnet && saved.id && saved.intent && !saved.raw ? <Row title="Cancel unsubmitted preparation" disabled={!enabled} onPress={confirmCancel} chevron /> : null}
    {more && destination && next !== 'finish' ? <Row title="Goes to" detail={destination} /> : null}
  </Group>;
});

/**
 * The reward store's messages in plain words, with their tone: progress and success are not shown
 * as failures. Display only: anything not listed is shown as it is, in ember.
 */
const OUTCOMES: Record<string, { text: string; tone: 'info' | 'warning' | 'error' }> = {
  'No saved operation on this device.': { text: 'Nothing is unfinished on this phone.', tone: 'info' },
  'Transaction credit is already available.': { text: 'You already have enough fee credit.', tone: 'info' },
  'Transaction prepared. Review the saved destination, then sign and submit.': { text: 'Ready to sign. Check where it goes, then sign and submit.', tone: 'info' },
  'The node has observed the transaction. Waiting for the required confirmations.': { text: 'Sent to Bitcoin Cash. It is confirming now.', tone: 'info' },
  'Saved operation completed. Refresh the garden for its current network status.': { text: 'Done. Refresh to see the latest status.', tone: 'info' },
  'Wallet linked. Trees planted before keep their original destination.': { text: 'Wallet linked. Trees planted before still go to the wallet they were planted for.', tone: 'info' },
  'Service access saved securely. Refresh your garden to verify this app wallet.': { text: 'Access key saved. Refresh to check your Focus Garden wallet.', tone: 'info' },
  // Failures with a fix in the app: say where it is.
  'Transaction credit is required.': { text: isMainnet ? 'Add Mainnet BCH to your Focus Garden wallet. Open Profile for its receive address.' : 'You need fee credit first. Get it under Fees in Verified trees.', tone: 'error' },
  'Save your service access token in Wallet first.': { text: 'Add your garden access key first, in Profile under Advanced.', tone: 'error' },
  'Submission is unresolved. Check saved status; no replacement will be sent automatically.': { text: "It isn't clear yet whether this was sent. Check status; nothing is sent again on its own.", tone: 'warning' },
};

/** Splits "<message>[ N confirmations.][ Tx: <id>]" as the reward store writes it. */
function readNotice(notice: string) {
  const match = /^([\s\S]*?)(?: (\d+) confirmations\.)?(?: Tx: (\S+))?$/.exec(notice);
  return { message: match?.[1] ?? notice, confirmations: match?.[2], txid: match?.[3] };
}

/**
 * The result of the last wallet action: plain words, ember only for failures, and the transaction
 * id behind a Details row (tap to copy) so the result can be checked on Bitcoin Cash.
 */
export const RewardNotice = nativeAware(function RewardNotice() {
  const rewards = useRewards();
  const [details, setDetails] = useState(false);
  if (!rewards.notice) return null;
  const { message, confirmations, txid } = readNotice(rewards.notice);
  const outcome = OUTCOMES[message];
  const text = `${outcome?.text ?? message}${confirmations ? ` ${confirmations} ${confirmations === '1' ? 'confirmation' : 'confirmations'} so far.` : ''}`;
  return <>
    <Notice tone={outcome?.tone ?? 'error'}>{text}</Notice>
    {txid ? <Group>
      <Row title={details ? 'Hide details' : 'Details'} onPress={() => setDetails(!details)} chevron={!details} />
      {details ? <Row title="Transaction" detail={txid} trailingIcon={icons.copy} accessibilityLabel="Transaction ID. Copy"
        onPress={() => { void Clipboard.setStringAsync(txid); void Haptics.selectionAsync(); }} /> : null}
    </Group> : null}
  </>;
});
