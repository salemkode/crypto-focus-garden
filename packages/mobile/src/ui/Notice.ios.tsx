import type { ComponentProps } from 'react';
import { Image, Label, Section, Text } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { markNative, useNativeScope } from './native/scope';
import { Notice as RNNotice } from './Notice.rn';
import { color } from './tokens';

// Same colours as the Android box: the symbol carries the tone, the text stays ink (ember for errors).
const TONE = {
  info: { symbol: 'info.circle.fill', tint: color.ink2, text: color.ink },
  warning: { symbol: 'exclamationmark.triangle.fill', tint: color.sunInk, text: color.ink },
  error: { symbol: 'exclamationmark.triangle.fill', tint: color.ember, text: color.ember },
} as const;

/** iOS: a one-row section with a symbol. */
export const Notice = markNative(function Notice(props: ComponentProps<typeof RNNotice>) {
  if (useNativeScope() !== 'form') return <RNNotice {...props} />;
  const tone = TONE[props.tone ?? 'info'];
  return <Section>
    <Label icon={<Image systemName={tone.symbol} color={tone.tint} />}>
      <Text modifiers={[foregroundStyle(tone.text)]}>{props.children}</Text>
    </Label>
  </Section>;
});
