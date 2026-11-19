import { useEffect, useRef, type ComponentProps } from 'react';
import { SecureField, Section, Text, TextField, useNativeState, type TextFieldRef } from '@expo/ui/swift-ui';
import { accessibilityLabel as a11yLabel, autocorrectionDisabled, disabled as disabledModifier, foregroundStyle, onSubmit, textInputAutocapitalization } from '@expo/ui/swift-ui/modifiers';
import { Field as RNField } from './Field.rn';
import { markNative, useNativeScope } from './native/scope';
import { color } from './tokens';

const CAPITALIZE = { none: 'never', words: 'words', sentences: 'sentences', characters: 'characters' } as const;

/** iOS: a SwiftUI text field in its own section; the label is the section header. */
export const Field = markNative(function Field(props: ComponentProps<typeof RNField>) {
  const scope = useNativeScope();
  if (scope !== 'form') return <RNField {...props} />;
  return <NativeField {...props} />;
});

function NativeField({ label, helper, error, multiline, value, onChangeText, placeholder, secureTextEntry, autoCapitalize, autoCorrect, editable, maxLength, onSubmitEditing }: ComponentProps<typeof RNField>) {
  const ref = useRef<TextFieldRef>(null);
  const text = useNativeState(value ?? '');
  const last = useRef(value ?? '');
  // Keep the native field in step when the screen changes the value itself (for example, clears it).
  useEffect(() => {
    const next = value ?? '';
    if (next === last.current) return;
    last.current = next;
    void ref.current?.setText(next);
  }, [value]);
  const changed = (next: string) => { last.current = next; onChangeText?.(next); };
  const modifiers = [
    // The section header is not the field's label for VoiceOver; without this a secure field is read
    // only as "secure text field".
    a11yLabel(label),
    ...(autoCapitalize ? [textInputAutocapitalization(CAPITALIZE[autoCapitalize])] : []),
    ...(autoCorrect === false ? [autocorrectionDisabled()] : []),
    ...(editable === false ? [disabledModifier()] : []),
    ...(onSubmitEditing ? [onSubmit(() => onSubmitEditing({} as never))] : []),
  ];
  // Label and helper in ink-2, error in ember: the same colours (and contrast) as Group and Android.
  const footer = error ? <Text modifiers={[foregroundStyle(color.ember)]}>{error}</Text> : helper ? <Text modifiers={[foregroundStyle(color.ink2)]}>{helper}</Text> : undefined;
  return <Section header={<Text modifiers={[foregroundStyle(color.ink2)]}>{label}</Text>} footer={footer}>
    {secureTextEntry
      ? <SecureField ref={ref} text={text} placeholder={placeholder} maxLength={maxLength} onTextChange={changed} modifiers={modifiers} />
      : <TextField ref={ref} text={text} placeholder={placeholder} maxLength={maxLength} onTextChange={changed} axis={multiline ? 'vertical' : 'horizontal'} modifiers={modifiers} />}
  </Section>;
}
