import { Group, Row } from './Group';
import type { IconName } from './Icon';
import { nativeAware } from './native/aware';

/**
 * The collapsed, actionable empty state: one row in its own group. The title says what to do (a
 * verb), the detail says why the list is empty, and the row goes there. A chevron shows when it
 * navigates; pass `chevron={false}` for an action done in place (for example, try again).
 * Native on iOS (a one-row Section), a grouped row on Android and web.
 */
export const EmptyState = nativeAware(function EmptyState({ title, detail, icon, iconTint, onPress, chevron = true, disabled }: {
  title: string; detail?: string; icon?: IconName; iconTint?: string; onPress?: () => void; chevron?: boolean; disabled?: boolean;
}) {
  return <Group>
    <Row title={title} detail={detail} icon={icon} iconTint={iconTint} onPress={onPress} chevron={Boolean(onPress) && chevron} disabled={disabled} />
  </Group>;
});
