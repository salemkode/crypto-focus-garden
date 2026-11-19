import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AccessibilityInfo, Alert, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { seedOf } from '@focus-garden/garden/valley';
import { ValleyView } from '../../components/valley/ValleyView';
import { levelForSeconds, levelName, MAX_SESSION, SPECIES_CODE, speciesById, tagById, tierForSeconds } from '../../features/focus/catalog';
import { useFocusGarden, useNow } from '../../features/focus/FocusProvider';
import { onchainSessionView } from '../../features/focus/onchain-session';
import { growthProgress, remainingSeconds } from '../../features/focus/session';
import { formatClock, formatDuration } from '../../features/focus/stats';
import { useRewards } from '../../features/rewards/RewardProvider';
import { useShield } from '../../features/shield/useShield';
import { growingEntity, valleyHistory } from '../../features/valley/history';
import { useStoredMerges } from '../../features/valley/useStoredMerges';
import { Arc, Button, color, Floating, Icon, IconButton, icons, Notice, numerals } from '../../ui';

/** The valley is the screen. Plant, and your tree grows in its own plot while you focus. */
export default function FocusScreen() {
  const { garden, storage, plant, giveUp, dismiss, configure } = useFocusGarden();
  const now = useNow();
  const shield = useShield();
  const rewards = useRewards();
  const timer = garden.timer;
  const idle = timer.status === 'idle';
  const growing = timer.status === 'growing';
  const species = speciesById(idle ? garden.species : timer.species);
  const tag = tagById(idle ? garden.tag : timer.tag);
  const progress = growthProgress(timer, now);
  const blocking = garden.blockApps && shield.ready;
  const length = idle ? garden.duration : timer.duration;
  const reward = { name: levelName(levelForSeconds(length)) };
  const size = reward.name.toLowerCase();
  const linked = Boolean(rewards.recipient);
  const canVerify = Boolean(rewards.account && linked && rewards.data.state === 'connected');
  // An unresolved wallet operation blocks a new plant, so the session would not be verified.
  const verified = garden.verify && canVerify && !rewards.pending;
  /** What happened to this session's verified plant: only a submitted one is promised to the wallet. */
  const [onChain, setOnChain] = useState<'sending' | 'sent' | 'failed' | null>(null);
  const [panel, setPanel] = useState(260);
  const [planning, setPlanning] = useState(false);
  const insets = useSafeAreaInsets();
  const { merges, state: mergeStorage, record } = useStoredMerges();

  // The valley's seed is the wallet it belongs to, so the same history always grows the same valley.
  const seed = useMemo(() => seedOf(rewards.recipient ?? 'focus-garden.local'), [rewards.recipient]);
  const history = useMemo(() => valleyHistory(garden, merges),
    // Only grown records and merges are history; the timer ticking is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [garden.records, merges]);
  // Growth is drawn in 24 steps, so the scene only updates when the tree visibly changes.
  const step = Math.floor(progress * 24);
  const growingNow = useMemo(() => growingEntity(garden, step / 24),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timer.status, timer.status === 'growing' ? timer.id : '', step]);
  const plantedAt = useMemo(() => {
    const at: Record<string, number> = {};
    for (const entry of garden.records) at[entry.id] = entry.endedAt;
    for (const merge of merges) at[merge.result.id] = merge.at;
    return at;
  }, [garden.records, merges]);

  // Sessions are capped just under an hour (seven 512-second steps); older saved lengths are trimmed once.
  useEffect(() => {
    if (storage === 'ready' && idle && garden.duration > MAX_SESSION) configure({ duration: MAX_SESSION });
  }, [storage, idle, garden.duration, configure]);

  // Feel every moment: a firm tap to plant, a cheer when it grows, a nudge when it withers.
  // VoiceOver and TalkBack hear the same three moments, and nothing in between.
  // Only real transitions count: loading a saved garden on launch is not one.
  const previous = useRef<typeof timer.status | null>(null);
  useEffect(() => {
    if (storage !== 'ready') return;
    const before = previous.current;
    previous.current = timer.status;
    if (before === null || before === timer.status) return;
    if (timer.status === 'growing') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      AccessibilityInfo.announceForAccessibility(`Planted. Growing a ${size} for ${formatDuration(length)}.`);
    }
    if (timer.status === 'grown') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AccessibilityInfo.announceForAccessibility(`Your ${size} joined your valley.`);
    }
    if (timer.status === 'withered') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      AccessibilityInfo.announceForAccessibility(`Your ${size} withered.`);
    }
    // Fires on status changes only; the name and length belong to that same timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status, storage]);

  function start() {
    // Every tree belongs to a wallet: there is no planting before one is linked.
    if (!linked) return;
    plant();
    const units = Math.floor(garden.duration / 512);
    // The Plant tap approves the whole verified session: lock it now, and send the grown tree to
    // the linked wallet automatically when the lock matures. A background refresh delays it; it
    // never drops it silently.
    if (verified && units >= 1) {
      const tierCode = ['sprout', 'tree', 'bigTree', 'house'].indexOf(tierForSeconds(units * 512)) + 1;
      setOnChain('sending');
      void rewards.plantAndRelease({ units, tier: tierCode, species: SPECIES_CODE[garden.species] })
        .then((sent) => setOnChain(sent ? 'sent' : 'failed'), () => setOnChain('failed'));
    } else setOnChain(null);
  }

  function confirmGiveUp() {
    Alert.alert('Give up this tree?', 'It withers in your valley.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Give up', style: 'destructive', onPress: giveUp },
    ]);
  }

  const blockedCount = blocking ? shield.status!.selectionCount : 0;
  const blockedLine = blocking ? `${blockedCount} ${blockedCount === 1 ? 'app' : 'apps'} blocked` : null;
  const left = remainingSeconds(timer, now) ?? 0;
  const stateParts = [`Grows a ${size}`, species.name, blockedLine].filter(Boolean);
  const stateLine = stateParts.join(' · ');

  return <View className="flex-1 bg-canvas">
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <ValleyView seed={seed} history={history} growing={growingNow} bottomInset={panel + insets.bottom} topInset={insets.top + 56}
        merging={idle && mergeStorage === 'ready'} plantedAt={plantedAt} onMerge={record} onPlanning={setPlanning} />
    </View>

    <SafeAreaView edges={['top']} pointerEvents="box-none" className="absolute left-0 right-0 top-0">
      <View pointerEvents="box-none" className="flex-row items-center gap-2 px-4 pt-1">
        {/* Hidden while a tree grows, like Focus rules: linking opens another wallet app, and leaving withers the tree. */}
        {growing ? null : <View>
          <IconButton floating icon={icons.wallet} label={linked ? 'Your wallet, linked' : 'Link your wallet'} onPress={() => router.push('/link-wallet')} />
          {linked ? null : <View pointerEvents="none" className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-surface bg-ember" />}
        </View>}
        <View pointerEvents="none" className="flex-1" />
        <ChainPill now={now} />
        {growing ? null : <IconButton floating icon={icons.rules} label="Focus rules" onPress={() => router.push('/settings')} />}
      </View>
    </SafeAreaView>

    {/* No panel until the saved garden is read, so default settings never flash before the real ones. */}
    {planning || storage === 'loading' ? null : <SafeAreaView edges={['bottom']} pointerEvents="box-none" className="absolute bottom-0 left-0 right-0">
      <Floating onLayout={(event) => setPanel(event.nativeEvent.layout.height)} className="mx-3 mb-2 gap-4 p-4">
        {idle && storage === 'ready' ? <>
          {/* One summary of the next session (length, tag, what it grows); tapping it opens the session sheet. */}
          <Pressable accessibilityRole="button" accessibilityLabel={`Next session: ${[formatDuration(garden.duration), tag.label, ...stateParts].join(', ')}`} accessibilityHint="Opens the session settings"
            onPress={() => router.push('/session')} className="flex-row items-center gap-3 rounded-2xl active:opacity-60">
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-3">
                <Text style={numerals} className="text-title-1 font-semibold text-ink">{formatDuration(garden.duration)}</Text>
                <View className="flex-row items-center gap-1.5">
                  <View style={{ backgroundColor: tag.color }} className="h-2.5 w-2.5 rounded-full" />
                  <Text numberOfLines={1} className="text-subhead font-semibold text-ink-2">{tag.label}</Text>
                </View>
              </View>
              <Text numberOfLines={1} className="text-footnote text-ink-2">{stateLine}</Text>
            </View>
            <Icon name={icons.chevron} size={14} tint={color.ink3} weight="semibold" />
          </Pressable>
          {linked ? <Button label="Plant" icon={verified ? icons.lock : undefined} disabled={storage !== 'ready'} onPress={start}
            accessibilityHint={verified ? 'Locks this session on Bitcoin Cash. The grown tree is sent to your wallet.' : undefined} />
            : <Button label="Link your wallet to plant" icon={icons.wallet} onPress={() => router.push('/link-wallet')} />}
        </> : null}

        {growing ? <Animated.View entering={FadeInDown} className="gap-3">
          <View className="flex-row items-center gap-4">
            <Arc progress={progress} size={76} stroke={5} accessibilityLabel={`Growing your ${size}`}>
              <Text style={numerals} className="text-footnote font-semibold text-ink-2">{Math.round(progress * 100)}%</Text>
            </Arc>
            <View className="flex-1">
              <Text accessibilityRole="timer" accessibilityLabel={left >= 60 ? `${formatDuration(left)} left` : 'Less than a minute left'} adjustsFontSizeToFit numberOfLines={1} style={numerals} className="text-display text-ink">{formatClock(left)}</Text>
              <Text numberOfLines={1} className="text-footnote text-ink-2">Growing a {size} · {tag.label}{blocking ? ' · apps blocked' : ''}</Text>
            </View>
          </View>
          {onChain === 'failed' ? <Notice tone="error">{`Not verified on Bitcoin Cash. Your ${size} still grows here.`}</Notice> : null}
          <Button variant="destructive" size="medium" label="Give up" onPress={confirmGiveUp} />
        </Animated.View> : null}

        {timer.status === 'grown' || timer.status === 'withered' ? <Animated.View entering={FadeIn} className="gap-4">
          <View className="gap-0.5">
            <Text accessibilityRole="header" className="text-title-3 text-ink">{timer.status === 'grown' ? `Your ${size} joined your valley` : `Your ${size} withered`}</Text>
            <Text className="text-subhead text-ink-2">{timer.status === 'grown' ? `${formatDuration(timer.duration)} focused${onChain === 'sent' ? '. On its way to your wallet.' : ''}` : timer.reason === 'left-app' ? 'You left the app for too long.' : 'You gave up early.'}</Text>
          </View>
          {/* Returns to the next-session summary; planting stays one deliberate tap on Plant. */}
          <Button label="Next session" onPress={dismiss} />
        </Animated.View> : null}
        {mergeStorage === 'error' ? <Notice tone="error">Your merges could not be read. Merging is paused and nothing was reset.</Notice> : null}
        {storage === 'error' ? <Notice tone="error">{"Your valley couldn't be read or saved. Nothing was reset. Reopen the app to try again."}</Notice> : null}
      </Floating>
    </SafeAreaView>}
  </View>;
}

/** Shown only while a verified tree is on chain: a live countdown that opens its details. */
function ChainPill({ now }: { now: number }) {
  const rewards = useRewards();
  const view = onchainSessionView(rewards.data.state === 'connected' ? rewards.data.sessions : [], now);
  if (!view) return null;
  const label = view.session.state === 'locked' && view.remaining > 0 ? formatClock(view.remaining) : view.session.state === 'confirming' ? 'Confirming' : view.session.state === 'merging' ? 'Merging' : 'Sending';
  return <Floating round>
    <Pressable accessibilityRole="button" accessibilityLabel={`Verified tree: ${label}`} onPress={() => router.push('/chain')} className="min-h-11 flex-row items-center gap-2 rounded-full pl-1.5 pr-4 active:opacity-70">
      <Arc progress={Math.max(0.05, view.progress)} size={32} stroke={3}><Icon name={icons.lock} size={11} tint={color.ink2} /></Arc>
      <Text style={numerals} className="text-subhead font-semibold text-ink">{label}</Text>
    </Pressable>
  </Floating>;
}
