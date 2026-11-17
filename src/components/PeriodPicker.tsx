import { Pressable, Text, View } from 'react-native';
import { PERIODS, periodLabel, periodRange, shiftAnchor, type Period } from '../features/focus/stats';
import { color, Icon, icons, nativeAware, Segmented } from '../ui';

export const PeriodPicker = nativeAware(function PeriodPicker({ period, anchor, now, onChange }: {
  period: Period; anchor: number; now: number; onChange: (period: Period, anchor: number) => void;
}) {
  const atPresent = periodRange(period, anchor).end > now;
  return <>
    <Segmented options={PERIODS} value={period} onChange={(next) => onChange(next, now)} />
    <View className="flex-row items-center justify-between">
      <Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => onChange(period, shiftAnchor(period, anchor, -1))} className="h-11 w-11 items-center justify-center rounded-full active:bg-sunk">
        <Icon name={icons.back} size={17} tint={color.moss} weight="semibold" />
      </Pressable>
      <Text className="text-headline text-ink">{periodLabel(period, anchor, now)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next period" disabled={atPresent} onPress={() => onChange(period, shiftAnchor(period, anchor, 1))} className="h-11 w-11 items-center justify-center rounded-full active:bg-sunk disabled:opacity-25">
        <Icon name={icons.chevron} size={17} tint={color.moss} weight="semibold" />
      </Pressable>
    </View>
  </>;
});
