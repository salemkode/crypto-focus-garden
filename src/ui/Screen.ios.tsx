import { Form, Group, Host, Section, Text } from '@expo/ui/swift-ui';
import { accessibilityAddTraits, font, foregroundStyle, listSectionMargins, listSectionSpacing, refreshable } from '@expo/ui/swift-ui/modifiers';
import { bareRow, intoForm, ScopeProvider } from './native/scope';
import type { ScreenProps } from './Screen.rn';
import { color } from './tokens';

export type { ScreenProps } from './Screen.rn';

/**
 * iOS: the screen is a SwiftUI Form, so sections, rows, toggles, pickers and buttons are Apple's
 * own. Tab roots (with `title`) draw a large title as the form's first row, right under the status
 * bar. A SwiftUI NavigationStack would add an empty navigation bar row above the title.
 * React Native content (3D models, charts) is hosted inside the form.
 */
export function Screen({ children, title, onRefresh }: ScreenProps) {
  return <Host style={{ flex: 1 }} seedColor={color.moss}>
    <Form modifiers={[
      listSectionSpacing('compact'),
      ...(onRefresh ? [refreshable(async () => { onRefresh(); })] : []),
    ]}>
      {title ? <Section modifiers={[listSectionMargins({ edges: 'top', length: 0 })]}>
        <Group modifiers={bareRow}>
          <Text modifiers={[font({ textStyle: 'largeTitle', weight: 'bold' }), foregroundStyle(color.ink), accessibilityAddTraits(['isHeader'])]}>{title}</Text>
        </Group>
      </Section> : null}
      <ScopeProvider value="form">{intoForm(children)}</ScopeProvider>
    </Form>
  </Host>;
}
