import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { color } from './tokens';

export type IconName = { ios: SFSymbol; md: AndroidSymbol };

/** SF Symbol on iOS, Material Symbol on Android and web. Never draw icons by hand. */
export function Icon({ name, size = 20, tint = color.ink, weight = 'medium' }: {
  name: IconName; size?: number; tint?: string; weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}) {
  return <SymbolView name={{ ios: name.ios, android: name.md, web: name.md }} size={size} tintColor={tint} weight={weight} resizeMode="scaleAspectFit" />;
}

/** Every icon the app uses, so the set stays small and consistent. */
export const icons = {
  chevron: { ios: 'chevron.right', md: 'chevron_right' },
  back: { ios: 'chevron.left', md: 'chevron_left' },
  close: { ios: 'xmark', md: 'close' },
  wallet: { ios: 'wallet.bifold', md: 'account_balance_wallet' },
  rules: { ios: 'slider.horizontal.3', md: 'tune' },
  merge: { ios: 'sparkles', md: 'auto_awesome' },
  check: { ios: 'checkmark', md: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', md: 'check_circle' },
  warning: { ios: 'exclamationmark.triangle.fill', md: 'warning' },
  info: { ios: 'info.circle.fill', md: 'info' },
  link: { ios: 'link', md: 'link' },
  copy: { ios: 'doc.on.doc', md: 'content_copy' },
  lock: { ios: 'lock.fill', md: 'lock' },
  shield: { ios: 'hand.raised.fill', md: 'block' },
  leaf: { ios: 'leaf.fill', md: 'eco' },
  clock: { ios: 'clock', md: 'schedule' },
  plus: { ios: 'plus', md: 'add' },
  minus: { ios: 'minus', md: 'remove' },
  refresh: { ios: 'arrow.clockwise', md: 'refresh' },
  restore: { ios: 'arrow.counterclockwise', md: 'restore' },
  key: { ios: 'key.fill', md: 'key' },
  person: { ios: 'person.crop.circle', md: 'account_circle' },
  globe: { ios: 'globe', md: 'public' },
  intro: { ios: 'play.circle', md: 'play_circle' },
  tree: { ios: 'tree.fill', md: 'forest' },
  note: { ios: 'square.and.pencil', md: 'edit_note' },
  heart: { ios: 'heart.fill', md: 'favorite' },
  search: { ios: 'magnifyingglass', md: 'search' },
  hourglass: { ios: 'hourglass', md: 'hourglass_empty' },
  people: { ios: 'person.3.fill', md: 'groups' },
  contract: { ios: 'doc.text.fill', md: 'description' },
  apps: { ios: 'square.grid.2x2.fill', md: 'apps' },
} satisfies Record<string, IconName>;
