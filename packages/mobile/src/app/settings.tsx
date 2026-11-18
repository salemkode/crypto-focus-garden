import { useFocusGarden } from '../features/focus/FocusProvider';
import { LEAVE_RULES } from '../features/focus/catalog';
import { useShield } from '../features/shield/useShield';
import { color, Group, icons, Notice, Row, Screen, SwitchRow } from '../ui';

const PLATFORM_NOTE = {
  android: 'Opening a blocked app brings you back here.',
  ios: 'Screen Time shields them until the tree finishes.',
} as const;

/** The rules every session follows: app blocking (the only home of its switch) and leaving the app. */
export default function SettingsScreen() {
  const { garden, configure } = useFocusGarden();
  const locked = garden.timer.status === 'growing';
  const shield = useShield();
  const status = shield.status;
  const unsupported = shield.nextStep === 'unsupported';
  // iOS handles Screen Time access on the Blocked apps screen; Android's permission steps run from here.
  const setupStep = status && status.platform === 'android' && garden.blockApps && shield.nextStep && shield.nextStep !== 'choose' && !unsupported ? shield.stepLabel : null;
  const footer = !status ? undefined : unsupported ? shield.stepLabel ?? undefined : status.platform === 'android' || status.platform === 'ios' ? PLATFORM_NOTE[status.platform] : undefined;
  // Leaving is always strict (graceSeconds in session.ts; user decision, 16 November 2026). Older
  // saved rules no longer change it, so it is shown as a fact, not offered as a choice.
  return <Screen contentClassName="pt-4">
    {locked ? <Notice tone="warning">You can change rules after this tree finishes.</Notice> : null}

    <Group footer={footer}>
      <SwitchRow title="Block apps while a tree grows" icon={icons.shield} iconTint={color.ember}
        value={garden.blockApps} disabled={locked || unsupported} onValueChange={async (next) => { if (next && !shield.ready) await shield.continueSetup(); configure({ blockApps: next }); }} />
      {setupStep ? <Row title={setupStep} icon={icons.key} iconTint={color.moss} disabled={locked} onPress={shield.continueSetup} chevron /> : null}
      {unsupported ? null : <Row title="Blocked apps" icon={icons.apps} iconTint={color.ember}
        value={shield.ready ? `${status!.selectionCount}` : garden.blockApps ? 'Set up' : 'None'} onPress={shield.manage} chevron />}
    </Group>

    <Group title="When you leave the app" footer="Locking the phone or switching apps counts. Calls and notifications don't.">
      <Row title="Your tree withers after" value={`${LEAVE_RULES.strict.graceSeconds} seconds`} icon={icons.clock} iconTint={color.ember} />
    </Group>
  </Screen>;
}
