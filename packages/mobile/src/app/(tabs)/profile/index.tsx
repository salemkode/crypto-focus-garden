import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AccessibilityInfo, Alert, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { parseTree } from '@focus-garden/protocol/forest';
import { Model3D } from '../../../components/Model3D';
import { PendingOperation, RewardNotice } from '../../../components/PendingOperation';
import { SESSION_STEP, speciesById } from '../../../features/focus/catalog';
import { useFocusGarden } from '../../../features/focus/FocusProvider';
import { formatDuration } from '../../../features/focus/stats';
import { nftTree } from '../../../features/forest/nft-style';
import { useRewards } from '../../../features/rewards/RewardProvider';
import { useShield } from '../../../features/shield/useShield';
import { connectWallet } from '../../../features/wallet/wallet';
import { fetchProfile } from '../../../services/community';
import { readDisplayName, saveDisplayName } from '../../../features/profile/local';
import { forestTrees } from '../../../services/garden';
import { readLinkInfo } from '../../../features/wallet-link/useWalletLink';
import { IS_MAINNET, MONEY_NOTE } from '../../../services/network';
import { Button, color, Field, Group, Icon, icons, nativeAware, Notice, Row, Screen, Segmented, Stage, Stats } from '../../../ui';

const WALLET_KINDS = [{ id: 'xo', label: 'Recovery phrase' }, { id: 'foundation', label: 'Early key' }] as const;

const short = (address: string) => `${address.replace(/^[a-z]+:/, '').slice(0, 6)}…${address.slice(-4)}`;

export default function ProfileScreen() {
  const rewards = useRewards();
  const { garden } = useFocusGarden();
  const shield = useShield();
  // Other screens can open the leaderboard form directly: /profile?join=1
  const { join } = useLocalSearchParams<{ join?: string }>();
  const [displayName, setDisplayName] = useState(readDisplayName);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchProfile>> | null>(null);
  const [notice, setNotice] = useState('');
  const sessions = rewards.data.state === 'connected' ? rewards.data.sessions : [];
  const items = forestTrees(sessions).map((session) => nftTree(session.commitment));
  const best = [...items].sort((a, b) => b.tier.code - a.tier.code)[0];
  const verified = forestTrees(sessions).reduce((sum, session) => sum + (parseTree(session.commitment)?.points ?? 0), 0);
  const practiced = garden.records.filter((record) => record.outcome === 'grown').reduce((sum, record) => sum + record.duration, 0);

  const [reload, setReload] = useState(0);
  const loadProfile = () => setReload((value) => value + 1);
  const wallet = rewards.data.state === 'connected' ? rewards.account?.address : undefined;
  /** The wallet whose profile has been read (or failed to read); until then nothing guesses its state. */
  const [checked, setChecked] = useState<string | null>(null);
  useEffect(() => {
    if (!wallet) return;
    let active = true;
    fetchProfile(wallet).then((result) => { if (active) setProfile(result); }).catch(() => { if (active) setProfile(null); })
      .finally(() => { if (active) setChecked(wallet); });
    return () => { active = false; };
  }, [wallet, reload]);
  const checking = Boolean(wallet) && checked !== wallet;

  // Copying has no visible effect of its own, so the row says "Copied" for a moment.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);
  function copyAddress(address: string) {
    void Clipboard.setStringAsync(address);
    void Haptics.selectionAsync();
    setCopied(true);
    AccessibilityInfo.announceForAccessibility('Address copied');
  }

  function saveName(next: string) {
    setDisplayName(next);
    saveDisplayName(next);
  }
  async function openWallet() {
    setNotice('');
    try { await connectWallet(); await rewards.selectWallet('xo'); await rewards.open(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not open the wallet. Existing keys have not been replaced.'); }
  }

  const isPublic = profile?.state === 'public';
  const status = isPublic ? 'Public profile' : profile?.state === 'pending' ? 'Confirming profile' : 'Private';
  const fees = rewards.data.state === 'connected'
    ? `Focus Garden wallet: ${rewards.data.balanceSatoshis.toLocaleString()} sats for network fees.`
    : 'The Focus Garden wallet pays network fees for your trees.';

  return <Screen title="Profile">
    <View className="flex-row items-center gap-4">
      <Stage round style={{ width: 76, height: 76 }}><Model3D spec={{ tier: best?.tier.key ?? 'sprout', species: best?.localSpecies ?? 'oak', seed: best?.seed ?? 4 }} size={74} /></Stage>
      <View className="flex-1 items-start gap-1.5">
        <Text accessibilityRole="header" numberOfLines={1} className="text-title-2 text-ink">{profile && profile.state !== 'none' ? profile.name : displayName || 'Gardener'}</Text>
        {/* Held invisible while the profile is read, so "Private" never flashes before "Public profile". */}
        <View accessibilityElementsHidden={checking} importantForAccessibility={checking ? 'no-hide-descendants' : 'auto'} style={{ opacity: checking ? 0 : 1 }}
          className={isPublic ? 'flex-row items-center gap-1.5 rounded-full bg-moss-soft px-2.5 py-0.5' : 'flex-row items-center gap-1.5 rounded-full bg-sunk px-2.5 py-0.5'}>
          <Icon name={isPublic ? icons.globe : icons.lock} size={10} tint={isPublic ? color.moss : color.ink2} />
          <Text className={isPublic ? 'text-footnote font-semibold text-moss' : 'text-footnote font-semibold text-ink-2'}>{status}</Text>
        </View>
      </View>
    </View>
    {isPublic && profile.about ? <Text className="-mt-3 px-1 text-body text-ink-2">“{profile.about}”</Text> : null}

    <View className="-mt-2 px-1"><Stats items={[
      { value: formatDuration(verified * SESSION_STEP), label: 'verified' },
      { value: `${items.length}`, label: items.length === 1 ? 'reward' : 'rewards' },
      { value: formatDuration(practiced), label: 'focused in total' },
    ]} /></View>

    <PendingOperation />

    <Group title="Wallet" footer={fees}>
      <Row title="Your wallet" icon={icons.wallet} value={rewards.recipient ? readLinkInfo(rewards.recipient)?.walletName ?? short(rewards.recipient) : 'Not linked'} onPress={() => router.push('/link-wallet')} chevron />
      <Row title="Focus Garden wallet" icon={icons.key} iconTint={color.ink2} value={rewards.account ? copied ? 'Copied' : short(rewards.account.address) : 'Set up'}
        accessibilityLabel={rewards.account ? 'Focus Garden wallet. Copy address' : 'Set up your Focus Garden wallet'}
        onPress={rewards.account ? () => copyAddress(rewards.account!.address) : openWallet}
        trailingIcon={rewards.account ? copied ? icons.check : icons.copy : undefined} chevron={!rewards.account} />
      {/* Before setup, restoring sits next to "Set up" so an existing wallet is restored rather than replaced by a new one. */}
      {rewards.account
        ? <Row title="Back up Focus Garden wallet" onPress={() => router.push('/wallet-backup')} chevron />
        : <Row title="Restore a Focus Garden wallet" onPress={() => router.push('/restore-wallet')} chevron />}
    </Group>
    {notice ? <Notice tone="error">{notice}</Notice> : <RewardNotice />}

    {!checking && !isPublic && profile?.state !== 'pending'
      ? <PublicProfile key={join ?? ''} initiallyOpen={Boolean(join)} displayName={displayName} onNameChange={saveName} onJoined={loadProfile} />
      : null}

    <Group title="Focus">
      <Row title="Verified trees" icon={icons.lock} iconTint={color.bch} onPress={() => router.push('/chain')} chevron />
      <Row title="Tree style" icon={icons.leaf} value={speciesById(garden.species).name} onPress={() => router.push('/species')} chevron />
      <Row title="Focus rules" icon={icons.rules} iconTint={color.ink2} value={!garden.blockApps ? 'Blocking off' : !shield.status || shield.ready ? 'Blocking on' : 'Set up blocking'} onPress={() => router.push('/settings')} chevron />
      <Row title="Replay introduction" icon={icons.intro} iconTint={color.sunInk} onPress={() => router.push('/welcome')} chevron />
    </Group>

    <AdvancedSection />
    <Text className="text-center text-footnote text-ink-2">Focus Garden {Constants.expoConfig?.version ?? ''} on {IS_MAINNET ? 'Bitcoin Cash' : 'Chipnet, the Bitcoin Cash test network'}</Text>
  </Screen>;
}

/** One row until the user chooses to join; then the name, about and join button. */
const PublicProfile = nativeAware(function PublicProfile({ initiallyOpen, displayName, onNameChange, onJoined }: {
  initiallyOpen: boolean; displayName: string; onNameChange: (next: string) => void; onJoined: () => void;
}) {
  const rewards = useRewards();
  const [open, setOpen] = useState(initiallyOpen);
  const [about, setAbout] = useState('');
  // Joining writes a public, permanent name on Bitcoin Cash and spends from the app wallet: one confirm, as
  // for plant, send, merge and tip, saying exactly what happens and what it costs.
  function confirmJoin() {
    const name = displayName.trim();
    Alert.alert(`Join as ${name}?`, `Your name is written on Bitcoin Cash for everyone to see, and can't be changed later.\n\nCost: a 2,000-sat network fee, plus 1,000 sats kept in your profile card in your Focus Garden wallet, ${MONEY_NOTE}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Join', onPress: () => { void rewards.transact({ action: 'register', name, about: about.trim() }).then(onJoined); } },
    ]);
  }
  return <>
    <Group>
      <Row title="Public profile" icon={icons.globe} value={open ? 'Hide' : 'Not joined'} onPress={() => setOpen(!open)} chevron={!open} />
    </Group>
    {open ? <>
      <Field label="Display name" helper="Shown publicly on Bitcoin Cash. It can't be changed later." autoCorrect={false} autoCapitalize="words" textContentType="nickname" value={displayName} onChangeText={onNameChange} maxLength={32} placeholder="At least 3 letters" />
      <Field label="About you (optional)" value={about} onChangeText={setAbout} maxLength={140} placeholder="What do you focus on?" multiline />
      <Button variant="secondary" icon={icons.globe} label="Join the leaderboard" disabled={!rewards.account || rewards.status !== 'ready' || displayName.trim().length < 3 || Boolean(rewards.pending)} onPress={confirmJoin} />
    </> : null}
  </>;
});

const AdvancedSection = nativeAware(function AdvancedSection() {
  const rewards = useRewards();
  const [open, setOpen] = useState(false);
  return <>
    <Group>
      <Row title="Advanced" value={open ? 'Hide' : undefined} onPress={() => setOpen(!open)} chevron={!open} />
    </Group>
    {open ? <>
      {rewards.account ? <Group>
        <Row title="Restore a Focus Garden wallet" onPress={() => router.push('/restore-wallet')} chevron />
      </Group> : null}
      <Group title="Focus Garden wallet type" footer="Early test versions used a single key. Both stay available and neither is overwritten.">
        <Segmented options={WALLET_KINDS} value={rewards.account?.kind ?? 'xo'} disabled={rewards.pending !== null || rewards.status !== 'ready'} onChange={(kind) => rewards.selectWallet(kind).catch(() => undefined)} />
      </Group>
    </> : null}
  </>;
});
