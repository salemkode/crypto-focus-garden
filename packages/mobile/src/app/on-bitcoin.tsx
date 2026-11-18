import { Text } from 'react-native';
import { REWARD_PRESETS } from '../features/focus/catalog';
import { color, Group, icons, Row, Screen } from '../ui';

const STEPS = { sprout: '1 step', tree: '3 steps', bigTree: '6 steps', house: '11 steps' } as const;

/**
 * How verified trees work, in plain words: one public contract for everyone, and why the timing
 * comes from Bitcoin Cash itself rather than from Focus Garden.
 */
export default function OnBitcoinScreen() {
  return <Screen contentClassName="pt-2">
    <Text className="px-4 text-subhead text-ink-2">Verified trees follow a few Bitcoin Cash rules, not ours.</Text>

    <Group title="One contract for everyone" footer="Focus Garden can't change it, take a tree, or release one early.">
      <Row title="Everyone plants in one place" detail="One public contract, the Focus Forest" icon={icons.people} iconTint={color.moss} />
      <Row title="Its rules are fixed" detail="It holds each tree until its time is up, then sends it only to its owner" icon={icons.lock} iconTint={color.moss} />
      <Row title="Anyone can check it" detail="Every tree is a public transaction" icon={icons.contract} iconTint={color.moss} />
    </Group>

    <Group title="Why 8½ minutes?" footer="Bitcoin Cash counts time locks in 512-second steps. Practice sessions can be any length.">
      {REWARD_PRESETS.map((preset) => <Row key={preset.tier} title={preset.name} detail={STEPS[preset.tier]} value={preset.label} />)}
    </Group>

    <Group title="Why it's ready a little after the timer" footer="Your tree is safe in the contract the whole time.">
      <Row title="The lock starts in a block" detail="A new block comes about every 10 minutes" icon={icons.hourglass} iconTint={color.ink2} />
      <Row title="Bitcoin keeps its own clock" detail="It tells time from recent blocks, so it can run a few minutes behind" icon={icons.clock} iconTint={color.ink2} />
    </Group>
  </Screen>;
}
