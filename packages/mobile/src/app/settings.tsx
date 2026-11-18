import { useFocusGarden } from '../features/focus/FocusProvider';
import { useShield } from '../features/shield/useShield';
import { color, Group, icons, Notice, Row, Screen, SwitchRow } from '../ui';

const PLATFORM_NOTE = {
  android: 'Opening a blocked app brings you straight back here.',
  ios: 'Screen Time covers blocked apps. Apple keeps your choices private, even from Focus Garden.',
} as const;

export default function SettingsScreen() {
  const { garden, configure } = useFocusGarden();
  const locked = garden.timer.status === 'growing';
  const shield = useShield();
  const platform = shield.status?.platform;
  return <Screen contentClassName="pt-4">
    {locked ? <Notice tone="warning">You can change rules after the current tree finishes.</Notice> : null}

    <Group footer={platform === 'android' || platform === 'ios' ? PLATFORM_NOTE[platform] : 'Available in the iOS and Android apps.'}>
      <SwitchRow title="Block apps while a tree grows" icon={icons.shield} iconTint={color.ember} detail={shield.status?.selectionCount ? `${shield.status.selectionCount} chosen` : undefined}
        value={garden.blockApps} disabled={locked || shield.nextStep === 'unsupported'} onValueChange={async (next) => { if (next && !shield.ready) await shield.continueSetup(); configure({ blockApps: next }); }} />
      {shield.nextStep !== 'unsupported' ? <Row title="Blocked apps" icon={icons.apps} iconTint={color.ember}
        value={shield.ready ? `${shield.status!.selectionCount}` : garden.blockApps ? 'Set up' : undefined} onPress={shield.manage} chevron /> : null}
    </Group>

    <Group title="When you leave the app" footer="Locking the phone or switching apps counts as leaving; notifications and calls do not. The screen stays awake while a tree grows.">
      <Row title="Back within 10 seconds" detail="Stay away longer and your tree withers." icon={icons.clock} iconTint={color.ember} />
    </Group>

  </Screen>;
}
