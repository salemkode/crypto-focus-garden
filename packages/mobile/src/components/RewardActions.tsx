import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FOREST_SPECIES, FOREST_TIERS, parseTree } from '@focus-garden/protocol/forest';
import { presetFor } from '../features/focus/catalog';
import { nftTree, previewCommitment } from '../features/forest/nft-style';
import { useRewards } from '../features/rewards/RewardProvider';
import { readLinkInfo } from '../features/wallet-link/useWalletLink';
import { mergeableTrees } from '../services/garden';
import { parseRewardAddress } from '../wallet/address';
import { Button, Group, icons, MenuPicker, nativeAware, Row, Segmented, Stage } from '../ui';
import { ItemView } from './ItemView';
import { PendingOperation, RewardNotice } from './PendingOperation';

/** Sentence case to match the rest of the app ("Big tree", "Meadow oak"); protocol names stay as they are. */
const sentence = (name: string) => name.charAt(0) + name.slice(1).toLowerCase();
const TIER_OPTIONS = FOREST_TIERS.map((entry) => ({ id: String(entry.code), label: sentence(entry.name) }));
const SPECIES_OPTIONS = FOREST_SPECIES.map((entry) => ({ id: String(entry.code), label: sentence(entry.name) }));
/** Costs as the confirmations state them (the service's fixed policy), paid from the Focus Garden wallet. */
const TEST_COINS = 'in test coins with no cash value';

export const RewardActions = nativeAware(function RewardActions() {
  const rewards = useRewards();
  const [tier, setTier] = useState(2);
  const [species, setSpecies] = useState(1);
  /** The action this screen started and is waiting on, for its loading state. */
  const [working, setWorking] = useState<string | null>(null);
  const enabled = rewards.status === 'ready' && Boolean(rewards.account);
  const chosen = FOREST_TIERS.find((entry) => entry.code === tier)!;
  const ready = enabled && rewards.recipient.length > 0;
  const sessions = rewards.data.state === 'connected' ? rewards.data.sessions : [];
  const matured = mergeableTrees(sessions);
  const look = nftTree(previewCommitment(tier, species));
  const opening = rewards.status === 'opening';
  const length = presetFor(chosen.key).label;
  const size = chosen.name.toLowerCase();

  /** Runs one wallet action and keeps its control busy until it settles. The action and its guards are unchanged. */
  function run(id: string, input: Parameters<typeof rewards.transact>[0]) {
    setWorking(id);
    void rewards.transact(input).finally(() => setWorking(null));
  }
  function confirmPlant() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(`Lock ${length} for a ${size}?`, `Your ${size} is locked on Bitcoin Cash for ${length} and shows above while it grows. Then send it to your wallet from Ready to send.\n\nCost: a 2,000-sat network fee and a 1,000-sat deposit that stays with the tree, ${TEST_COINS}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', onPress: () => run('plant', { action: 'plant', units: chosen.minUnits, tier, species }) },
    ]);
  }
  function check() {
    setWorking('check');
    void rewards.refresh().finally(() => setWorking(null));
  }
  /** Where a tree goes: the wallet it was planted for, named when it is the linked one. */
  function destination(commitment: string) {
    const owner = parseTree(commitment)?.ownerBytecode.toLowerCase();
    try {
      if (owner && rewards.recipient && parseRewardAddress(rewards.recipient).lockingBytecode === owner) return readLinkInfo(rewards.recipient)?.walletName ?? 'your wallet';
    } catch { return 'the wallet it was planted for'; }
    return 'the wallet it was planted for';
  }
  function confirmSend(commitment: string, name: string) {
    void Haptics.selectionAsync();
    Alert.alert(`Send ${name} to your wallet?`, `It goes to ${destination(commitment)}. Trees in your wallet can't be merged.\n\nCost: a 2,000-sat network fee, ${TEST_COINS}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => run(commitment, { action: 'claim', commitment }) },
    ]);
  }

  // The primary button names the missing step and takes you there, instead of sitting disabled.
  const primary = !opening && !rewards.recipient
    ? <Button label="Link your wallet" icon={icons.wallet} onPress={() => router.push('/link-wallet')} />
    : !opening && !rewards.account
      ? <Button label="Set up wallet in Profile" icon={icons.key} onPress={() => router.push('/profile')} />
      : <Button label={`Lock ${length} for a ${size}`} icon={icons.lock} busy={opening || working === 'plant'} disabled={!ready} onPress={confirmPlant} />;
  const stale = rewards.freshness !== 'current';
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
    <RewardNotice />

    {rewards.account ? <Group title="Ready to send" footer={matured.length ? stale ? 'Pull down to refresh before sending.' : 'Trees planted from Focus are sent on their own.' : undefined}>
      {matured.length === 0
        ? <Row title="Nothing waiting" value={working === 'check' ? 'Checking…' : 'Check again'} accessibilityLabel="Nothing waiting. Check again" disabled={!enabled} onPress={check} />
        : matured.map((session) => {
          const item = nftTree(session.commitment);
          const sending = working === session.commitment;
          return <Row key={session.commitment} title={item.name} detail={`#${item.tag} · ${item.points} focus units`} value={sending ? 'Sending…' : 'Send'} accessibilityLabel={`Send ${item.name} to your wallet`}
            disabled={!enabled || Boolean(rewards.pending) || stale} onPress={() => confirmSend(session.commitment, item.name)} chevron />;
        })}
      {matured.length ? <Row title="Check again" icon={icons.refresh} value={working === 'check' ? 'Checking…' : undefined} disabled={!enabled} onPress={check} /> : null}
    </Group> : null}

    {rewards.account && !rewards.pending ? <Group title="Fees" footer="Paid in free test coins with no cash value: 2,000 sats per transaction, plus a 1,000-sat deposit that stays with each tree.">
      {rewards.data.state === 'connected' ? <Row title="Fee credit" value={`${rewards.data.creditSatoshis.toLocaleString()} sats`} /> : null}
      <Row title="Get credit for planting" value={working === 'credit-plant' ? 'Getting…' : undefined} disabled={!enabled} onPress={() => run('credit-plant', { action: 'credit-plant' })} chevron />
      <Row title="Get credit for sending" value={working === 'credit-claim' ? 'Getting…' : undefined} disabled={!enabled} onPress={() => run('credit-claim', { action: 'credit-claim' })} chevron />
    </Group> : null}
  </>;
});
