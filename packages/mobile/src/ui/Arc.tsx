import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { color } from './tokens';

/**
 * The growth arc, the app's one signature element (from the app icon): a leaf-to-water stroke with
 * a soft glow under it. Used for anything that grows over time. Nothing else in the UI glows.
 */
export function Arc({ progress, size = 64, stroke = 5, track = color.divider, children, accessibilityLabel }: {
  progress: number; size?: number; stroke?: number; track?: string; children?: ReactNode; accessibilityLabel?: string;
}) {
  const radius = (size - stroke * 3) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const center = size / 2;
  const arc = { cx: center, cy: center, r: radius, fill: 'none', strokeLinecap: 'round' as const, strokeDasharray: `${circumference} ${circumference}`, strokeDashoffset: circumference * (1 - clamped), transform: `rotate(-90 ${center} ${center})` };
  return <View accessible={Boolean(accessibilityLabel)} accessibilityRole={accessibilityLabel ? 'progressbar' : undefined} accessibilityLabel={accessibilityLabel}
    accessibilityValue={accessibilityLabel ? { min: 0, max: 100, now: Math.round(clamped * 100) } : undefined}
    style={{ width: size, height: size }} className="items-center justify-center">
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Defs>
        <LinearGradient id="growth" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color.leaf} />
          <Stop offset="1" stopColor={color.water} />
        </LinearGradient>
      </Defs>
      <Circle cx={center} cy={center} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
      {clamped > 0 ? <>
        <Circle {...arc} stroke="url(#growth)" strokeWidth={stroke * 2.6} strokeOpacity={0.22} />
        <Circle {...arc} stroke="url(#growth)" strokeWidth={stroke} />
      </> : null}
    </Svg>
    {children}
  </View>;
}
