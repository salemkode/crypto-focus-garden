import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Capsule segmented control. Segments are 36 tall in a 40 track, with a hit slop up to 44. */
export function Segmented<T extends string>({ options, value, onChange, disabled }: {
  options: readonly { id: T; label: string }[]; value: T; onChange: (next: T) => void; disabled?: boolean;
}) {
  return <View accessibilityRole="tablist" className={`flex-row rounded-full bg-sunk p-0.5 ${disabled ? 'opacity-40' : ''}`}>
    {options.map((option) => {
      const selected = option.id === value;
      return <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected, disabled: Boolean(disabled) }} disabled={disabled} hitSlop={{ top: 4, bottom: 4 }}
        onPress={() => { if (!selected) { onChange(option.id); void Haptics.selectionAsync(); } }}
        style={selected ? { boxShadow: '0 1px 3px rgba(21, 36, 27, 0.12)' } : undefined}
        className={selected ? 'min-h-9 flex-1 items-center justify-center rounded-full bg-surface px-3' : 'min-h-9 flex-1 items-center justify-center rounded-full px-3 active:opacity-70'}>
        <Text numberOfLines={1} className={selected ? 'text-subhead font-semibold text-ink' : 'text-subhead text-ink-2'}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
