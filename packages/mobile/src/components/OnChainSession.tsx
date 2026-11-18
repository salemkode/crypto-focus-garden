import { useState } from 'react';
import { Text, View } from 'react-native';
import { parseTree } from '@focus-garden/protocol/forest';
import { useRewards } from '../features/rewards/RewardProvider';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { onchainSessionView } from '../features/focus/onchain-session';
import { rewardAddressOf } from '../features/forest/address';
import { nftTree } from '../features/forest/nft-style';
import { formatClock } from '../features/focus/stats';
import { Arc, continuous, Group, nativeAware, Notice, numerals, Row, Stage } from '../ui';
import { ItemView } from './ItemView';

/** The reward currently growing (or being claimed or merged) on chain. */
export const OnChainSession = nativeAware(function OnChainSession() {
  const rewards = useRewards();
  const { now } = useFocusGarden();
  const [details, setDetails] = useState(false);
  const view = onchainSessionView(rewards.data.state === 'connected' ? rewards.data.sessions : [], now);
  if (!view) return null;
  const item = nftTree(view.session.commitment);
  const status = view.session.state === 'confirming' ? 'Confirming'
    : view.session.state === 'claiming' ? 'Sending to your wallet'
    : view.session.state === 'merging' ? 'Merging'
    : view.remaining === 0 ? 'Almost ready' : formatClock(view.remaining);
  return <>
    <View style={continuous} className="flex-row items-center gap-4 rounded-[20px] bg-surface p-3">
      <Stage style={{ width: 96, height: 112 }}><ItemView tier={item.tier.key} species={item.localSpecies} seed={item.seed} size={78} progress={Math.max(0.05, view.progress)} /></Stage>
      <View className="flex-1 gap-1">
        <Text className="text-headline text-ink">{item.name}</Text>
        <View className="flex-row items-center gap-2">
          <Arc progress={view.progress} size={28} stroke={3} />
          <Text accessibilityRole="timer" numberOfLines={1} adjustsFontSizeToFit style={numerals} className="flex-1 text-title-2 text-ink">{status}</Text>
        </View>
        <Text className="text-footnote text-ink-2">{view.message}</Text>
      </View>
    </View>
    <Text className="px-4 text-footnote text-ink-2">The time is an estimate. The blockchain decides when it is ready, usually within a few minutes of it.</Text>
    {rewards.freshness !== 'current' ? <Notice tone="warning">{`Last checked ${rewards.checkedAt ? new Date(rewards.checkedAt).toLocaleString() : 'a while ago'}. Refresh before claiming.`}</Notice> : null}
    <Group>
      <Row title={details ? 'Hide details' : 'Show details'} onPress={() => setDetails(!details)} chevron={!details} />
      {details ? <Row title="Confirmations" value={`${view.session.confirmations}`} /> : null}
      {details && view.session.duration ? <Row title="Lock" value={`${(view.session.duration / 60).toFixed(1)} min`} /> : null}
      {details ? <Row title="Goes to" detail={rewardAddressOf(parseTree(view.session.commitment)!.ownerBytecode)} /> : null}
      {details && view.session.plantTxid ? <Row title="Plant transaction" detail={view.session.plantTxid} /> : null}
      {details && view.session.claimTxid ? <Row title="Claim transaction" detail={view.session.claimTxid} /> : null}
    </Group>
  </>;
});
