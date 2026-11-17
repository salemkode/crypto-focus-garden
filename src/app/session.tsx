import { Pressable, ScrollView, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ItemView } from '../components/ItemView';
import { levelForSeconds, levelName, MAX_SESSION, SESSION_PRESETS, SESSION_STEP, SPECIES, TAGS } from '../features/focus/catalog';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { useRewards } from '../features/rewards/RewardProvider';
import { supportsHelperWallet } from '../features/wallet/wallet';
import { useShield } from '../features/shield/useShield';
import { Button, color, Group, icons, MenuPicker, Row, Screen, Segmented, Stage, StepperRow, SwitchRow } from '../ui';

const shortName = (name: string) => { const last = name.split(' ').pop()!; return last[0].toUpperCase() + last.slice(1); };
const PRESETS = SESSION_PRESETS.map((preset) => ({ id: String(preset.seconds), label: preset.label }));
const TAG_OPTIONS = TAGS.map((tag) => ({ id: tag.id, label: tag.label, color: tag.color }));

/** Everything about the next session on one sheet: length, tree, tag, verification and app blocking. */
export default function SessionSheet() {
  const { garden, configure } = useFocusGarden();
  const rewards = useRewards();
  const shield = useShield();
  const locked = garden.timer.status === 'growing';
  const canVerify = Boolean(rewards.account && rewards.recipient && rewards.data.state === 'connected');
  const pick = (change: Parameters<typeof configure>[0]) => { configure(change); void Haptics.selectionAsync(); };
  async function toggleBlocking(next: boolean) {
    if (next && !shield.ready) await shield.continueSetup();
    pick({ blockApps: next });
  }
  // Sessions grow in steps of 512 seconds, up to seven (just under an hour). Longer focus is
  // several sessions merged together in the valley.
  const minutes = Math.round(garden.duration / 60);
  const preset = SESSION_PRESETS.some((entry) => entry.seconds === garden.duration) ? String(garden.duration) : '';
  return <Screen>
    <Group title="Length" footer={`Grows a ${levelName(levelForSeconds(garden.duration)).toLowerCase()}. Up to an hour; for longer focus, plant again and merge.`}>
      <StepperRow title={`${minutes} min`} value={garden.duration} step={SESSION_STEP} min={Math.min(SESSION_STEP, garden.duration)} max={MAX_SESSION} disabled={locked} onChange={(next) => configure({ duration: next })} />
      <Segmented options={PRESETS} value={preset} disabled={locked} onChange={(next) => pick({ duration: Number(next) })} />
    </Group>
    {__DEV__ ? <Button variant="plain" size="small" label="1-minute session (test build)" onPress={() => pick({ duration: 60 })} /> : null}

    <Group title="Tree">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 p-3">{SPECIES.map((entry) => {
        const chosen = garden.species === entry.id;
        return <Pressable key={entry.id} accessibilityRole="radio" accessibilityLabel={entry.name} accessibilityState={{ checked: chosen, disabled: locked }} disabled={locked} onPress={() => pick({ species: entry.id })} className="items-center gap-1.5 active:opacity-70 disabled:opacity-40">
          <Stage style={{ width: 72, height: 84, borderWidth: chosen ? 2.5 : 0, borderColor: color.moss }}><ItemView tier="tree" species={entry.id} seed={2} size={52} /></Stage>
          <Text numberOfLines={1} className={chosen ? 'text-footnote font-semibold text-ink' : 'text-footnote text-ink-2'}>{shortName(entry.name)}</Text>
        </Pressable>;
      })}</ScrollView>
      <MenuPicker title="Tag" options={TAG_OPTIONS} value={garden.tag} disabled={locked} onChange={(next) => configure({ tag: next })} />
    </Group>

    <Group footer={canVerify ? 'A verified tree is locked on Bitcoin Cash and sent to your wallet when it grows.' : supportsHelperWallet ? 'Link your wallet and set up the helper wallet in Profile to verify.' : 'Verified rewards require the iOS or Android app. You can grow your local valley here.'}>
      <SwitchRow title="Verify on Bitcoin Cash" icon={icons.lock} iconTint={color.bch} value={garden.verify && canVerify} disabled={locked || !canVerify} onValueChange={(next) => pick({ verify: next })} />
      <SwitchRow title="Block apps" detail={shield.nextStep === 'unsupported' ? shield.stepLabel ?? undefined : shield.status?.selectionCount ? `${shield.status.selectionCount} chosen` : undefined} icon={icons.shield} iconTint={color.ember}
        value={garden.blockApps} disabled={locked || shield.nextStep === 'unsupported'} onValueChange={toggleBlocking} />
      {garden.blockApps && shield.stepLabel && shield.nextStep !== 'unsupported' ? <Row title={shield.stepLabel} onPress={shield.continueSetup} chevron /> : null}
      {shield.ready ? <Row title="Choose blocked apps" disabled={locked} onPress={shield.chooseApps} chevron /> : null}
    </Group>
  </Screen>;
}
