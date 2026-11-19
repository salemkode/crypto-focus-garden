import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, Text, View, type ScrollViewProps } from 'react-native';
import { color } from './tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Standard scrolling screen on the canvas. With `title`, the screen draws its own title right under
 * the status bar (tab roots): no empty navigation bar above a large title.
 */
export type ScreenProps = Omit<ScrollViewProps, 'refreshControl'> & {
  children: ReactNode;
  title?: string;
  accessory?: ReactNode;
  contentClassName?: string;
  /** Pull to refresh. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * A form sheet. Android's native stack draws neither a header nor a grabber on sheets, so the
   * screen draws both (with the sheet's title, when it has one). iOS draws its own, and the web
   * shows sheets as pages with the stack's header, so both ignore this.
   */
  sheet?: { title?: string };
};

export function Screen({ children, title, accessory, contentClassName = '', onRefresh, refreshing = false, sheet, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // Headerless Android tabs need their own inset; pushed screens already have a native header.
  // iOS uses Screen.ios.tsx, where the native Form handles its safe area.
  return <View className="flex-1 bg-canvas" style={title ? { paddingTop: insets.top } : undefined}>
    {sheet && Platform.OS === 'android' ? <View className="px-5 pb-1">
      <View className="h-6 items-center justify-center" importantForAccessibility="no-hide-descendants">
        <View style={{ backgroundColor: color.ink3 }} className="h-1 w-8 rounded-full opacity-40" />
      </View>
      {sheet.title ? <Text accessibilityRole="header" numberOfLines={1} className="text-title-3 text-ink">{sheet.title}</Text> : null}
    </View> : null}
    <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" {...rest}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.moss} /> : undefined}
      contentContainerClassName={`gap-7 px-4 pb-16 pt-2 ${contentClassName}`}>
      {title ? <View className="-mb-2 min-h-11 flex-row items-center justify-between gap-3 px-1">
        <Text accessibilityRole="header" className="shrink text-large-title text-ink">{title}</Text>
        {accessory}
      </View> : null}
      {children}
    </ScrollView>
    {/* Keep the status-bar background consistent on headerless tab roots. */}
    {title ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top }} className="bg-canvas/95" /> : null}
  </View>;
}
