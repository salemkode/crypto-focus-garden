import { useState } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { parseTree } from '@focus-garden/protocol/forest';
import { useRewards } from '../features/rewards/RewardProvider';
import { rewardAddressOf } from '../features/forest/address';
import { color, Group, icons, nativeAware, Notice, Row } from '../ui';

/** "bitcoincash:qq…abcdef": the network prefix, then the first 14 and last 6 characters of the address. */
function shortAddress(address: string) {
  const [prefix, body] = address.includes(':') ? address.split(':') as [string, string] : ['', address];
  const shown = body.length > 22 ? `${body.slice(0, 14)}…${body.slice(-6)}` : body;
  return prefix ? `${prefix}:${shown}` : shown;
}

/**
 * The one transaction that was signed but whose sending is not settled yet (the answer was lost).
 * Only the same signed bytes can be sent again, and only by choice; checking settles it from the chain.
 * Failures are reported by the host screen's notice (`RewardNotice`, ember for failures).
 */
export const PendingOperation = nativeAware(function PendingOperation() {
  const rewards = useRewards();
  const [more, setMore] = useState(false);
  const enabled = rewards.status === 'ready' && Boolean(rewards.account);
  const saved = rewards.pending;
  if (!saved) return null;
  const intent = saved.intent;
  const destination = intent.action === 'plant' ? intent.rewardAddress
    : intent.action === 'claim' ? rewardAddressOf(parseTree(intent.commitment)!.ownerBytecode)
    : intent.action === 'merge' ? rewardAddressOf(parseTree(intent.commitments[0]!)!.ownerBytecode)
    : intent.action === 'tip' ? intent.recipient : '';
  const label = intent.action === 'plant' ? 'Planting a tree'
    : intent.action === 'claim' ? 'Sending a tree to your wallet'
    : intent.action === 'merge' ? `Merging ${intent.commitments.length} trees`
    : intent.action === 'register' ? 'Joining the leaderboard' : 'Sending a tip';
  function confirmResend() {
    void Haptics.selectionAsync();
    Alert.alert('Send it again?', `${label}. Your Focus Garden wallet sends the exact transaction it already signed; it can only go through once. ${destination ? `Goes to ${shortAddress(destination)}.` : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send again', onPress: () => void rewards.transact({ action: 'rebroadcast' }) },
    ]);
  }
  return <Group title="Unfinished transaction" footer="Nothing is sent again unless you choose it here.">
    <Row title={label} detail={rewards.status === 'busy' ? 'Working on it…' : 'Not confirmed as sent yet'} icon={icons.clock} iconTint={color.ink2} />
    <Row title="Check status" disabled={!enabled} onPress={() => rewards.transact({ action: 'recover' })} chevron />
    <Row title={more ? 'Fewer options' : 'More options'} onPress={() => setMore(!more)} chevron={!more} />
    {more ? <Row title="Send the same transaction again" disabled={!enabled} onPress={confirmResend} chevron /> : null}
    {more && destination ? <Row title="Goes to" detail={destination} /> : null}
    {more ? <Row title="Transaction" detail={saved.txid} trailingIcon={icons.copy} accessibilityLabel="Transaction ID. Copy"
      onPress={() => { void Clipboard.setStringAsync(saved.txid); void Haptics.selectionAsync(); }} /> : null}
  </Group>;
});

/**
 * The reward store's messages in plain words, with their tone: progress and success are not shown
 * as failures. Display only: anything not listed is shown as it is, in ember.
 */
const OUTCOMES: Record<string, { text: string; tone: 'info' | 'warning' | 'error' }> = {
  'No saved operation on this device.': { text: 'Nothing is unfinished on this phone.', tone: 'info' },
  'Sent to Bitcoin Cash.': { text: 'Sent to Bitcoin Cash. It is confirming now.', tone: 'info' },
  'Saved operation completed. Refresh the garden for its current network status.': { text: 'Done. It is on Bitcoin Cash.', tone: 'info' },
  'That transaction can no longer go through, so it was cleared. Nothing was spent by it.': { text: 'That transaction can no longer go through, so it was cleared. Nothing was spent by it.', tone: 'info' },
  'Wallet linked. Trees planted before keep their original destination.': { text: 'Wallet linked. Trees planted before still go to the wallet they were planted for.', tone: 'info' },
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
