import { Platform, PlatformColor, type TextStyle, type ViewStyle } from 'react-native';
import palette from './palette.json';

/** Design tokens for code that cannot use classes (native headers, switches, SVG). See docs/design-system.md. */
export const color = {
  canvas: palette.canvas,
  surface: palette.surface,
  sunk: palette.sunk,
  divider: palette.divider,
  ink: palette.ink,
  ink2: palette['ink-2'],
  ink3: palette['ink-3'],
  moss: palette.moss,
  mossSoft: palette['moss-soft'],
  sun: palette.sun,
  sunInk: palette['sun-ink'],
  sunSoft: palette['sun-soft'],
  ember: palette.ember,
  emberSoft: palette['ember-soft'],
  skyTop: palette['sky-top'],
  skyBottom: palette['sky-bottom'],
  leaf: palette.leaf,
  water: palette.water,
  bch: palette.bch,
} as const;

/** Big numbers: SF Pro Rounded with tabular figures on iOS; tabular system figures elsewhere. */
export const numerals: TextStyle = {
  fontFamily: Platform.OS === 'ios' ? 'ui-rounded' : undefined,
  fontVariant: ['tabular-nums'],
};

/** iOS continuous corners for surfaces. */
export const continuous: ViewStyle = { borderCurve: 'continuous' };

/** The only elevation in the app: controls floating over the valley. Ink-tinted, never black. */
export const floatingShadow: ViewStyle = { boxShadow: '0 8px 24px rgba(21, 36, 27, 0.16)' };

/**
 * Stack header options shared by every screen. iOS keeps the system bar (Liquid Glass on iOS 26)
 * over the system grouped background that SwiftUI forms use; Android uses the app canvas.
 */
export const headerOptions = Platform.OS === 'ios' ? {
  headerTintColor: color.moss,
  headerTitleStyle: { color: color.ink },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: PlatformColor('systemGroupedBackground') },
} : {
  headerStyle: { backgroundColor: color.canvas },
  headerTintColor: color.moss,
  headerTitleStyle: { color: color.ink },
  headerLargeTitleStyle: { color: color.ink },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: color.canvas },
};

/** Tab roots draw their own title under the status bar (see ui/Screen); the native bar stays hidden. */
export const largeTitleOptions = {
  headerTintColor: color.moss,
  headerTitleStyle: { color: color.ink },
  headerLargeTitleStyle: { color: color.ink },
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  contentStyle: { backgroundColor: Platform.OS === 'ios' ? PlatformColor('systemGroupedBackground') : color.canvas },
} as const;
