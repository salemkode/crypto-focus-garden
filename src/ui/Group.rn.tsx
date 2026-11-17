import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Image, Pressable, Switch, Text, View, type ImageSourcePropType } from 'react-native';
import { Icon, icons, type IconName } from './Icon';
import { Segmented } from './Segmented.rn';
import { color, continuous } from './tokens';

/**
 * Inset grouped list section: an optional header, rows separated by hairlines, and at most one
 * short footnote. Replaces the old cream cards with paragraphs.
 */
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return <View className="gap-2">
    {title ? <Text accessibilityRole="header" className="px-4 text-footnote font-semibold text-ink-2">{title}</Text> : null}
    {rows.length ? <View style={continuous} className="overflow-hidden rounded-[20px] bg-surface">
      {rows.map((row, index) => <Fragment key={row.key ?? index}>
        {index ? <View className="ml-4 h-px bg-divider" /> : null}
        {row.type === Segmented ? <View className="p-3">{row}</View> : row}
      </Fragment>)}
    </View> : null}
    {footer ? typeof footer === 'string' ? <Text className="px-4 text-footnote text-ink-2">{footer}</Text> : footer : null}
  </View>;
}

/** Leading icon tile for a row. */
function Lead({ icon, tint }: { icon: IconName; tint: string }) {
  return <View style={[continuous, { backgroundColor: tint }]} className="h-8 w-8 items-center justify-center rounded-[9px]">
    <Icon name={icon} size={16} tint={color.surface} weight="semibold" />
  </View>;
}

/** A row: title with optional detail, a value on the right, and a chevron when it navigates. */
export function Row({ title, detail, value, icon, image, iconTint = color.moss, onPress, chevron, destructive, accessory, trailingIcon, disabled, accessibilityLabel }: {
  title: string;
  detail?: string;
  value?: string;
  icon?: IconName;
  /** A logo or app icon in place of the symbol tile (a bundled image). */
  image?: ImageSourcePropType;
  iconTint?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accessory?: ReactNode;
  /** A small symbol after the value (for example, copy). */
  trailingIcon?: IconName;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const body = <>
    {image ? <Image source={image} style={{ borderCurve: 'continuous' }} className="h-8 w-8 rounded-[9px]" /> : icon ? <Lead icon={icon} tint={iconTint} /> : null}
    <View className="flex-1 gap-0.5">
      <Text className={destructive ? 'text-body text-ember' : 'text-body text-ink'}>{title}</Text>
      {detail ? <Text className="text-footnote text-ink-2">{detail}</Text> : null}
    </View>
    {value ? <Text numberOfLines={1} className="max-w-[55%] text-body text-ink-2">{value}</Text> : null}
    {accessory}
    {trailingIcon ? <Icon name={trailingIcon} size={15} tint={color.ink3} /> : null}
    {chevron ? <Icon name={icons.chevron} size={13} tint={color.ink3} weight="semibold" /> : null}
  </>;
  if (!onPress) return <View accessible accessibilityLabel={accessibilityLabel} className="min-h-12 flex-row items-center gap-3 px-4 py-2.5">{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, detail, value].filter(Boolean).join(', ')} disabled={disabled} onPress={onPress}
    className="min-h-12 flex-row items-center gap-3 px-4 py-2.5 active:bg-sunk disabled:opacity-40">{body}</Pressable>;
}

/** A row with a system switch. */
export function SwitchRow({ title, detail, value, onValueChange, disabled, icon, iconTint }: {
  title: string; detail?: string; value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean; icon?: IconName; iconTint?: string;
}) {
  return <Row title={title} detail={detail} icon={icon} iconTint={iconTint} accessory={
    <Switch accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onValueChange} trackColor={{ true: color.moss, false: color.divider }} />
  } />;
}

/** A selectable row with a checkmark (single choice lists). */
export function ChoiceRow({ title, detail, selected, onPress, disabled }: {
  title: string; detail?: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    className="min-h-12 flex-row items-center gap-3 px-4 py-2.5 active:bg-sunk disabled:opacity-40">
    <View className="flex-1 gap-0.5">
      <Text className="text-body text-ink">{title}</Text>
      {detail ? <Text className="text-footnote text-ink-2">{detail}</Text> : null}
    </View>
    {selected ? <Icon name={icons.check} size={17} tint={color.moss} weight="bold" /> : <View className="w-[17px]" />}
  </Pressable>;
}
