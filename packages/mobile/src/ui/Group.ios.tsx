import type { ComponentProps } from 'react';
import { Button as SwiftButton, HStack, Image, Section, Spacer, Text, Toggle, VStack } from '@expo/ui/swift-ui';
import { accessibilityAddTraits, accessibilityElement, accessibilityHidden, accessibilityLabel as a11yLabel, clipShape, disabled as disabledModifier, font, foregroundStyle, frame, resizable } from '@expo/ui/swift-ui/modifiers';
import { useAssets } from 'expo-asset';
import { ChoiceRow as RNChoiceRow, Group as RNGroup, Row as RNRow, SwitchRow as RNSwitchRow } from './Group.rn';
import { intoSection, markNative, ScopeProvider, useNativeScope } from './native/scope';
import { color } from './tokens';

// Explicit colours: inside a Button, hierarchical styles resolve to the tint.
const secondary = foregroundStyle(color.ink2);
const primary = foregroundStyle(color.ink);
// Symbols and logos next to a title are decoration: the title (or the row's label) says it all,
// so VoiceOver skips them instead of reading symbol names such as "forward".
const decorative = accessibilityHidden(true);

/** iOS: a SwiftUI Section in the screen's Form. */
export const Group = markNative(function Group(props: ComponentProps<typeof RNGroup>) {
  const scope = useNativeScope();
  if (scope !== 'form') return <RNGroup {...props} />;
  const { title, footer, children } = props;
  // Header and footer in ink-2 (6.1:1), as on Android: the system secondary label is 3.3:1 on
  // the grouped background, below WCAG AA for text this small.
  return <Section header={title ? <Text modifiers={[secondary]}>{title}</Text> : undefined}
    footer={typeof footer === 'string' ? <Text modifiers={[secondary]}>{footer}</Text> : undefined}>
    <ScopeProvider value="section">{intoSection(children)}</ScopeProvider>
  </Section>;
});

function Leading({ icon, tint }: { icon?: { ios: string }; tint: string }) {
  if (!icon) return null;
  return <Image systemName={icon.ios as never} size={17} color={tint} modifiers={[frame({ width: 26 }), decorative]} />;
}

/** A bundled logo or app icon, read from the app bundle (or Metro in development). */
function Logo({ source }: { source: number }) {
  const [assets] = useAssets(source);
  const uri = assets?.[0]?.localUri ?? assets?.[0]?.uri;
  const box = frame({ width: 30, height: 30 });
  if (!uri) return <Spacer modifiers={[box]} />;
  return <Image uiImage={uri} modifiers={[resizable(), box, clipShape('roundedRectangle', 7), decorative]} />;
}

function Titles({ title, detail, destructive }: { title: string; detail?: string; destructive?: boolean }) {
  return <VStack alignment="leading" spacing={2}>
    <Text modifiers={[destructive ? foregroundStyle(color.ember) : primary]}>{title}</Text>
    {detail ? <Text modifiers={[font({ textStyle: 'footnote' }), secondary]}>{detail}</Text> : null}
  </VStack>;
}

/** iOS: a SwiftUI row. Tappable rows are buttons with a chevron, as in Settings. */
export const Row = markNative(function Row(props: ComponentProps<typeof RNRow>) {
  const scope = useNativeScope();
  if (scope !== 'section') return <RNRow {...props} />;
  const { title, detail, value, icon, image, iconTint = color.moss, onPress, chevron, destructive, disabled, accessibilityLabel, trailingIcon } = props;
  const content = <HStack spacing={12}>
    {typeof image === 'number' ? <Logo source={image} /> : <Leading icon={icon} tint={iconTint} />}
    <Titles title={title} detail={detail} destructive={destructive} />
    <Spacer />
    {value ? <Text modifiers={[secondary]}>{value}</Text> : null}
    {trailingIcon ? <Image systemName={trailingIcon.ios as never} size={14} color={color.ink3} modifiers={[decorative]} /> : null}
    {chevron ? <Image systemName="chevron.right" size={13} color={color.ink3} modifiers={[font({ weight: 'semibold', size: 13 }), decorative]} /> : null}
  </HStack>;
  // A static row is one VoiceOver element (title, detail and value read together), as on Android.
  if (!onPress) return <HStack modifiers={[accessibilityElement('combine'), ...(accessibilityLabel ? [a11yLabel(accessibilityLabel)] : [])]}>{content}</HStack>;
  return <SwiftButton onPress={onPress} role={destructive ? 'destructive' : undefined}
    modifiers={[...(disabled ? [disabledModifier()] : []), ...(accessibilityLabel ? [a11yLabel(accessibilityLabel)] : [])]}>
    {content}
  </SwiftButton>;
});

/** iOS: a SwiftUI Toggle row. */
export const SwitchRow = markNative(function SwitchRow(props: ComponentProps<typeof RNSwitchRow>) {
  const scope = useNativeScope();
  if (scope !== 'section') return <RNSwitchRow {...props} />;
  const { title, detail, value, onValueChange, disabled, icon, iconTint = color.moss } = props;
  return <Toggle isOn={value} onIsOnChange={onValueChange} modifiers={disabled ? [disabledModifier()] : []}>
    <HStack spacing={12}>
      <Leading icon={icon} tint={iconTint} />
      <Titles title={title} detail={detail} />
    </HStack>
  </Toggle>;
});

/** iOS: a single-choice row with a checkmark. */
export const ChoiceRow = markNative(function ChoiceRow(props: ComponentProps<typeof RNChoiceRow>) {
  const scope = useNativeScope();
  if (scope !== 'section') return <RNChoiceRow {...props} />;
  const { title, detail, selected, onPress, disabled } = props;
  // The checkmark is announced as the Selected trait rather than as a symbol name.
  return <SwiftButton onPress={onPress} modifiers={[...(disabled ? [disabledModifier()] : []), ...(selected ? [accessibilityAddTraits(['isSelected'])] : [])]}>
    <HStack spacing={12}>
      <Titles title={title} detail={detail} />
      <Spacer />
      {selected ? <Image systemName="checkmark" size={15} color={color.moss} modifiers={[font({ weight: 'semibold', size: 15 }), decorative]} /> : null}
    </HStack>
  </SwiftButton>;
});
