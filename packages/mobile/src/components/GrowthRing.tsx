import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color as palette } from '../ui/tokens';

/** A circular progress track; the tree grows inside it. */
export function GrowthRing({ progress, size = 280, stroke = 12, color = palette.moss, children }: {
  progress: number; size?: number; stroke?: number; color?: string; children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return <View style={{ width: size, height: size }} className="items-center justify-center">
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={palette.divider} strokeWidth={stroke} fill={palette.surface} />
      {clamped > 0 ? <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - clamped)} transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null}
    </Svg>
    {children}
  </View>;
}
