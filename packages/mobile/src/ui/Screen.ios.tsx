import { Form, Host, NavigationStack } from '@expo/ui/swift-ui';
import { listSectionSpacing, navigationTitle, refreshable, toolbarTitleDisplayMode } from '@expo/ui/swift-ui/modifiers';
import { intoForm, ScopeProvider } from './native/scope';
import type { ScreenProps } from './Screen.rn';
import { color } from './tokens';

export type { ScreenProps } from './Screen.rn';

/**
 * iOS: the screen is a SwiftUI Form, so sections, rows, toggles, pickers and buttons are Apple's
 * own. React Native content (3D models, charts) is hosted inside the form.
 *
 * Tab roots (with `title`) wrap the form in a SwiftUI NavigationStack whose title uses the
 * `inlineLarge` display mode: a bold large title sits in the navigation bar row itself, right under
 * the status bar (no empty bar row above it, unlike the `large` mode). The bar stays put while the
 * form scrolls under it, and iOS 26 draws its scroll-edge effect there, so content never collides
 * with the status bar.
 *
 * Pushed screens and sheets keep the native-stack header from the router; the stack lets the form
 * extend under that header so SwiftUI applies the bar's safe area once (see app/_layout.tsx).
 */
export function Screen({ children, title, onRefresh }: ScreenProps) {
  const form = <Form modifiers={[
    listSectionSpacing('compact'),
    ...(title ? [navigationTitle(title), toolbarTitleDisplayMode('inlineLarge')] : []),
    ...(onRefresh ? [refreshable(async () => { onRefresh(); })] : []),
  ]}>
    <ScopeProvider value="form">{intoForm(children)}</ScopeProvider>
  </Form>;
  return <Host style={{ flex: 1 }} seedColor={color.moss}>
    {title ? <NavigationStack>{form}</NavigationStack> : form}
  </Host>;
}
