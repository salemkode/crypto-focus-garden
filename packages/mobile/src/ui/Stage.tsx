import type { ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { color, continuous } from './tokens';

const SKY = `linear-gradient(180deg, ${color.skyTop} 0%, ${color.skyBottom} 100%)`;
// CSS gradients: `experimental_backgroundImage` on the new architecture, `backgroundImage` on web.
const fill = (Platform.OS === 'web' ? { backgroundImage: SKY } : { experimental_backgroundImage: SKY }) as ViewStyle;

/**
 * The valley's sky as a small window: every 3D item (tree, house, avatar) sits on one, so the
 * models always appear in their own world instead of on a grey card.
 */
export function Stage({ children, className = '', style, round }: { children?: ReactNode; className?: string; style?: ViewStyle; round?: boolean }) {
  return <View style={[continuous, { backgroundColor: color.skyTop }, fill, style]}
    className={`${/\b(items|justify)-/.test(className) ? '' : 'items-center justify-end'} overflow-hidden ${round ? 'rounded-full' : 'rounded-[20px]'} ${className}`}>
    {children}
  </View>;
}
