import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon, icons } from './Icon';
import { color, numerals } from './tokens';

export type MenuOption<T extends string> = { id: T; label: string; color?: string };

/** Pick one of several named options. Android and web: a row of capsules. iOS: a native menu. */
export function MenuPicker<T extends string>({ title, options, value, onChange, disabled }: {
  title: string; options: readonly MenuOption<T>[]; value: T; onChange: (next: T) => void; disabled?: boolean;
}) {
  return <View className="gap-2.5 px-4 py-3">
    <Text className="text-body text-ink">{title}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={title} className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.id === value;
        return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: Boolean(disabled) }} disabled={disabled}
          onPress={() => { onChange(option.id); void Haptics.selectionAsync(); }}
          className={selected ? 'min-h-9 flex-row items-center gap-2 rounded-full bg-moss px-3.5 disabled:opacity-40' : 'min-h-9 flex-row items-center gap-2 rounded-full bg-sunk px-3.5 active:opacity-70 disabled:opacity-40'}>
          {option.color ? <View style={{ backgroundColor: option.color }} className="h-2.5 w-2.5 rounded-full" /> : null}
          <Text className={selected ? 'text-subhead font-semibold text-surface' : 'text-subhead text-ink'}>{option.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

/** A number changed in steps. Android and web: minus and plus buttons. iOS: a native Stepper. */
export function StepperRow({ title, value, step, min, max, onChange, disabled }: {
  title: string; value: number; step: number; min: number; max: number; onChange: (next: number) => void; disabled?: boolean;
}) {
  const button = (label: string, icon: typeof icons.plus | typeof icons.minus, next: number, off: boolean) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || off} onPress={() => { onChange(next); void Haptics.selectionAsync(); }}
      className="h-9 w-11 items-center justify-center rounded-full bg-sunk active:opacity-60 disabled:opacity-30">
      <Icon name={icon} size={15} tint={color.ink} weight="bold" />
    </Pressable>;
  return <View className="min-h-12 flex-row items-center gap-2 px-4 py-2">
    <Text style={numerals} className="flex-1 text-body text-ink">{title}</Text>
    {button('Less', icons.minus, Math.max(min, value - step), value <= min)}
    {button('More', icons.plus, Math.min(max, value + step), value >= max)}
  </View>;
}
