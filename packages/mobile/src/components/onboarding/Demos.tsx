import { useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { REWARD_PRESETS } from '../../features/focus/catalog';
import { color, continuous, Icon, icons, numerals, Stage, type IconName } from '../../ui';
import { GrowthRing } from '../GrowthRing';
import { ItemView } from '../ItemView';

/**
 * Small demos for the first-run pages. Each animates only while its page is showing, sits on a
 * stage of the same size on every page, and reads to VoiceOver/TalkBack as one described image.
 */

export type DemoProps = { active: boolean; height: number };

const LOOP_MS = 6000;
const HOLD_MS = 1400;

/** One stage for every demo: same size and position, one accessible description, no inner elements. */
function DemoStage({ height, label, className, children }: { height: number; label: string; className: string; children: ReactNode }) {
  return <View accessible accessibilityRole="image" accessibilityLabel={label}>
    <Stage style={{ height }} className={className}>{children}</Stage>
  </View>;
}

/** A 25-minute session, sped up: the ring fills, the clock counts down, the tree grows. Still under Reduce Motion. */
export function PlantDemo({ active, height }: DemoProps) {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(reduced ? 0.6 : 0);
  useEffect(() => {
    if (!active || reduced) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) % (LOOP_MS + HOLD_MS);
      setProgress(Math.min(1, elapsed / LOOP_MS));
    }, 80);
    return () => clearInterval(timer);
  }, [active, reduced]);
  const shown = reduced ? 0.6 : progress;
  const left = Math.round(25 * 60 * (1 - shown));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const ring = Math.min(220, height - 64);
  return <DemoStage height={height} label="A tree growing inside a ring while a 25 minute timer counts down" className="items-center justify-center">
    <GrowthRing progress={shown} size={ring} stroke={10}>
      <View className="items-center">
        <ItemView tier="tree" species="oak" seed={3} size={Math.round(ring * 0.47)} progress={Math.max(0.06, shown)} />
        <Text style={numerals} className="text-title-2 font-semibold text-ink">{shown >= 1 ? 'Grown' : clock}</Text>
      </View>
    </GrowthRing>
  </DemoStage>;
}

function Caption({ icon, tint, text }: { icon: IconName; tint: string; text: string }) {
  return <View style={continuous} className="flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
    <Icon name={icon} size={13} tint={tint} weight="bold" />
    <Text className="text-footnote font-semibold text-ink">{text}</Text>
  </View>;
}

/** Staying grows the tree; leaving for more than 10 seconds withers it. */
export function LeaveDemo({ active, height }: DemoProps) {
  return <DemoStage height={height} label="Two trees: a healthy one where you stayed, and a withered one where you left for over 10 seconds" className="flex-row items-end justify-center gap-6 pb-5">
    {[
      { withered: false, icon: icons.checkCircle, tint: color.moss, text: 'You stayed' },
      { withered: true, icon: icons.warning, tint: color.ember, text: 'Left over 10 s' },
    ].map((item, index) => <Animated.View key={item.text} entering={active ? FadeInDown.delay(index * 160).springify() : undefined} className="items-center gap-2">
      <ItemView tier="tree" species={index ? 'oak' : 'cherry'} withered={item.withered} seed={index + 4} size={Math.min(120, height - 120)} />
      <Caption icon={item.icon} tint={item.tint} text={item.text} />
    </Animated.View>)}
  </DemoStage>;
}

/** Size names in sentence case, as everywhere else in the app ("Big tree"). */
const sizeName = (name: string) => name.charAt(0) + name.slice(1).toLowerCase();

/** Each reward size and the focus time it takes. */
export function TiersDemo({ active, height }: DemoProps) {
  const scale = Math.min(1, height / 300);
  const label = `Bigger trees for longer focus: ${REWARD_PRESETS.map((preset) => `${sizeName(preset.name)}, ${preset.label}`).join('; ')}`;
  return <DemoStage height={height} label={label} className="flex-row items-end justify-center gap-1 px-3 pb-4">
    {REWARD_PRESETS.map((preset, index) => <Animated.View key={preset.tier} entering={active ? FadeInDown.delay(index * 120).springify() : undefined} className="flex-1 items-center gap-1.5">
      <ItemView tier={preset.tier} species={(['pine', 'oak', 'maple', 'cherry'] as const)[index]} seed={index + 2} size={Math.round([52, 66, 78, 86][index] * scale)} />
      <Text numberOfLines={1} className="text-footnote font-semibold text-ink">{sizeName(preset.name)}</Text>
      <Text numberOfLines={1} style={numerals} className="text-caption text-ink-2">{preset.label}</Text>
    </Animated.View>)}
  </DemoStage>;
}

/** What a blocked app looks like during a session: Apple's Screen Time shield. */
export function BlockDemo({ active, height }: DemoProps) {
  return <DemoStage height={height} label="A blocked app showing Screen Time until your tree has grown" className="items-center justify-center">
    <Animated.View key={String(active)} entering={active ? FadeIn.duration(400) : undefined} style={[continuous, { backgroundColor: 'rgba(21,36,27,0.92)' }]}
      className="w-[236px] items-center gap-3 rounded-[28px] px-6 py-6">
      <View style={continuous} className="h-14 w-14 items-center justify-center rounded-2xl bg-ember">
        <Icon name={icons.hourglass} size={26} tint={color.surface} weight="semibold" />
      </View>
      <Text className="text-headline text-surface">Blocked by Screen Time</Text>
      <Text className="text-center text-footnote text-surface/70">This app opens again when your tree has grown.</Text>
      <View style={continuous} className="mt-1 flex-row items-center gap-2 rounded-full bg-surface/15 px-3 py-1.5">
        <ItemView tier="sprout" species="oak" seed={2} size={22} />
        <Text style={numerals} className="text-footnote font-semibold text-surface">Focus Garden · 18:42 left</Text>
      </View>
    </Animated.View>
  </DemoStage>;
}
