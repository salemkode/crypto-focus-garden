import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ItemView } from '../components/ItemView';
import { levelForSeconds, levelName, MAX_SESSION, SESSION_STEP, SPECIES, TAGS } from '../features/focus/catalog';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { formatDuration } from '../features/focus/stats';
import { useRewards } from '../features/rewards/RewardProvider';
import { useShield } from '../features/shield/useShield';
import { color, Group, Icon, icons, MenuPicker, Row, Screen, Stage, SwitchRow } from '../ui';

const TAG_OPTIONS = TAGS.map((tag) => ({ id: tag.id, label: tag.label, color: tag.color }));
/** One option per 512-second step (Bitcoin Cash lock steps), up to seven: just under an hour. */
const STEPS = Array.from({ length: MAX_SESSION / SESSION_STEP }, (_, index) => (index + 1) * SESSION_STEP);
const lengthLabel = (seconds: number) => `${formatDuration(seconds)} · ${levelName(levelForSeconds(seconds))}`;

/** The next session on one sheet: length, tree, tag and whether it is verified. */
export default function SessionSheet() {
  const { garden, configure } = useFocusGarden();
  const rewards = useRewards();
  const shield = useShield();
  const locked = garden.timer.status === 'growing';
  const linked = Boolean(rewards.recipient);
  const canVerify = Boolean(rewards.account && linked && rewards.data.state === 'connected');
  const pick = (change: Parameters<typeof configure>[0]) => { configure(change); void Haptics.selectionAsync(); };

  // Every step length is offered. Test builds add a 1-minute session; any other saved length
  // (from an older version) stays visible until the user picks a new one.
  const lengths = [
    ...STEPS.map((seconds) => ({ id: String(seconds), label: lengthLabel(seconds) })),
    ...(__DEV__ ? [{ id: '60', label: '1 min · test build' }] : []),
  ];
  if (!lengths.some((option) => option.id === String(garden.duration))) lengths.push({ id: String(garden.duration), label: lengthLabel(garden.duration) });
  const count = shield.status?.selectionCount ?? 0;
  // "Set up" only once the blocking status is known, so it never flashes before the app count.
  const blocking = !garden.blockApps ? 'Off' : shield.ready ? `${count} ${count === 1 ? 'app' : 'apps'}` : shield.status ? 'Set up' : 'On';
  // While the wallet session opens, say so; if its last read failed, offer a read-only retry (never a transaction).
  // "Busy" alone is any transaction or refresh; it means connecting only while the garden has not loaded yet (as on Leaders).
  const reconnecting = rewards.status === 'opening' || (rewards.status === 'busy' && Boolean(rewards.account) && rewards.data.state !== 'connected');

  return <Screen>
    <Group footer="For longer focus, plant again and merge.">
      <MenuPicker title="Length" options={lengths} value={String(garden.duration)} disabled={locked} onChange={(next) => configure({ duration: Number(next) })} />
      <MenuPicker title="Tag" options={TAG_OPTIONS} value={garden.tag} disabled={locked} onChange={(next) => configure({ tag: next })} />
    </Group>

    <Group title="Tree">
      <ScrollView horizontal accessibilityRole="radiogroup" accessibilityLabel="Tree" showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 p-3">{SPECIES.map((entry) => {
        const chosen = garden.species === entry.id;
        return <Pressable key={entry.id} accessibilityRole="radio" accessibilityLabel={entry.name} accessibilityState={{ checked: chosen, disabled: locked }} disabled={locked}
          onPress={() => pick({ species: entry.id })} className="w-[84px] items-center gap-1.5 active:opacity-70 disabled:opacity-40">
          <Stage style={{ width: 84, height: 96, borderWidth: chosen ? 3 : 0, borderColor: color.moss }}>
            <ItemView tier="tree" species={entry.id} seed={2} size={56} />
            {chosen ? <View className="absolute right-1.5 top-1.5 rounded-full bg-surface"><Icon name={icons.checkCircle} size={20} tint={color.moss} /></View> : null}
          </Stage>
          <Text numberOfLines={2} className={chosen ? 'text-center text-footnote font-semibold text-moss' : 'text-center text-footnote text-ink-2'}>{entry.name}</Text>
        </Pressable>;
      })}</ScrollView>
    </Group>

    <Group footer={canVerify ? 'Locked on Bitcoin Cash and sent to your wallet when it grows.' : undefined}>
      {canVerify ? <SwitchRow title="Verify on Bitcoin Cash" icon={icons.lock} iconTint={color.bch} value={garden.verify} disabled={locked} onValueChange={(next) => configure({ verify: next })} />
        : !linked ? <Row title="Link your wallet to verify" icon={icons.lock} iconTint={color.bch} onPress={() => router.push('/link-wallet')} chevron />
        : !rewards.account ? <Row title="Set up your Focus Garden wallet to verify" icon={icons.lock} iconTint={color.bch} onPress={() => router.navigate('/profile')} chevron />
        : reconnecting ? <Row title="Verify on Bitcoin Cash" detail="Connecting…" icon={icons.lock} iconTint={color.bch} />
        : rewards.freshness === 'stale' ? <Row title="Verify on Bitcoin Cash" detail="Couldn't connect. Tap to try again." icon={icons.lock} iconTint={color.bch} onPress={() => void rewards.refresh()} />
        : <Row title="Verify on Bitcoin Cash" detail="Not available right now" icon={icons.lock} iconTint={color.bch} />}
      <Row title="Block apps" icon={icons.shield} iconTint={color.ember} value={blocking} onPress={() => router.push('/settings')} chevron />
    </Group>
  </Screen>;
}
