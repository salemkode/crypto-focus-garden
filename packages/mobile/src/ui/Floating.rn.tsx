import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { continuous, floatingShadow } from './tokens';

/**
 * The control layer over the valley: the only elevated surface in the app. Near-opaque so text
 * stays legible over any part of the world.
 */
export function Floating({ children, className = '', round, ...rest }: ViewProps & { children: ReactNode; className?: string; round?: boolean }) {
  return <View {...rest} style={[continuous, floatingShadow, rest.style]} className={`border border-white/70 bg-surface/95 ${round ? 'rounded-full' : 'rounded-[24px]'} ${className}`}>
    {children}
  </View>;
}
