import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FOREST_SPECIES, FOREST_TIERS } from '@focus-garden/protocol/forest';
import { nftTree, previewCommitment } from '../features/forest/nft-style';
import { useRewards } from '../features/rewards/RewardProvider';
import { mergeableTrees } from '../services/garden';
import { Button, Group, icons, MenuPicker, nativeAware, Notice, Row, Segmented, Stage } from '../ui';
import { ItemView } from './ItemView';
import { PendingOperation } from './PendingOperation';

const minutes = (units: number) => { const total = (units * 512) / 60; return total >= 60 ? `${Math.floor(total / 60)} h ${Math.round(total % 60)} min` : `${total.toFixed(1).replace(/\.0$/, '')} min`; };
const TIER_OPTIONS = FOREST_TIERS.map((entry) => ({ id: String(entry.code), label: entry.name }));
const SPECIES_OPTIONS = FOREST_SPECIES.map((entry) => ({ id: String(entry.code), label: entry.name }));

export const RewardActions = nativeAware(function RewardActions() {
  const rewards = useRewards();
  const [tier, setTier] = useState(2);
  const [species, setSpecies] = useState(1);
  const enabled = rewards.status === 'ready' && Boolean(rewards.account);
  const chosen = FOREST_TIERS.find((entry) => entry.code === tier)!;
  const ready = enabled && rewards.recipient.length > 0;
  const sessions = rewards.data.state === 'connected' ? rewards.data.sessions : [];
  const matured = mergeableTrees(sessions);
  const look = nftTree(previewCommitment(tier, species));
  return <>
    <PendingOperation />
    {rewards.pending ? null : <>
      <Group title="Plant a verified tree">
        <Segmented options={TIER_OPTIONS} value={String(tier)} onChange={(next) => setTier(Number(next))} />
        <MenuPicker title="Style" options={SPECIES_OPTIONS} value={String(species)} onChange={(next) => setSpecies(Number(next))} />
        <View className="p-3"><Stage style={{ height: 168 }}><ItemView tier={chosen.key} species={look.localSpecies} seed={5} size={120} /></Stage></View>
      </Group>
      <Button label={`Lock ${minutes(chosen.minUnits)} for a ${chosen.name.toLowerCase()}`} icon={icons.lock} disabled={!ready} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); void rewards.transact({ action: 'plant', units: chosen.minUnits, tier, species }); }} />
      {!rewards.recipient ? <Button variant="plain" size="medium" label="Link your wallet first" onPress={() => router.push('/link-wallet')} /> : null}
      <Group title="Network fee credit">
        <Row title="Get planting credit" disabled={!enabled} onPress={() => rewards.transact({ action: 'credit-plant' })} chevron />
        <Row title="Get claim credit" disabled={!enabled} onPress={() => rewards.transact({ action: 'credit-claim' })} chevron />
      </Group>
    </>}

    <Group title="Grown and waiting" footer="New trees are sent to your wallet automatically. Trees planted before that can be sent here.">
      {matured.length === 0 ? <Row title="Nothing waiting" /> : matured.map((session) => {
        const item = nftTree(session.commitment);
        return <Row key={session.commitment} title={item.name} detail={`#${item.tag} · ${item.points} focus units`} value="Send" accessibilityLabel={`Send ${item.name} to my wallet`}
          disabled={!enabled || Boolean(rewards.pending) || rewards.freshness !== 'current'} onPress={() => rewards.transact({ action: 'claim', commitment: session.commitment })} chevron />;
      })}
      <Row title="Refresh from Chipnet" icon={icons.refresh} disabled={!enabled} onPress={rewards.refresh} />
    </Group>
    {rewards.notice ? <Notice tone="error">{rewards.notice}</Notice> : null}
    <Text className="px-4 text-footnote text-ink-2">Chipnet is the Bitcoin Cash test network; its coins have no cash value. The helper wallet pays a 2,000-sat fee per step, and each tree carries a 1,000-sat deposit.</Text>
  </>;
});
