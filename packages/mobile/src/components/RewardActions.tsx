import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FOREST_SPECIES, FOREST_TIERS } from '@focus-garden/protocol/forest';
import { presetFor } from '../features/focus/catalog';
import { nftTree, previewCommitment } from '../features/forest/nft-style';
import { useRewards } from '../features/rewards/RewardProvider';
import { mergeableTrees } from '../services/garden';
import { Button, Group, icons, MenuPicker, nativeAware, Notice, Row, Segmented, Stage } from '../ui';
import { ItemView } from './ItemView';
import { PendingOperation } from './PendingOperation';

const TIER_OPTIONS = FOREST_TIERS.map((entry) => ({ id: String(entry.code), label: entry.name }));
// Sentence case to match the rest of the app ("Meadow oak"); protocol names stay as they are.
const SPECIES_OPTIONS = FOREST_SPECIES.map((entry) => ({ id: String(entry.code), label: entry.name.charAt(0) + entry.name.slice(1).toLowerCase() }));

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
  const opening = rewards.status === 'opening';
  // The primary button names the missing step and takes you there, instead of sitting disabled.
  const primary = !opening && !rewards.recipient
    ? <Button label="Link your wallet" icon={icons.wallet} onPress={() => router.push('/link-wallet')} />
    : !opening && !rewards.account
      ? <Button label="Set up wallet in Profile" icon={icons.key} onPress={() => router.push('/profile')} />
      : <Button label={`Lock ${presetFor(chosen.key).label} for a ${chosen.name.toLowerCase()}`} icon={icons.lock} disabled={!ready} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); void rewards.transact({ action: 'plant', units: chosen.minUnits, tier, species }); }} />;
  return <>
    <PendingOperation />
    {rewards.pending ? null : <>
      <Group title="Plant a verified tree">
        <Segmented options={TIER_OPTIONS} value={String(tier)} onChange={(next) => setTier(Number(next))} />
        <MenuPicker title="Style" options={SPECIES_OPTIONS} value={String(species)} onChange={(next) => setSpecies(Number(next))} />
        <View className="p-3"><Stage style={{ height: 168 }}><ItemView tier={chosen.key} species={look.localSpecies} seed={5} size={120} /></Stage></View>
      </Group>
      {primary}
    </>}
    {rewards.notice ? <Notice tone="error">{rewards.notice}</Notice> : null}

    {rewards.account ? <Group title="Ready to send" footer={matured.length ? 'Newer trees go to your wallet on their own.' : undefined}>
      {matured.length === 0
        ? <Row title="Nothing waiting" value="Check again" accessibilityLabel="Nothing waiting. Check again" disabled={!enabled} onPress={rewards.refresh} />
        : matured.map((session) => {
          const item = nftTree(session.commitment);
          return <Row key={session.commitment} title={item.name} detail={`#${item.tag} · ${item.points} focus units`} value="Send" accessibilityLabel={`Send ${item.name} to my wallet`}
            disabled={!enabled || Boolean(rewards.pending) || rewards.freshness !== 'current'} onPress={() => rewards.transact({ action: 'claim', commitment: session.commitment })} chevron />;
        })}
      {matured.length ? <Row title="Check again" icon={icons.refresh} disabled={!enabled} onPress={rewards.refresh} /> : null}
    </Group> : null}

    {rewards.account && !rewards.pending ? <Group title="Fees" footer="Paid in Chipnet test coins: 2,000 sats a step, plus a 1,000-sat deposit per tree.">
      <Row title="Get credit for planting" disabled={!enabled} onPress={() => rewards.transact({ action: 'credit-plant' })} chevron />
      <Row title="Get credit for claiming" disabled={!enabled} onPress={() => rewards.transact({ action: 'credit-claim' })} chevron />
    </Group> : null}
  </>;
});
