import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, continuous } from './tokens';

/** Label above the input, helper or error below. Never a placeholder as the label. */
export function Field({ label, helper, error, multiline, ...input }: TextInputProps & { label: string; helper?: string; error?: string }) {
  return <View className="gap-2">
    <Text className="px-1 text-footnote font-semibold text-ink-2">{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={color.ink3} multiline={multiline} {...input} style={[continuous, input.style]}
      className={`${multiline ? 'min-h-24 py-3' : 'min-h-12'} rounded-xl bg-surface px-4 text-body text-ink ${error ? 'border border-ember' : ''}`} />
    {error ? <Text accessibilityRole="alert" className="px-1 text-footnote text-ember">{error}</Text>
      : helper ? <Text className="px-1 text-footnote text-ink-2">{helper}</Text> : null}
  </View>;
}
