import { Text, View } from 'react-native';
import { numerals } from './tokens';

/** A few numbers read as one line of facts: value, then its label. Left-aligned, no boxes or dividers. */
export function Stats({ items }: { items: { value: string; label: string }[] }) {
  return <View className="flex-row flex-wrap gap-x-5 gap-y-1">
    {items.map((item) => <Text key={item.label} accessibilityLabel={`${item.value} ${item.label}`}>
      <Text style={numerals} className="text-title-3 text-ink">{item.value}</Text>
      <Text className="text-subhead text-ink-2"> {item.label}</Text>
    </Text>)}
  </View>;
}
