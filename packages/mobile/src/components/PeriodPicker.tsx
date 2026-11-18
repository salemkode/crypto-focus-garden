import { Pressable, Text, View } from 'react-native';
import { PERIODS, periodLabel, periodRange, shiftAnchor, type Period } from '../features/focus/stats';
import { color, Icon, icons, nativeAware, Segmented } from '../ui';

const CURRENT: Record<Period, string> = { day: 'today', week: 'this week', month: 'this month', year: 'this year' };

/** Day / week / month / year, then previous and next around the period's name. Tap the name to return to the present. */
export const PeriodPicker = nativeAware(function PeriodPicker({ period, anchor, now, onChange }: {
  period: Period; anchor: number; now: number; onChange: (period: Period, anchor: number) => void;
}) {
  const atPresent = periodRange(period, anchor).end > now;
  const label = periodLabel(period, anchor, now);
  return <>
    <Segmented options={PERIODS} value={period} onChange={(next) => onChange(next, now)} />
    <View className="flex-row items-center justify-between">
      <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${period}`} onPress={() => onChange(period, shiftAnchor(period, anchor, -1))} className="h-11 w-11 items-center justify-center rounded-full active:bg-sunk">
        <Icon name={icons.back} size={17} tint={color.moss} weight="semibold" />
      </Pressable>
      <Pressable accessibilityRole={atPresent ? 'text' : 'button'} accessibilityLabel={label} accessibilityHint={atPresent ? undefined : `Shows ${CURRENT[period]}`} disabled={atPresent} onPress={() => onChange(period, now)} className="min-h-11 justify-center rounded-full px-3 active:bg-sunk">
        <Text className="text-headline text-ink">{label}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Next ${period}`} disabled={atPresent} onPress={() => onChange(period, shiftAnchor(period, anchor, 1))} className="h-11 w-11 items-center justify-center rounded-full active:bg-sunk disabled:opacity-25">
        <Icon name={icons.chevron} size={17} tint={color.moss} weight="semibold" />
      </Pressable>
    </View>
  </>;
});
