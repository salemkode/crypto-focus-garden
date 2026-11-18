import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { parseTree } from '@focus-garden/protocol/forest';
import { Model3D } from '../../../components/Model3D';
import { PendingOperation } from '../../../components/PendingOperation';
import { speciesById } from '../../../features/focus/catalog';
import { useFocusGarden } from '../../../features/focus/FocusProvider';
import { nftTree } from '../../../features/forest/nft-style';
import { useRewards } from '../../../features/rewards/RewardProvider';
import { connectWallet } from '../../../features/wallet/wallet';
import { fetchProfile, focusHours } from '../../../services/community';
import { readDisplayName, saveDisplayName } from '../../../features/profile/local';
import { forestTrees } from '../../../services/garden';
import { readLinkInfo } from '../../../features/wallet-link/useWalletLink';
import { Button, color, Field, Group, Icon, icons, nativeAware, Notice, Row, Screen, Segmented, Stage, Stats } from '../../../ui';

const WALLET_KINDS = [{ id: 'xo', label: 'Recovery phrase' }, { id: 'foundation', label: 'Early key' }] as const;

const short = (address: string) => `${address.replace('bchtest:', '').slice(0, 6)}…${address.slice(-4)}`;

/** Hours as a short fact: "0 h", "2.5 h", "14 h" (never "0.0 h"). */
const hoursText = (hours: number) => hours >= 10 ? `${Math.round(hours)} h` : `${Number(hours.toFixed(1))} h`;

export default function ProfileScreen() {
  const rewards = useRewards();
  const { garden } = useFocusGarden();
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
  useEffect(() => {
    if (!wallet) return;
    let active = true;
    fetchProfile(wallet).then((result) => { if (active) setProfile(result); }).catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [wallet, reload]);

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
    ? `Focus Garden wallet: ${rewards.data.creditSatoshis.toLocaleString()} sats for network fees.`
    : 'The Focus Garden wallet pays network fees for your trees.';

  return <Screen title="Profile">
    <View className="flex-row items-center gap-4">
      <Stage round style={{ width: 76, height: 76 }}><Model3D spec={{ tier: best?.tier.key ?? 'sprout', species: best?.localSpecies ?? 'oak', seed: best?.seed ?? 4 }} size={74} /></Stage>
      <View className="flex-1 items-start gap-1.5">
        <Text numberOfLines={1} className="text-title-2 text-ink">{profile && profile.state !== 'none' ? profile.name : displayName || 'Gardener'}</Text>
        <View className={isPublic ? 'flex-row items-center gap-1.5 rounded-full bg-moss-soft px-2.5 py-0.5' : 'flex-row items-center gap-1.5 rounded-full bg-sunk px-2.5 py-0.5'}>
          <Icon name={isPublic ? icons.globe : icons.lock} size={10} tint={isPublic ? color.moss : color.ink2} />
          <Text className={isPublic ? 'text-footnote font-semibold text-moss' : 'text-footnote font-semibold text-ink-2'}>{status}</Text>
        </View>
      </View>
    </View>
    {isPublic && profile.about ? <Text className="-mt-3 px-1 text-body text-ink-2">“{profile.about}”</Text> : null}

    <View className="-mt-2 px-1"><Stats items={[
      { value: verified ? focusHours(verified).replace('.0 h', ' h') : '0 h', label: 'verified' },
      { value: `${items.length}`, label: items.length === 1 ? 'reward' : 'rewards' },
      { value: hoursText(practiced / 3600), label: 'focused in total' },
    ]} /></View>

    <PendingOperation />

    <Group title="Wallet" footer={fees}>
      <Row title="Your wallet" icon={icons.wallet} value={rewards.recipient ? readLinkInfo(rewards.recipient)?.walletName ?? short(rewards.recipient) : 'Not linked'} onPress={() => router.push('/link-wallet')} chevron />
      <Row title="Focus Garden wallet" icon={icons.key} iconTint={color.ink2} value={rewards.account ? short(rewards.account.address) : 'Set up'}
        accessibilityLabel={rewards.account ? 'Focus Garden wallet. Copy address' : 'Set up Focus Garden wallet'}
        onPress={rewards.account ? () => { void Clipboard.setStringAsync(rewards.account!.address); void Haptics.selectionAsync(); } : openWallet}
        trailingIcon={rewards.account ? icons.copy : undefined} chevron={!rewards.account} />
      {/* Before setup, restoring sits next to "Set up" so an existing wallet is restored rather than replaced by a new one. */}
      {rewards.account
        ? <Row title="Back up Focus Garden wallet" onPress={() => router.push('/wallet-backup')} chevron />
        : <Row title="Restore a Focus Garden wallet" onPress={() => router.push('/restore-wallet')} chevron />}
    </Group>
    {notice ? <Notice tone="error">{notice}</Notice> : rewards.notice ? <Notice>{rewards.notice}</Notice> : null}

    {!isPublic && profile?.state !== 'pending'
      ? <PublicProfile key={join ?? ''} initiallyOpen={Boolean(join)} displayName={displayName} onNameChange={saveName} onJoined={loadProfile} />
      : null}

    <Group title="Focus">
      <Row title="Verified trees" icon={icons.lock} iconTint={color.bch} onPress={() => router.push('/chain')} chevron />
      <Row title="Tree style" icon={icons.leaf} value={speciesById(garden.species).name} onPress={() => router.push('/species')} chevron />
      <Row title="Focus rules" icon={icons.rules} iconTint={color.ink2} value={garden.blockApps ? 'Blocking on' : 'Blocking off'} onPress={() => router.push('/settings')} chevron />
      <Row title="Replay introduction" icon={icons.intro} iconTint={color.sunInk} onPress={() => router.push('/welcome')} chevron />
    </Group>

    <AdvancedSection />
    <Text className="text-center text-footnote text-ink-2">Focus Garden {Constants.expoConfig?.version ?? ''} on Chipnet, the Bitcoin Cash test network</Text>
  </Screen>;
}

/** One row until the user chooses to join; then the name, about and join button. */
const PublicProfile = nativeAware(function PublicProfile({ initiallyOpen, displayName, onNameChange, onJoined }: {
  initiallyOpen: boolean; displayName: string; onNameChange: (next: string) => void; onJoined: () => void;
}) {
  const rewards = useRewards();
  const [open, setOpen] = useState(initiallyOpen);
  const [about, setAbout] = useState('');
  return <>
    <Group>
      <Row title="Public profile" icon={icons.globe} value={open ? 'Hide' : 'Not joined'} onPress={() => setOpen(!open)} chevron={!open} />
    </Group>
    {open ? <>
      <Field label="Display name" helper="Shown publicly on Bitcoin Cash. It can't be changed later." autoCorrect={false} autoCapitalize="words" textContentType="nickname" value={displayName} onChangeText={onNameChange} maxLength={32} placeholder="At least 3 letters" />
      <Field label="About you (optional)" value={about} onChangeText={setAbout} maxLength={140} placeholder="What do you focus on?" multiline />
      <Button variant="secondary" icon={icons.globe} label="Join the leaderboard" disabled={!rewards.account || rewards.status !== 'ready' || displayName.trim().length < 3 || Boolean(rewards.pending)} onPress={() => rewards.transact({ action: 'register', name: displayName.trim(), about: about.trim() }).then(onJoined)} />
    </> : null}
  </>;
});

const AdvancedSection = nativeAware(function AdvancedSection() {
  const rewards = useRewards();
  const [open, setOpen] = useState(false);
  const [credential, setCredential] = useState('');
  return <>
    <Group>
      <Row title={open ? 'Hide advanced' : 'Advanced'} onPress={() => setOpen(!open)} chevron={!open} />
    </Group>
    {open ? <>
      {rewards.account ? <Group>
        <Row title="Restore a Focus Garden wallet" onPress={() => router.push('/restore-wallet')} chevron />
      </Group> : null}
      <Field label="Garden access key" helper="Stored in this phone's secure storage." secureTextEntry autoComplete="off" textContentType="none" importantForAutofill="no" value={credential} onChangeText={setCredential} autoCorrect={false} autoCapitalize="none" placeholder="64 characters" />
      <Button variant="secondary" label="Save access key" disabled={rewards.status !== 'ready' || !credential.trim()} onPress={async () => { await rewards.transact({ action: 'credential', token: credential }); setCredential(''); }} />
      <Group title="Focus Garden wallet type" footer="Early test versions used a single key. Both stay available and neither is overwritten.">
        <Segmented options={WALLET_KINDS} value={rewards.account?.kind ?? 'xo'} disabled={rewards.pending !== null || rewards.status !== 'ready'} onChange={(kind) => rewards.selectWallet(kind).catch(() => undefined)} />
      </Group>
    </> : null}
  </>;
});
