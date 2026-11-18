import { StyleSheet, View, type ViewProps } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Floating as RNFloating } from './Floating.rn';

const glass = isLiquidGlassAvailable();

/** iOS 26: real Liquid Glass behind controls that float over the valley. */
export function Floating({ children, className = '', round, ...rest }: ViewProps & { children: ReactNode; className?: string; round?: boolean }) {
  if (!glass) return <RNFloating {...rest} className={className} round={round}>{children}</RNFloating>;
  const radius = round ? 999 : 28;
  return <View {...rest} className={className} style={[{ borderRadius: radius, borderCurve: 'continuous' }, rest.style]}>
    <GlassView glassEffectStyle="regular" isInteractive style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
    {children}
  </View>;
}
