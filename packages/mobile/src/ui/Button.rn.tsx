import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Floating } from './Floating';
import { color } from './tokens';

type Variant = 'primary' | 'secondary' | 'plain' | 'destructive' | 'sun';

const SURFACE: Record<Variant, string> = {
  primary: 'bg-moss',
  secondary: 'bg-sunk',
  plain: '',
  destructive: '',
  sun: 'bg-sun',
};
const LABEL: Record<Variant, string> = {
  primary: 'text-surface',
  secondary: 'text-ink',
  plain: 'text-moss',
  destructive: 'text-ember',
  sun: 'text-ink',
};
const TINT: Record<Variant, string> = {
  primary: color.surface, secondary: color.ink, plain: color.moss, destructive: color.ember, sun: color.ink,
};

/** Capsule button. One primary per screen; everything else is secondary or plain. */
export function Button({ label, onPress, variant = 'primary', size = 'large', icon, disabled, busy, accessibilityLabel, accessibilityHint, grow, children }: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'large' | 'medium' | 'small';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Take the remaining width in a row. */
  grow?: boolean;
  children?: ReactNode;
}) {
  const height = size === 'large' ? 'min-h-[52px]' : size === 'medium' ? 'min-h-11' : 'min-h-9';
  const pad = variant === 'plain' || variant === 'destructive' ? 'px-3' : size === 'small' ? 'px-4' : 'px-6';
  const text = size === 'large' ? 'text-headline' : size === 'medium' ? 'text-callout font-semibold' : 'text-subhead font-semibold';
  // Busy keeps the label (the spinner takes the icon's place), so the button never changes meaning
  // or width while it works. The label wraps instead of truncating at large text sizes; the
  // vertical padding keeps a wrapped label off the capsule's edge. Small buttons (36) get a hit
  // slop up to the 44-point minimum.
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }} disabled={disabled || busy} onPress={onPress}
    hitSlop={size === 'small' ? { top: 4, bottom: 4 } : undefined}
    className={`${height} ${pad} ${SURFACE[variant]} ${grow ? 'flex-1' : ''} flex-row items-center justify-center gap-2 rounded-full py-2 active:opacity-70 disabled:opacity-40`}>
    {busy ? <ActivityIndicator size="small" color={TINT[variant]} />
      : icon ? <Icon name={icon} size={size === 'large' ? 18 : 16} tint={TINT[variant]} weight="semibold" /> : null}
    <Text className={`shrink text-center ${text} ${LABEL[variant]}`}>{label}</Text>
    {busy ? null : children}
  </Pressable>;
}

/** Round icon-only button, used for floating controls over the valley. */
export function IconButton({ icon, label, onPress, disabled, tint = color.ink, className = 'bg-surface', floating }: {
  icon: IconName; label: string; onPress?: () => void; disabled?: boolean; tint?: string; className?: string;
  /** Over the valley: sits on the floating surface. */
  floating?: boolean;
}) {
  if (floating) return <Floating round><IconButton icon={icon} label={label} onPress={onPress} disabled={disabled} tint={tint} className="bg-transparent" /></Floating>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} hitSlop={6}
    className={`h-11 w-11 items-center justify-center rounded-full active:opacity-70 disabled:opacity-40 ${className}`}>
    <View pointerEvents="none"><Icon name={icon} size={18} tint={tint} weight="semibold" /></View>
  </Pressable>;
}
