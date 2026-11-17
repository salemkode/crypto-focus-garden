import type { ComponentProps } from 'react';
import { Button as SwiftButton, Host, Label, ProgressView, Text } from '@expo/ui/swift-ui';
import { accessibilityHint as a11yHint, accessibilityLabel as a11yLabel, buttonBorderShape, buttonStyle, controlSize, disabled as disabledModifier, frame, labelStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { Button as RNButton, IconButton as RNIconButton } from './Button.rn';
import { BareSection, markNative, useNativeScope } from './native/scope';
import { color } from './tokens';

type Props = ComponentProps<typeof RNButton>;

const STYLE = { primary: 'glassProminent', sun: 'glassProminent', secondary: 'glass', destructive: 'glass', plain: 'borderless' } as const;

/** iOS 26 buttons: glass prominent for the main action, glass for the rest. */
export const Button = markNative(function Button({ label, onPress, variant = 'primary', size = 'large', icon, disabled, busy, accessibilityLabel, accessibilityHint, grow }: Props) {
  const scope = useNativeScope();
  // Full-width buttons in forms and stacked layouts; text buttons and small ones hug their label.
  const fill = scope !== 'section' && variant !== 'plain' && size !== 'small';
  const fillFrame = fill ? [frame({ maxWidth: Infinity })] : [];
  const body = busy ? <ProgressView modifiers={fillFrame} />
    : icon ? <Label title={label} systemImage={icon.ios as never} modifiers={fillFrame} />
    : <Text modifiers={fillFrame}>{label}</Text>;
  const button = <SwiftButton onPress={onPress} role={variant === 'destructive' ? 'destructive' : undefined} modifiers={[
    buttonStyle(STYLE[variant]),
    controlSize(size === 'large' ? 'large' : size === 'medium' ? 'regular' : 'small'),
    ...(variant === 'sun' ? [tint(color.sun)] : []),
    ...(disabled || busy ? [disabledModifier()] : []),
    a11yLabel(accessibilityLabel ?? label),
    ...(accessibilityHint ? [a11yHint(accessibilityHint)] : []),
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
