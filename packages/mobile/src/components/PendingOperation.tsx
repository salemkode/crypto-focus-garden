import { parseTree } from '@focus-garden/protocol/forest';
import { useRewards } from '../features/rewards/RewardProvider';
import { rewardAddressOf } from '../features/forest/address';
import { color, Group, icons, nativeAware, Row } from '../ui';

/** The single saved operation: explicit sign/submit, status check or same-bytes resubmission. Never automatic. */
export const PendingOperation = nativeAware(function PendingOperation() {
  const rewards = useRewards();
  const enabled = rewards.status === 'ready' && Boolean(rewards.account);
  const saved = rewards.pending;
  if (!saved) return null;
  const intent = saved.intent;
  const destination = intent?.action === 'plant' ? intent.rewardAddress
    : intent?.action === 'claim' ? rewardAddressOf(parseTree(intent.commitment)!.ownerBytecode)
    : intent?.action === 'merge' ? rewardAddressOf(parseTree(intent.commitments[0])!.ownerBytecode) : '';
  const label = intent?.action === 'plant' ? 'Planting a tree' : intent?.action === 'claim' ? 'Claiming a tree to your wallet' : intent?.action === 'merge' ? `Merging ${intent.commitments.length} trees` : `Requesting ${saved.creditAction ?? ''} credit`;
  return <Group title="Unfinished transaction" footer={destination ? `Tree owner: ${destination}` : undefined}>
    <Row title={label} icon={icons.clock} iconTint={color.sunInk} />
    {!saved.id ? <Row title="Resume the same saved request" disabled={!enabled} onPress={() => rewards.transact({ action: 'resume' })} chevron /> : null}
    <Row title={saved.raw ? 'Submit saved transaction' : 'Sign and submit saved transaction'} disabled={!enabled || !saved.intent || !saved.id} onPress={() => rewards.transact({ action: 'finish' })} chevron />
    <Row title="Check saved transaction" disabled={!enabled} onPress={() => rewards.transact({ action: 'recover' })} chevron />
    {saved.id ? <Row title="Resubmit the same signed transaction" disabled={!enabled} onPress={() => rewards.transact({ action: 'rebroadcast' })} chevron /> : null}
  </Group>;
});
