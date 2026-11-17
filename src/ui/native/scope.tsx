import { Children, cloneElement, createContext, Fragment, isValidElement, useContext, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Group as SwiftGroup, RNHostView, Section } from '@expo/ui/swift-ui';
import { listRowBackground, listRowInsets, listRowSeparator, type ModifierConfig } from '@expo/ui/swift-ui/modifiers';
import { registerNativeTransform } from './aware';

/**
 * iOS only. Where a design-system component is being rendered:
 * - `form`: directly inside a SwiftUI Form (a screen), so it may render a SwiftUI Section;
 * - `section`: inside a SwiftUI Section, so it renders a SwiftUI row;
 * - `null`: in ordinary React Native layout, so it renders its React Native version (or hosts
 *   itself in its own SwiftUI Host when it is a small control).
 */
export type NativeScope = 'form' | 'section' | null;
const ScopeContext = createContext<NativeScope>(null);
export const ScopeProvider = ScopeContext.Provider;
export const useNativeScope = () => useContext(ScopeContext);

/** Components that render SwiftUI when placed in a form or section carry this flag. */
type NativeAware = { nativeAware?: boolean };
export { markNative } from './aware';
const isNativeAware = (node: ReactElement) => typeof node.type !== 'string' && Boolean((node.type as NativeAware).nativeAware);

/** Children with fragments expanded and empty values dropped. */
export function flatten(children: ReactNode, prefix = ''): ReactElement[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    // Children.toArray keys are only unique per level; prefix them so nested fragments stay unique.
    const key = `${prefix}${String(child.key)}`;
    if (child.type === Fragment) return flatten((child.props as { children?: ReactNode }).children, `${key}/`);
    return [cloneElement(child, { key })];
  });
}

const CLEAR = '#00000000';
const NO_INSETS = listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 });
/** Row modifiers for content shown without the grouped row background. */
export const bareRow: ModifierConfig[] = [listRowBackground(CLEAR), NO_INSETS, listRowSeparator('hidden')];

/** React Native content placed in SwiftUI. It sizes to its own height and takes the row's width. */
export function Hosted({ children, modifiers = [NO_INSETS] }: { children: ReactElement; modifiers?: ModifierConfig[] }) {
  return <SwiftGroup modifiers={modifiers}>
    <RNHostView matchContents={{ vertical: true }}>
      <View><ScopeProvider value={null}>{children}</ScopeProvider></View>
    </RNHostView>
  </SwiftGroup>;
}

/** A Form-level section that shows its content without the grouped background (headers, charts, buttons). */
export function BareSection({ children }: { children: ReactNode }) {
  return <Section>
    <SwiftGroup modifiers={bareRow}>{children}</SwiftGroup>
  </Section>;
}

/** Renders a list of children into a Form: native-aware ones as they are, the rest hosted. */
export function intoForm(children: ReactNode) {
  return flatten(children).map((child, index) => isNativeAware(child)
    ? child
    : <Section key={child.key ?? `rn-${index}`}><Hosted modifiers={bareRow}>{child}</Hosted></Section>);
}

/** Renders a list of children into a Section: native-aware rows as they are, the rest hosted. */
export function intoSection(children: ReactNode) {
  return flatten(children).map((child, index) => isNativeAware(child)
    ? child
    : <Hosted key={child.key ?? `rn-${index}`}>{child}</Hosted>);
}

// Composites marked with nativeAware() place their output into whichever SwiftUI scope they are in.
registerNativeTransform({
  use: () => {
    const scope = useNativeScope();
    return (output) => scope === 'form' ? intoForm(output) : scope === 'section' ? intoSection(output) : output;
  },
});
