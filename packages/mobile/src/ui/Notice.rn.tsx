import { Text, View } from 'react-native';
import { Icon, icons } from './Icon';
import { color, continuous } from './tokens';

const TONES = {
  info: { box: 'bg-surface', text: 'text-ink', icon: icons.info, tint: color.ink2 },
  warning: { box: 'bg-sun-soft', text: 'text-ink', icon: icons.warning, tint: color.sunInk },
  error: { box: 'bg-ember-soft', text: 'text-ember', icon: icons.warning, tint: color.ember },
} as const;

/** Inline message. Says what happened and what to do; never vague, never apologetic. */
export function Notice({ tone = 'info', children }: { tone?: keyof typeof TONES; children: string }) {
  const style = TONES[tone];
  // One element for assistive technology; warnings and errors are alerts and are announced when
  // they appear (live region on Android).
  return <View accessible accessibilityLabel={children} accessibilityRole={tone === 'info' ? undefined : 'alert'}
    accessibilityLiveRegion={tone === 'info' ? undefined : 'polite'} style={continuous} className={`flex-row items-start gap-3 rounded-2xl px-4 py-3 ${style.box}`}>
    <View className="pt-0.5"><Icon name={style.icon} size={16} tint={style.tint} /></View>
    <Text className={`flex-1 text-subhead ${style.text}`}>{children}</Text>
  </View>;
}
