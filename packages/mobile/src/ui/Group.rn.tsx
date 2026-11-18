import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Image, Platform, Pressable, Switch, Text, View, type ImageSourcePropType } from 'react-native';
import { Icon, icons, type IconName } from './Icon';
import { Segmented } from './Segmented.rn';
import { color, continuous } from './tokens';

/** Shared row frame: at least 48 tall, 16 gutter, 12 between leading tile, text and trailing items. */
const ROW = 'min-h-12 flex-row items-center gap-3 px-4 py-2.5';
/**
 * Pressed feedback: Android uses the Material ripple (an ink state layer at 12%, clipped by the
 * group's rounded surface); iOS fallback and web use the sunk highlight.
 */
const android = Platform.OS === 'android';
const PRESSED = android ? '' : 'active:bg-sunk';
const ripple = android ? { color: 'rgba(21, 36, 27, 0.12)' } : undefined;

/**
 * Inset grouped list section: an optional header, rows separated by hairlines, and at most one
 * short footnote. Replaces the old cream cards with paragraphs.
 */
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return <View className="gap-2">
    {title ? <Text accessibilityRole="header" className="px-4 text-subhead font-semibold text-ink-2">{title}</Text> : null}
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
    <Titles title={title} detail={detail} destructive={destructive} />
    {value ? <Text numberOfLines={1} className="max-w-[55%] text-body text-ink-2">{value}</Text> : null}
    {accessory}
    {trailingIcon ? <Icon name={trailingIcon} size={15} tint={color.ink3} /> : null}
    {chevron ? <Icon name={icons.chevron} size={13} tint={color.ink3} weight="semibold" /> : null}
  </>;
  // A static row reads as one element, unless its accessory is a control of its own.
  if (!onPress) return <View accessible={!accessory} accessibilityLabel={accessibilityLabel} className={ROW}>{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, detail, value].filter(Boolean).join(', ')}
    accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} android_ripple={ripple}
    className={`${ROW} ${PRESSED} disabled:opacity-40`}>{body}</Pressable>;
}

/** Title over an optional detail line; both wrap so large text sizes never clip. */
function Titles({ title, detail, destructive }: { title: string; detail?: string; destructive?: boolean }) {
  return <View className="flex-1 gap-0.5">
    <Text className={destructive ? 'text-body text-ember' : 'text-body text-ink'}>{title}</Text>
    {detail ? <Text className="text-footnote text-ink-2">{detail}</Text> : null}
  </View>;
}

/**
 * A row with a system switch. The whole row is one switch for assistive technology and toggles on
 * tap (Material list convention); the switch itself only shows the state.
 */
export function SwitchRow({ title, detail, value, onValueChange, disabled, icon, iconTint = color.moss }: {
  title: string; detail?: string; value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean; icon?: IconName; iconTint?: string;
}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={[title, detail].filter(Boolean).join(', ')} accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
    disabled={disabled} onPress={() => onValueChange(!value)} android_ripple={ripple} className={`${ROW} ${PRESSED} disabled:opacity-40`}>
    {icon ? <Lead icon={icon} tint={iconTint} /> : null}
    <Titles title={title} detail={detail} />
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Switch value={value} disabled={disabled} trackColor={{ true: color.moss, false: color.divider }} />
    </View>
  </Pressable>;
}

/** A selectable row with a checkmark (single choice lists). */
export function ChoiceRow({ title, detail, selected, onPress, disabled }: {
  title: string; detail?: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={[title, detail].filter(Boolean).join(', ')} accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
    disabled={disabled} onPress={onPress} android_ripple={ripple} className={`${ROW} ${PRESSED} disabled:opacity-40`}>
    <Titles title={title} detail={detail} />
    {selected ? <Icon name={icons.check} size={17} tint={color.moss} weight="bold" /> : <View className="w-[17px]" />}
  </Pressable>;
}
