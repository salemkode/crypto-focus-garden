import type { ComponentProps } from 'react';
import * as Haptics from 'expo-haptics';
import { Picker, Section, Stepper, Text } from '@expo/ui/swift-ui';
import { disabled as disabledModifier, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { MenuPicker as RNMenuPicker, StepperRow as RNStepperRow } from './Choice.rn';
import { markNative, useNativeScope } from './native/scope';

export type { MenuOption } from './Choice.rn';

/** iOS: a SwiftUI Picker with the menu style (value shown on the right, choices in a menu). */
export const MenuPicker = markNative(function MenuPicker<T extends string>(props: ComponentProps<typeof RNMenuPicker<T>>) {
  const scope = useNativeScope();
  if (scope === null) return <RNMenuPicker {...props} />;
  const { title, options, value, onChange, disabled } = props;
  const picker = <Picker<string> label={title} selection={value} onSelectionChange={(next) => { if (next !== value) { onChange(next as T); void Haptics.selectionAsync(); } }}
    modifiers={[pickerStyle('menu'), ...(disabled ? [disabledModifier()] : [])]}>
    {options.map((option) => <Text key={option.id} modifiers={[tag(option.id)]}>{option.label}</Text>)}
  </Picker>;
  return scope === 'form' ? <Section>{picker}</Section> : picker;
}) as typeof RNMenuPicker;

/** iOS: a SwiftUI Stepper row. */
export const StepperRow = markNative(function StepperRow(props: ComponentProps<typeof RNStepperRow>) {
  const scope = useNativeScope();
  if (scope === null) return <RNStepperRow {...props} />;
  const { title, value, step, min, max, onChange, disabled } = props;
  const stepper = <Stepper label={title} value={value} step={step} min={min} max={max} onValueChange={(next) => { onChange(next); void Haptics.selectionAsync(); }}
    modifiers={disabled ? [disabledModifier()] : []} />;
  return scope === 'form' ? <Section>{stepper}</Section> : stepper;
});
