import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { REWARD_PRESETS } from '../../features/focus/catalog';
import { color, continuous, Icon, icons, numerals, Stage, type IconName } from '../../ui';
import { GrowthRing } from '../GrowthRing';
import { ItemView } from '../ItemView';

/** Small demos for the first-run pages. Each animates only while its page is showing. */

const LOOP_MS = 6000;
const HOLD_MS = 1400;

/** A 25-minute session, sped up: the ring fills, the clock counts down, the tree grows. */
export function PlantDemo({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) % (LOOP_MS + HOLD_MS);
      setProgress(Math.min(1, elapsed / LOOP_MS));
    }, 80);
    return () => clearInterval(timer);
  }, [active]);
  const left = Math.round(25 * 60 * (1 - progress));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return <Stage style={{ height: 300 }} className="items-center justify-center">
    <GrowthRing progress={progress} size={220} stroke={10}>
      <View className="items-center">
        <ItemView tier="tree" species="oak" seed={3} size={104} progress={Math.max(0.06, progress)} />
        <Text style={numerals} className="text-title-2 font-semibold text-ink">{progress >= 1 ? 'Grown' : clock}</Text>
      </View>
    </GrowthRing>
  </Stage>;
}

function Caption({ icon, tint, text }: { icon: IconName; tint: string; text: string }) {
  return <View style={continuous} className="flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
    <Icon name={icon} size={13} tint={tint} weight="bold" />
    <Text className="text-footnote font-semibold text-ink">{text}</Text>
  </View>;
}

/** Staying grows the tree; leaving for more than 10 seconds withers it. */
export function LeaveDemo({ active }: { active: boolean }) {
  return <Stage style={{ height: 300 }} className="flex-row items-end justify-center gap-6 pb-5">
    {[
      { withered: false, icon: icons.checkCircle, tint: color.moss, text: 'You stayed' },
      { withered: true, icon: icons.warning, tint: color.ember, text: 'Left over 10 s' },
    ].map((item, index) => <Animated.View key={item.text} entering={active ? FadeInDown.delay(index * 160).springify() : undefined} className="items-center gap-2">
      <ItemView tier="tree" species={index ? 'oak' : 'cherry'} withered={item.withered} seed={index + 4} size={120} />
      <Caption icon={item.icon} tint={item.tint} text={item.text} />
    </Animated.View>)}
  </Stage>;
}

/** What a blocked app looks like during a session: Apple's Screen Time shield. */
export function BlockDemo({ active }: { active: boolean }) {
  return <Stage style={{ height: 300 }} className="items-center justify-center">
    <Animated.View key={String(active)} entering={active ? FadeIn.duration(400) : undefined} style={[continuous, { backgroundColor: 'rgba(21,36,27,0.92)' }]}
      className="w-[236px] items-center gap-3 rounded-[28px] px-6 py-7">
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
  </Stage>;
}

/** Each reward size and the focus time it takes. */
export function TiersDemo({ active }: { active: boolean }) {
  return <Stage style={{ height: 300 }} className="flex-row items-end justify-center gap-1 px-3 pb-4">
    {REWARD_PRESETS.map((preset, index) => <Animated.View key={preset.tier} entering={active ? FadeInDown.delay(index * 120).springify() : undefined} className="flex-1 items-center gap-1.5">
      <ItemView tier={preset.tier} species={(['pine', 'oak', 'maple', 'cherry'] as const)[index]} seed={index + 2} size={[52, 66, 78, 86][index]} />
      <Text numberOfLines={1} className="text-footnote font-semibold text-ink">{preset.name}</Text>
      <Text numberOfLines={1} style={numerals} className="text-caption text-ink-2">{preset.label}</Text>
    </Animated.View>)}
  </Stage>;
}

function Down() {
  return <View style={{ transform: [{ rotate: '90deg' }] }}><Icon name={icons.chevron} size={14} tint={color.ink3} weight="bold" /></View>;
}

/** Many players, one public contract, each tree back to its owner's wallet. */
export function ContractDemo({ active }: { active: boolean }) {
  const people = ['A', 'B', 'C'];
  return <Stage style={{ height: 300 }} className="items-center justify-center gap-3 px-5">
    <View className="flex-row gap-3">
      {people.map((letter, index) => <Animated.View key={letter} entering={active ? FadeInDown.delay(index * 120) : undefined} style={continuous} className="items-center gap-1 rounded-2xl bg-surface px-3 py-2">
        <Icon name={icons.person} size={20} tint={color.ink2} />
        <Text className="text-caption text-ink-2">Player {letter}</Text>
      </Animated.View>)}
    </View>
    <Down />
    <Animated.View entering={active ? FadeIn.delay(380) : undefined} style={continuous} className="w-full flex-row items-center gap-3 rounded-[20px] bg-surface p-3">
      <View style={continuous} className="h-11 w-11 items-center justify-center rounded-xl bg-moss">
        <Icon name={icons.lock} size={18} tint={color.surface} />
      </View>
      <View className="flex-1">
        <Text className="text-headline text-ink">Focus Forest</Text>
        <Text className="text-footnote text-ink-2">One public contract on Bitcoin Cash</Text>
      </View>
      <ItemView tier="tree" species="cashtree" seed={5} size={40} />
    </Animated.View>
    <Down />
    <Caption icon={icons.wallet} tint={color.moss} text="Each tree goes to its owner's wallet" />
  </Stage>;
}

/** Bitcoin's clock: blocks about every 10 minutes, locks counted in 512-second steps. */
export function ClockDemo({ active }: { active: boolean }) {
  return <Stage style={{ height: 300 }} className="items-center justify-center gap-5 px-5">
    <View className="flex-row items-center">
      {[0, 1, 2, 3].map((index) => <Animated.View key={index} entering={active ? FadeIn.delay(index * 220) : undefined} className="flex-row items-center">
        {index ? <View className="h-[3px] w-5 bg-ink-3/40" /> : null}
        <View style={continuous} className={`h-14 w-14 items-center justify-center rounded-xl ${index === 3 ? 'bg-sun' : 'bg-surface'}`}>
          <Icon name={icons.contract} size={18} tint={index === 3 ? color.sunInk : color.ink3} />
        </View>
      </Animated.View>)}
    </View>
    <Text className="text-footnote font-semibold text-ink-2">A new block about every 10 minutes</Text>
    <View className="w-full gap-1.5">
      <View className="flex-row gap-1">
        {Array.from({ length: 6 }, (_, index) => <View key={index} style={continuous} className={`h-3 flex-1 rounded-full ${index < 3 ? 'bg-moss' : 'bg-moss-soft'}`} />)}
      </View>
      <View className="flex-row justify-between">
        <Text style={numerals} className="text-caption text-ink-2">Locks count in 512 s steps</Text>
        <Text style={numerals} className="text-caption font-semibold text-moss">3 steps = Tree</Text>
      </View>
    </View>
  </Stage>;
}
