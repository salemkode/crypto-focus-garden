import type { ComponentProps } from 'react';
import * as Haptics from 'expo-haptics';
import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { disabled as disabledModifier, labelsHidden, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { BareSection, markNative, useNativeScope } from './native/scope';
import { Segmented as RNSegmented } from './Segmented.rn';
import { color } from './tokens';

/** iOS: a SwiftUI segmented Picker. */
export const Segmented = markNative(function Segmented<T extends string>({ options, value, onChange, disabled }: ComponentProps<typeof RNSegmented<T>>) {
  const scope = useNativeScope();
  const picker = <Picker<string> selection={value} onSelectionChange={(next) => { if (next !== value) { onChange(next as T); void Haptics.selectionAsync(); } }}
    modifiers={[pickerStyle('segmented'), labelsHidden(), ...(disabled ? [disabledModifier()] : [])]}>
    {options.map((option) => <Text key={option.id} modifiers={[tag(option.id)]}>{option.label}</Text>)}
  </Picker>;
  if (scope === 'form') return <BareSection>{picker}</BareSection>;
  if (scope === 'section') return picker;
  return <Host matchContents={{ vertical: true }} seedColor={color.moss}>{picker}</Host>;
}) as typeof RNSegmented;
