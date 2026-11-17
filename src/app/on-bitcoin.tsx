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
    <Text className="px-4 text-body text-ink-2">Verified trees live on Bitcoin Cash. Some of the rules, like the timing, come from Bitcoin itself, not from Focus Garden.</Text>

    <Group title="One contract for everyone" footer="Focus Garden can't change the contract, take a tree, or release one early.">
      <Row title="Everyone plants in the same place" detail="Every player's trees go into one public contract, the Focus Forest." icon={icons.people} iconTint={color.moss} />
      <Row title="Its rules are fixed" detail="It holds each tree until its focus time has passed, then sends it only to its owner's wallet." icon={icons.lock} iconTint={color.moss} />
      <Row title="Anyone can check it" detail="Every tree is a public transaction on Bitcoin Cash." icon={icons.contract} iconTint={color.moss} />
    </Group>

    <Group title="Why 8½ minutes?" footer="Bitcoin Cash counts time locks in steps of 512 seconds (8 min 32 s). That's how Bitcoin works, so verified trees grow in those steps. Practice sessions on your phone can be any length.">
      {REWARD_PRESETS.map((preset) => <Row key={preset.tier} title={preset.name} detail={STEPS[preset.tier]} value={preset.label} />)}
    </Group>

    <Group title="Why it's ready a little after the timer" footer="The countdown is an estimate. Your tree is safe in the contract the whole time.">
      <Row title="The lock starts in a block" detail="Your tree counts from the block that includes it. A new block comes about every 10 minutes, sometimes sooner, sometimes later." icon={icons.hourglass} iconTint={color.sunInk} />
      <Row title="Bitcoin keeps its own clock" detail="The network tells time from recent blocks, not from your phone, so it can run a few minutes behind." icon={icons.clock} iconTint={color.sunInk} />
    </Group>
  </Screen>;
}
