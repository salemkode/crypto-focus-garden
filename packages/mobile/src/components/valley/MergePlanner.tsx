import { levelInfo, type Level } from '@focus-garden/garden/ladder';
import type { MergeOption, PlannedMerge } from '@focus-garden/garden/merge-plan';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { finalResults } from './merge-summary';
import { Button, color, continuous, floatingShadow, Icon, icons, numerals } from '../../ui';

export interface MergePlannerProps {
  visible: boolean;
  options: MergeOption[];
  plan: (counts: Partial<Record<Level, number>>, cascade: boolean) => PlannedMerge[];
  onConfirm: (plan: PlannedMerge[]) => void;
  onClose: () => void;
}

/** Keep mounted while hidden so Reanimated can finish the sheet's exit. */
export function MergePlanner({ visible, ...props }: MergePlannerProps) {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="box-none" collapsable={false} className="absolute inset-0 items-center justify-end px-3 pt-3" style={{ paddingBottom: Math.max(12, insets.bottom) }}>
    {visible ? <PlannerSheet {...props} /> : null}
  </View>;
}

function PlannerSheet({ options, plan, onConfirm, onClose }: Omit<MergePlannerProps, 'visible'>) {
  const reducedMotion = useReducedMotion();
  const [choice, setChoice] = useState<Partial<Record<Level, number>>>(() => Object.fromEntries(options.map((option) => [option.level, option.available])));
  const [cascade, setCascade] = useState(true);
  const counts = Object.fromEntries(options.map((option) => [
    option.level,
    choice[option.level] === Infinity ? Infinity : Math.max(0, Math.min(option.available, choice[option.level] ?? option.available)),
  ]));
  const planned = plan(counts, cascade);
  const summary = finalResults(planned).map(([level, count]) => `${count} ${levelInfo(level).name.toLowerCase()}${count > 1 ? 's' : ''}`).join(', ');

  function step(option: MergeOption, delta: number) {
    setChoice((current) => ({
      ...current,
      [option.level]: Math.max(0, Math.min(option.available, Math.min(option.available, current[option.level] ?? option.available) + delta)),
    }));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  return <Animated.View
    entering={reducedMotion ? FadeIn.duration(180).reduceMotion(ReduceMotion.Never) : SlideInDown.springify().duration(300).dampingRatio(0.8)}
    exiting={reducedMotion ? FadeOut.duration(180).reduceMotion(ReduceMotion.Never) : SlideOutDown.duration(220)}
    accessibilityViewIsModal onAccessibilityEscape={onClose}
    className="max-h-full w-full max-w-[520px] gap-3 rounded-[24px] border border-white/70 bg-surface/95 p-4"
    style={[continuous, floatingShadow]}
  >
    <View className="flex-row items-center justify-between gap-2">
      <View className="flex-1">
        <Text accessibilityRole="header" className="text-title-3 text-ink">Merge</Text>
        <Text className="text-subhead text-ink-2">Combine smaller pieces into bigger ones.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close merge planner" onPress={onClose} className="h-9 w-9 items-center justify-center rounded-full bg-sunk active:opacity-60">
        <Icon name={icons.close} size={13} tint={color.ink2} weight="bold" />
      </Pressable>
    </View>
    <ScrollView className="shrink" showsVerticalScrollIndicator>
      {options.map((option) => {
        const count = Math.min(counts[option.level], option.available);
        const name = levelInfo(option.level).name.toLowerCase();
        return <View key={option.level} className="flex-row flex-wrap items-center justify-between gap-2 border-t border-divider py-2">
          <View className="min-w-[140px] flex-1">
            <Text className="text-body text-ink">{option.need} {name}s into a {levelInfo(option.next).name.toLowerCase()}</Text>
            <Text className="text-footnote text-ink-2">{option.available} possible</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable accessibilityRole="button" accessibilityLabel={`Fewer ${name} merges`} accessibilityState={{ disabled: count === 0 }} disabled={count === 0} onPress={() => step(option, -1)} className="h-11 w-11 items-center justify-center rounded-full bg-sunk disabled:opacity-30 active:opacity-60">
              <Icon name={icons.minus} size={15} tint={color.ink} weight="bold" />
            </Pressable>
            <Text accessibilityLabel={`${count} ${name} merges selected`} style={numerals} className="min-w-6 text-center text-headline text-ink">{count}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`More ${name} merges`} accessibilityState={{ disabled: count === option.available }} disabled={count === option.available} onPress={() => step(option, 1)} className="h-11 w-11 items-center justify-center rounded-full bg-sunk disabled:opacity-30 active:opacity-60">
              <Icon name={icons.plus} size={15} tint={color.ink} weight="bold" />
            </Pressable>
          </View>
        </View>;
      })}
      <View className="flex-row items-center gap-2 border-t border-divider pt-3">
        <Text className="flex-1 text-subhead text-ink">Keep merging the new ones upward</Text>
        <Switch accessibilityLabel="Keep merging the new ones upward" value={cascade} onValueChange={setCascade} trackColor={{ true: color.moss, false: color.divider }} />
      </View>
    </ScrollView>
    <View className="flex-row gap-2">
      <Button variant="secondary" grow label="Everything" accessibilityHint="Select all possible merges at every available level" onPress={() => setChoice(Object.fromEntries(options.map((option) => [option.level, Infinity])))} />
      <Button variant="sun" grow label={`Merge ${planned.length}`} disabled={planned.length === 0} onPress={() => { onConfirm(planned); onClose(); }} />
    </View>
    <Text accessibilityLiveRegion="polite" className="text-center text-footnote text-ink-2">{planned.length ? `You end up with ${summary}.` : 'Choose what to merge.'}</Text>
  </Animated.View>;
}
