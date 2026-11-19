import type { ComponentProps } from 'react';
import { Button as SwiftButton, Host, HStack, Label, ProgressView, Text } from '@expo/ui/swift-ui';
import { accessibilityHint as a11yHint, accessibilityLabel as a11yLabel, accessibilityValue as a11yValue, buttonBorderShape, buttonStyle, controlSize, disabled as disabledModifier, foregroundStyle, frame, labelStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { Button as RNButton, IconButton as RNIconButton } from './Button.rn';
import { BareSection, markNative, useNativeScope } from './native/scope';
import { color } from './tokens';

type Props = ComponentProps<typeof RNButton>;

const STYLE = { primary: 'glassProminent', sun: 'glassProminent', secondary: 'glass', destructive: 'glass', plain: 'borderless' } as const;
/**
 * Label colours, as on Android: white on moss, ink on sun (white on sun fails contrast), ink on the
 * neutral glass, ember for loss (not the system red). Plain buttons keep the moss tint.
 */
const INK = { primary: undefined, sun: color.ink, secondary: color.ink, destructive: color.ember, plain: undefined } as const;

/** iOS 26 buttons: glass prominent for the main action, glass for the rest. */
export const Button = markNative(function Button({ label, onPress, variant = 'primary', size = 'large', icon, disabled, busy, accessibilityLabel, accessibilityHint, grow }: Props) {
  const scope = useNativeScope();
  // Full-width buttons in forms and stacked layouts; text buttons and small ones hug their label.
  const fill = scope !== 'section' && variant !== 'plain' && size !== 'small';
  // A disabled button keeps the system's dimmed label so it still reads as unavailable.
  const ink = disabled || busy ? undefined : INK[variant];
  const fillFrame = fill ? [frame({ maxWidth: Infinity })] : [];
  const labelModifiers = [...fillFrame, ...(ink ? [foregroundStyle(ink)] : [])];
  // Busy keeps the label next to a spinner (as on Android), so the button keeps its meaning.
  const body = busy ? <HStack spacing={8} modifiers={fillFrame}><ProgressView /><Text>{label}</Text></HStack>
    : icon ? <Label title={label} systemImage={icon.ios as never} modifiers={labelModifiers} />
    : <Text modifiers={labelModifiers}>{label}</Text>;
  const button = <SwiftButton onPress={onPress} role={variant === 'destructive' ? 'destructive' : undefined} modifiers={[
    buttonStyle(STYLE[variant]),
    controlSize(size === 'large' ? 'large' : size === 'medium' ? 'regular' : 'small'),
    ...(variant === 'sun' ? [tint(color.sun)] : []),
    ...(disabled || busy ? [disabledModifier()] : []),
    a11yLabel(accessibilityLabel ?? label),
    ...(accessibilityHint ? [a11yHint(accessibilityHint)] : []),
    ...(busy ? [a11yValue('In progress')] : []),
  ]}>{body}</SwiftButton>;
  if (scope === 'form') return <BareSection>{button}</BareSection>;
  if (scope === 'section') return button;
  return <Host matchContents={fill ? { vertical: true } : true} style={grow ? { flex: 1 } : fill ? undefined : { alignSelf: 'center' }} seedColor={color.moss}>{button}</Host>;
});

/** iOS: a round glass button with an SF Symbol. */
export function IconButton({ icon, label, onPress, disabled }: ComponentProps<typeof RNIconButton>) {
  return <Host matchContents seedColor={color.ink}>
    <SwiftButton onPress={onPress} systemImage={icon.ios as never} label={label}
      modifiers={[labelStyle('iconOnly'), buttonStyle('glass'), buttonBorderShape('circle'), controlSize('large'), ...(disabled ? [disabledModifier()] : [])]} />
  </Host>;
}
