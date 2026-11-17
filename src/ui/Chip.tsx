import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

/** Selectable capsule for small choices (tags, styles, amounts). */
export function Chip({ label, selected, onPress, disabled, leading, accessibilityLabel }: {
  label: string; selected: boolean; onPress: () => void; disabled?: boolean; leading?: ReactNode; accessibilityLabel?: string;
}) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ checked: selected, disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    className={selected ? 'min-h-9 flex-row items-center gap-2 rounded-full bg-ink px-4 active:opacity-80 disabled:opacity-40' : 'min-h-9 flex-row items-center gap-2 rounded-full bg-surface px-4 active:bg-sunk disabled:opacity-40'}>
    {leading}
    <Text numberOfLines={1} className={selected ? 'text-subhead font-semibold text-surface' : 'text-subhead text-ink'}>{label}</Text>
  </Pressable>;
}
