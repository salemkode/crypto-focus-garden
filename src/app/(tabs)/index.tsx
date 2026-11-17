import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { seedOf } from '@focus-garden/garden/valley';
import { ValleyView } from '../../components/valley/ValleyView';
import { levelForSeconds, levelName, MAX_SESSION, SPECIES_CODE, speciesById, tagById, tierForSeconds } from '../../features/focus/catalog';
import { useFocusGarden } from '../../features/focus/FocusProvider';
import { onchainSessionView } from '../../features/focus/onchain-session';
import { growthProgress, remainingSeconds } from '../../features/focus/session';
import { formatClock } from '../../features/focus/stats';
import { useRewards } from '../../features/rewards/RewardProvider';
import { useShield } from '../../features/shield/useShield';
import { growingEntity, valleyHistory } from '../../features/valley/history';
import { useStoredMerges } from '../../features/valley/useStoredMerges';
import { Arc, Button, color, Floating, Icon, IconButton, icons, Notice, numerals } from '../../ui';

/** The valley is the screen. Plant, and your tree grows in its own plot while you focus. */
export default function FocusScreen() {
  const { garden, storage, now, plant, giveUp, dismiss, configure } = useFocusGarden();
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
  const linked = Boolean(rewards.recipient);
  const canVerify = Boolean(rewards.account && linked && rewards.data.state === 'connected');
  const verified = garden.verify && canVerify;
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
  const previous = useRef(timer.status);
  useEffect(() => {
    if (previous.current === timer.status) return;
    if (timer.status === 'growing') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (timer.status === 'grown') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (timer.status === 'withered') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    previous.current = timer.status;
  }, [timer.status]);

  function start() {
    // Every tree belongs to a wallet: there is no planting before one is linked.
    if (!linked) return;
    plant();
    const units = Math.floor(garden.duration / 512);
    // The Plant tap approves the whole verified session: lock it now, and send the grown tree to
    // the linked wallet automatically when the lock matures.
    if (verified && units >= 1 && !rewards.pending) {
      const tierCode = ['sprout', 'tree', 'bigTree', 'house'].indexOf(tierForSeconds(units * 512)) + 1;
      void rewards.plantAndRelease({ units, tier: tierCode, species: SPECIES_CODE[garden.species] });
    }
  }

  function confirmGiveUp() {
    Alert.alert('Give up this tree?', 'It withers in your valley.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Give up', style: 'destructive', onPress: giveUp },
    ]);
  }

  const shortName = species.name.split(' ').pop()!;
  const stateLine = [`Grows a ${reward.name.toLowerCase()}`, shortName[0].toUpperCase() + shortName.slice(1), blocking ? `${shield.status!.selectionCount} apps blocked` : null].filter(Boolean).join(' · ');

  return <View className="flex-1 bg-canvas">
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <ValleyView seed={seed} history={history} growing={growingNow} bottomInset={panel + insets.bottom} topInset={insets.top + 56}
        merging={idle && mergeStorage === 'ready'} plantedAt={plantedAt} onMerge={record} onPlanning={setPlanning} />
    </View>

    <SafeAreaView edges={['top']} pointerEvents="box-none" className="absolute left-0 right-0 top-0">
      <View pointerEvents="box-none" className="flex-row items-center gap-2 px-4 pt-1">
        <View>
          <IconButton floating icon={icons.wallet} label={linked ? 'Your wallet, linked' : 'Link your wallet'} onPress={() => router.push('/link-wallet')} />
          {linked ? null : <View pointerEvents="none" className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-surface bg-ember" />}
        </View>
        <View pointerEvents="none" className="flex-1" />
        <ChainPill now={now} />
        {growing ? null : <IconButton floating icon={icons.rules} label="Focus rules" onPress={() => router.push('/settings')} />}
      </View>
    </SafeAreaView>

    {planning ? null : <SafeAreaView edges={['bottom']} pointerEvents="box-none" className="absolute bottom-0 left-0 right-0">
      <Floating onLayout={(event) => setPanel(event.nativeEvent.layout.height)} className="mx-3 mb-2 gap-4 p-4">
        {idle ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={`${Math.round(garden.duration / 60)} minutes, grows a ${reward.name}, ${tag.label}. Change session`} onPress={() => router.push('/session')}
            className="flex-row items-center gap-3 rounded-2xl active:opacity-60">
            <View className="flex-1 gap-0.5">
              <Text style={numerals} className="text-title-1 font-semibold text-ink">{formatClock(garden.duration)}</Text>
              <Text numberOfLines={1} className="text-footnote text-ink-2">{stateLine}</Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-ink/5 py-1.5 pl-3 pr-2">
              <View style={{ backgroundColor: tag.color }} className="h-2 w-2 rounded-full" />
              <Text className="text-subhead font-semibold text-ink">{tag.label}</Text>
              <Icon name={icons.chevron} size={11} tint={color.ink3} weight="bold" />
            </View>
          </Pressable>
          {linked ? <Button label={`Plant ${species.name.split(' ').pop()!.toLowerCase()}`} icon={verified ? icons.lock : undefined} disabled={storage !== 'ready'} onPress={start}
            accessibilityHint={verified ? 'Locks this session on Bitcoin Cash. The grown tree is sent to your wallet.' : undefined} />
            : <Button label="Link wallet to plant" icon={icons.wallet} onPress={() => router.push('/link-wallet')} />}
        </> : null}

        {growing ? <Animated.View entering={FadeInDown} className="gap-3">
          <View className="flex-row items-center gap-4">
            <Arc progress={progress} size={76} stroke={5} accessibilityLabel={`Growing your ${reward.name.toLowerCase()}`}>
              <Text style={numerals} className="text-footnote font-semibold text-ink-2">{Math.round(progress * 100)}%</Text>
            </Arc>
            <View className="flex-1">
              <Text accessibilityRole="timer" adjustsFontSizeToFit numberOfLines={1} style={numerals} className="text-display text-ink">{formatClock(remainingSeconds(timer, now) ?? 0)}</Text>
              <Text numberOfLines={1} className="text-footnote text-ink-2">Growing a {reward.name.toLowerCase()} · {tag.label}{blocking ? ' · apps blocked' : ''}</Text>
            </View>
          </View>
          <Button variant="destructive" size="medium" label="Give up" onPress={confirmGiveUp} />
        </Animated.View> : null}

        {timer.status === 'grown' || timer.status === 'withered' ? <Animated.View entering={FadeIn} className="gap-4">
          <View className="gap-0.5">
            <Text className="text-title-3 text-ink">{timer.status === 'grown' ? `Your ${reward.name.toLowerCase()} joined your valley` : 'Your tree withered'}</Text>
            <Text className="text-subhead text-ink-2">{timer.status === 'grown' ? `${Math.round(timer.duration / 60)} focused minutes${verified ? '. On its way to your wallet.' : ''}` : timer.reason === 'left-app' ? 'You left the app for too long.' : 'You gave up early.'}</Text>
          </View>
          <Button label={timer.status === 'grown' ? 'Plant another' : 'Try again'} onPress={dismiss} />
        </Animated.View> : null}
        {mergeStorage === 'error' ? <Notice tone="error">Your merges could not be read. Merging is paused and nothing was reset.</Notice> : null}
        {storage === 'error' ? <Notice tone="error">Your valley could not be read or saved. Nothing was reset.</Notice> : null}
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
