import { useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BlockDemo, ClockDemo, ContractDemo, LeaveDemo, PlantDemo, TiersDemo } from '../components/onboarding/Demos';
import { Model3D } from '../components/Model3D';
import { WalletLink } from '../components/WalletLink';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { useRewards } from '../features/rewards/RewardProvider';
import { useShield } from '../features/shield/useShield';
import { markOnboarded, readDisplayName, saveDisplayName } from '../features/profile/local';
import { Button, color, Field, icons, Stage } from '../ui';

type Extra = 'block' | 'bitcoin';
const PAGES: { title: string; body: string; Demo: (props: { active: boolean }) => ReactNode; extra?: Extra }[] = [
  { title: 'Plant a tree, then stay.', body: 'Pick how long to focus and tap Plant. The tree grows while you work, and it is fully grown when the timer ends.', Demo: PlantDemo },
  { title: 'Leave, and it withers.', body: "Leaving Focus Garden for more than 10 seconds, or giving up, withers the tree. Calls and notifications don't count.", Demo: LeaveDemo },
  { title: 'Block what distracts you.', body: 'Choose apps to block while a tree grows. iOS shows Screen Time instead of the app, and blocking ends by itself when the tree is grown.', Demo: BlockDemo, extra: 'block' },
  { title: 'Longer focus, bigger trees.', body: 'Short sessions grow sprouts, longer ones grow trees. Merge three sprouts into a tree, and keep merging up to a house.', Demo: TiersDemo },
  { title: 'One contract for everyone.', body: "Verified trees go into one public contract on Bitcoin Cash, shared by every player. It sends each tree only to its owner's wallet. Not even Focus Garden can take or move it.", Demo: ContractDemo },
  { title: 'Bitcoin sets the clock.', body: 'Bitcoin Cash counts time locks in 512-second steps (about 8½ minutes) and adds a block about every 10 minutes. That timing comes from Bitcoin, not from us, so a verified tree is ready a little after your timer.', Demo: ClockDemo, extra: 'bitcoin' },
];

/** First-run introduction: six pages with live demos (including app blocking setup and how Bitcoin Cash sets the timing), your name, then linking your wallet, where your trees are sent. */
export default function Welcome() {
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const [name, setName] = useState(readDisplayName);
  const rewards = useRewards();
  const shield = useShield();
  const { configure } = useFocusGarden();
  const linked = Boolean(rewards.recipient);
  // Pages: the intro pages, your name, then your wallet.
  const last = PAGES.length + 1;
  function go(next: number) {
    scroller.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
    void Haptics.selectionAsync();
  }
  function finish() {
    if (name.trim()) saveDisplayName(name);
    markOnboarded();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (router.canGoBack()) router.back(); else router.replace('/');
  }
  return <SafeAreaView className="flex-1 bg-canvas">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-row justify-end px-4 pt-1"><Button variant="plain" size="medium" label="Skip" onPress={finish} /></View>
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))} keyboardShouldPersistTaps="handled">
        {PAGES.map((entry, index) => <ScrollView key={entry.title} style={{ width }} contentContainerClassName="flex-grow justify-center gap-7 px-6 py-4" showsVerticalScrollIndicator={false}>
          <entry.Demo active={page === index} />
          <View className="gap-3 px-2">
            <Text className="text-large-title text-ink">{entry.title}</Text>
            <Text className="text-body text-ink-2">{entry.body}</Text>
          </View>
          {entry.extra === 'block' ? <BlockSetup shield={shield} onUse={() => configure({ blockApps: true })} /> : null}
          {entry.extra === 'bitcoin' ? <View className="items-start"><Button variant="plain" size="medium" label="Learn more" onPress={() => router.push('/on-bitcoin')} /></View> : null}
        </ScrollView>)}
        <View style={{ width }} className="flex-1 justify-center gap-6 px-6">
          <Animated.View entering={FadeIn} className="items-center"><Stage round style={{ width: 168, height: 168 }}><Model3D spec={{ tier: 'sprout', species: 'oak', seed: 5 }} size={160} /></Stage></Animated.View>
          <View className="gap-3 px-2">
            <Text className="text-large-title text-ink">What should we call you?</Text>
            <Text className="text-body text-ink-2">It stays on your phone unless you create a public profile.</Text>
          </View>
          <Field label="Your name" autoCorrect={false} autoCapitalize="words" textContentType="nickname" value={name} onChangeText={setName} maxLength={32} placeholder="Name" returnKeyType="next" onSubmitEditing={() => go(PAGES.length + 1)} />
        </View>
        <ScrollView style={{ width }} contentContainerClassName="flex-grow justify-center gap-6 px-6 py-6" keyboardShouldPersistTaps="handled">
          <View className="gap-3 px-2">
            <Text className="text-large-title text-ink">Link your wallet</Text>
            <Text className="text-body text-ink-2">Your trees are sent to your own wallet.</Text>
          </View>
          <WalletLink />
        </ScrollView>
      </ScrollView>
      <View className="gap-5 px-6 pb-4">
        <View accessibilityLabel={`Page ${page + 1} of ${last + 1}`} className="flex-row justify-center gap-1.5 pt-[4px]">{Array.from({ length: last + 1 }, (_, index) => <View key={index} style={{ width: index === page ? 20 : 7, backgroundColor: index === page ? color.moss : color.divider }} className="h-[7px] rounded-full" />)}</View>
        <Button label={page < last ? 'Continue' : linked ? 'Start focusing' : 'Not now'} variant={page < last || linked ? 'primary' : 'secondary'} onPress={() => (page < last ? go(page + 1) : finish())} />
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

/** The blocking page's setup: one button that walks through Screen Time access, then the picker. */
function BlockSetup({ shield, onUse }: { shield: ReturnType<typeof useShield>; onUse: () => void }) {
  const status = shield.status;
  if (!status?.supported) {
    return <Text className="px-2 text-footnote text-ink-2">{status?.pendingApproval ? 'This copy of Focus Garden was built without app blocking.' : 'App blocking works in the iPhone and Android apps.'}</Text>;
  }
  const label = shield.ready ? `${status.selectionCount} blocked · Change` : shield.stepLabel ?? 'Set up blocking';
  return <View className="gap-2">
    <Button variant={shield.ready ? 'secondary' : 'primary'} size="medium" icon={shield.ready ? icons.checkCircle : icons.hourglass} label={label}
      onPress={async () => { if (shield.ready) await shield.chooseApps(); else await shield.continueSetup(); onUse(); }} />
    <Text className={`px-2 text-footnote ${shield.error ? 'text-ember' : 'text-ink-2'}`}>{shield.error ?? 'Apple keeps your choices private, even from Focus Garden.'}</Text>
  </View>;
}
