import { useState } from 'react';
import { parseTree } from '@focus-garden/protocol/forest';
import { useRewards } from '../features/rewards/RewardProvider';
import { rewardAddressOf } from '../features/forest/address';
import { color, Group, icons, nativeAware, Row } from '../ui';

const CREDIT = { plant: 'planting', claim: 'claiming', merge: 'merging', register: 'the leaderboard' } as const;

/**
 * The single saved operation: explicit sign/submit, status check or same-bytes resubmission. Never automatic.
 * Shows one status row and the one next step; the other recovery options sit behind "More options".
 * Failures are reported by the host screen's error notice (ember).
 */
export const PendingOperation = nativeAware(function PendingOperation() {
  const rewards = useRewards();
  const [more, setMore] = useState(false);
  const enabled = rewards.status === 'ready' && Boolean(rewards.account);
  const saved = rewards.pending;
  if (!saved) return null;
  const intent = saved.intent;
  const destination = intent?.action === 'plant' ? intent.rewardAddress
    : intent?.action === 'claim' ? rewardAddressOf(parseTree(intent.commitment)!.ownerBytecode)
    : intent?.action === 'merge' ? rewardAddressOf(parseTree(intent.commitments[0])!.ownerBytecode) : '';
  const label = intent?.action === 'plant' ? 'Planting a tree'
    : intent?.action === 'claim' ? 'Sending a tree to your wallet'
    : intent?.action === 'merge' ? `Merging ${intent.commitments.length} trees`
    : intent?.action === 'register' ? 'Joining the leaderboard'
    : intent?.action === 'tip' ? 'Sending a tip'
    : saved.creditAction ? `Getting fee credit for ${CREDIT[saved.creditAction]}` : 'Getting fee credit';
  // Same rows and guards as before. "Sign and submit" is only shown when it can ever be enabled (it needs an id and an intent).
  const next = !saved.id ? 'resume' : intent ? 'finish' : 'check';
  const resume = <Row title="Resume the same request" disabled={!enabled} onPress={() => rewards.transact({ action: 'resume' })} chevron />;
  const finish = <Row title={saved.raw ? 'Submit saved transaction' : 'Sign and submit saved transaction'} disabled={!enabled || !saved.intent || !saved.id} onPress={() => rewards.transact({ action: 'finish' })} chevron />;
  const check = <Row title="Check status" disabled={!enabled} onPress={() => rewards.transact({ action: 'recover' })} chevron />;
  const rebroadcast = <Row title="Resubmit the same signed transaction" disabled={!enabled} onPress={() => rewards.transact({ action: 'rebroadcast' })} chevron />;
  return <Group title="Unfinished transaction" footer="Nothing is sent again unless you choose it here.">
    <Row title={label} detail="Not finished yet" icon={icons.clock} iconTint={color.ink2} />
    {next === 'resume' ? resume : next === 'finish' ? finish : check}
    <Row title={more ? 'Fewer options' : 'More options'} onPress={() => setMore(!more)} chevron={!more} />
    {more && next !== 'check' ? check : null}
    {more && saved.id ? rebroadcast : null}
    {more && destination ? <Row title="Tree owner" detail={destination} /> : null}
  </Group>;
});
