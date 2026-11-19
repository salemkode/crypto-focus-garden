import { useEffect, useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { AccessibilityInfo, AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlockDemo, LeaveDemo, PlantDemo, TiersDemo, type DemoProps } from '../components/onboarding/Demos';
import { WalletLink } from '../components/WalletLink';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { useRewards } from '../features/rewards/RewardProvider';
import { useShield } from '../features/shield/useShield';
import { markOnboarded } from '../features/profile/local';
import { Button, color, icons } from '../ui';

const INTRO: { title: string; body: string; Demo: (props: DemoProps) => ReactNode }[] = [
  { title: 'Plant a tree, then stay', body: 'It grows while you focus and is fully grown when the timer ends.', Demo: PlantDemo },
  { title: 'Leave, and it withers', body: "Leaving for more than 10 seconds withers the tree. Calls and notifications don't count.", Demo: LeaveDemo },
  { title: 'Longer focus, bigger trees', body: 'Merge three sprouts into a tree, and keep merging up to a house.', Demo: TiersDemo },
  { title: 'Block what distracts you', body: 'Chosen apps stay closed until your tree has grown.', Demo: BlockDemo },
];
const BLOCK_PAGE = 3;
const WALLET_TITLE = 'Link your wallet';
/** The intro pages, then your wallet. */
const COUNT = INTRO.length + 1;
const LAST = COUNT - 1;
const TITLES = [...INTRO.map((entry) => entry.title), WALLET_TITLE];

/** Only the page on screen is read by VoiceOver and TalkBack. */
const hiddenWhen = (hidden: boolean) => ({ accessibilityElementsHidden: hidden, importantForAccessibility: hidden ? 'no-hide-descendants' as const : 'auto' as const });

/**
 * First-run introduction: four pages with live demos (planting, withering, tree sizes, optional app
 * blocking), then linking your wallet, where your trees are sent. The demo stage, the text and the
 * footer sit in the same place on every page; each page has one primary button.
 */
export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const stage = Math.min(300, Math.round(height * 0.36));
  const scroller = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const [asking, setAsking] = useState(false);
  /** While typing an address the footer steps aside, so the field's own Link button stays in view. */
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  /** Set once the permission prompt has been answered here; if access is still off, the page says so and moves on. */
  const [asked, setAsked] = useState(false);
  const rewards = useRewards();
  const shield = useShield();
  const { configure } = useFocusGarden();
  const linked = Boolean(rewards.recipient);
  /** On the blocking page, Screen Time (or usage) access is the main action until it is granted or declined. */
  const needsAccess = page === BLOCK_PAGE && shield.nextStep === 'authorize';
  const asksPermission = needsAccess && !asked;
  /** Access was asked for and is still off: say so, and let the user continue (or ask again). */
  const declined = needsAccess && asked;
  /** Set when the user asks for blocking; it is turned on only once access is actually granted. */
  const wantsBlocking = useRef(false);
  const authorized = Boolean(shield.status?.authorized);
  useEffect(() => {
    if (!authorized || !wantsBlocking.current) return;
    wantsBlocking.current = false;
    configure({ blockApps: true });
  }, [authorized, configure]);
  /** Android: waiting for the user to come back from Settings before judging the answer. */
  const returning = useRef<{ remove: () => void } | null>(null);
  useEffect(() => () => returning.current?.remove(), []);

  function show(next: number) {
    setPage(next);
    void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(`${TITLES[next]}. Page ${next + 1} of ${COUNT}`);
  }
  function go(next: number) {
    if (next < 0 || next > LAST) return;
    scroller.current?.scrollTo({ x: next * width, animated: true });
    show(next);
  }
  function finish() {
    markOnboarded();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (router.canGoBack()) router.back(); else router.replace('/');
  }
  /** Android opens Settings and returns at once: the answer is known only when the app is active again. */
  function awaitReturn() {
    returning.current?.remove();
    let left = AppState.currentState !== 'active';
    returning.current = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { left = true; return; }
      if (!left) return;
      returning.current?.remove();
      returning.current = null;
      void shield.refresh().finally(() => setAsked(true));
    });
  }
  async function allowBlocking() {
    setAsking(true);
    wantsBlocking.current = true;
    try {
      await shield.continueSetup();
    } finally {
      setAsking(false);
      if (Platform.OS === 'android') awaitReturn(); else setAsked(true);
    }
  }

  const primary = page < LAST
    ? asksPermission
      ? <Button label={shield.stepLabel ?? 'Allow Screen Time access'} icon={icons.hourglass} busy={asking} onPress={() => void allowBlocking()} />
      : <Button label="Continue" onPress={() => go(page + 1)} />
    : linked
      ? <Button label="Start focusing" onPress={finish} />
      : <Button label="Not now" variant="secondary" onPress={finish} />;

  return <SafeAreaView className="flex-1 bg-canvas">
    {/* Android draws edge to edge, so the window no longer shrinks for the keyboard: pad on both platforms. */}
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      {/* The last page has its own way out, so Skip gives way to it; the row keeps its height. */}
      <View className="min-h-12 flex-row justify-end px-4 pt-1">{page < LAST ? <Button variant="plain" size="medium" label="Skip" onPress={finish} /> : null}</View>
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={16} keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={(event) => { const next = Math.round(event.nativeEvent.contentOffset.x / width); if (next !== page) show(next); }}>
        {INTRO.map((entry, index) => <ScrollView key={entry.title} style={{ width }} contentContainerClassName="flex-grow gap-7 px-6 pb-4 pt-3" showsVerticalScrollIndicator={false} {...hiddenWhen(index !== page)}>
          <entry.Demo active={page === index} height={stage} />
          <View className="gap-2 px-2">
            <Text accessibilityRole="header" className="text-title-1 text-ink">{entry.title}</Text>
            <Text className="text-body text-ink-2">{entry.body}</Text>
          </View>
          {index === BLOCK_PAGE ? <BlockSetup shield={shield} declined={declined} onUse={() => configure({ blockApps: true })} /> : null}
        </ScrollView>)}
        <ScrollView style={{ width }} contentContainerClassName="flex-grow gap-6 px-6 pb-4 pt-3" keyboardShouldPersistTaps="handled" {...hiddenWhen(page !== LAST)}>
          <View className="gap-2 px-2">
            <Text accessibilityRole="header" className="text-title-1 text-ink">{WALLET_TITLE}</Text>
            <Text className="text-body text-ink-2">A public Bitcoin Cash contract sends your grown trees there.</Text>
            <Pressable accessibilityRole="link" accessibilityHint="How verified trees and their timing work on Bitcoin Cash" hitSlop={8} onPress={() => router.push('/on-bitcoin')} className="min-h-11 justify-center self-start active:opacity-70">
              <Text className="text-callout font-semibold text-moss">Learn more</Text>
            </Pressable>
          </View>
          <WalletLink />
        </ScrollView>
      </ScrollView>
      {typing ? null : <View className="gap-3 px-6 pb-2 pt-2">
        <View accessible accessibilityRole="adjustable" accessibilityLabel={`Page ${page + 1} of ${COUNT}`}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => go(page + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}
          className="flex-row justify-center gap-1.5 py-1">
          {Array.from({ length: COUNT }, (_, index) => <View key={index} style={{ width: index === page ? 20 : 7, backgroundColor: index === page ? color.moss : color.divider }} className="h-[7px] rounded-full" />)}
        </View>
        {primary}
        {/* A fixed slot so the footer keeps its height when a page has a way to decline. */}
        <View className="min-h-11 justify-center">
          {asksPermission ? <Button variant="plain" size="medium" label="Not now" onPress={() => go(page + 1)} />
            : declined ? <Button variant="plain" size="medium" label="Try again" busy={asking} onPress={() => void allowBlocking()} /> : null}
        </View>
      </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

/**
 * The rest of the blocking setup once access is granted (Android's overlay step, choosing apps,
 * changing them), plus Apple's privacy note or the reason access failed. Access itself is the
 * page's primary button.
 */
function BlockSetup({ shield, declined, onUse }: { shield: ReturnType<typeof useShield>; declined: boolean; onUse: () => void }) {
  const status = shield.status;
  const off = `${Platform.OS === 'ios' ? 'Screen Time' : 'Usage'} access is off. You can allow it later in Focus rules.`;
  // Say it once to VoiceOver and TalkBack too: the page stays put and the main button changes to Continue.
  useEffect(() => { if (declined && !shield.error) AccessibilityInfo.announceForAccessibility(off); }, [declined, shield.error, off]);
  if (!status?.supported) {
    return <Text className="px-2 text-footnote text-ink-2">{status?.pendingApproval ? 'This copy of Focus Garden was built without app blocking.' : 'App blocking works in the iPhone and Android apps.'}</Text>;
  }
  const step = shield.ready ? `${status.selectionCount} blocked · Change` : shield.nextStep !== 'authorize' ? shield.stepLabel : null;
  const note = shield.error ?? (declined ? off : Platform.OS === 'ios' ? 'Apple keeps your choices private, even from Focus Garden.' : null);
  return <View className="gap-2">
    {step ? <Button variant="secondary" size="medium" icon={shield.ready ? icons.checkCircle : icons.hourglass} label={step}
      onPress={async () => { if (shield.ready) await shield.chooseApps(); else await shield.continueSetup(); onUse(); }} /> : null}
    {note ? <Text className={`px-2 text-footnote ${shield.error ? 'text-ember' : declined ? 'text-ink' : 'text-ink-2'}`}>{note}</Text> : null}
  </View>;
}
