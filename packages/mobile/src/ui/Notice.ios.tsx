import type { ComponentProps } from 'react';
import { Label, Section } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { markNative, useNativeScope } from './native/scope';
import { Notice as RNNotice } from './Notice.rn';
import { color } from './tokens';

const TONE = {
  info: { symbol: 'info.circle.fill', tint: color.ink2 },
  warning: { symbol: 'exclamationmark.triangle.fill', tint: color.sunInk },
  error: { symbol: 'exclamationmark.triangle.fill', tint: color.ember },
} as const;

/** iOS: a one-row section with a symbol. */
export const Notice = markNative(function Notice(props: ComponentProps<typeof RNNotice>) {
  if (useNativeScope() !== 'form') return <RNNotice {...props} />;
  const tone = TONE[props.tone ?? 'info'];
  return <Section><Label title={props.children} systemImage={tone.symbol} modifiers={[foregroundStyle(tone.tint)]} /></Section>;
});
