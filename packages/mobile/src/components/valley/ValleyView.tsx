import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { levelInfo, uniqueName, type Level } from '@focus-garden/garden/ladder';
import { mergeOptions, planMerges, type PlannedMerge } from '@focus-garden/garden/merge-plan';
import { replayValley, type ValleyEntity, type ValleyEvent } from '@focus-garden/garden/valley';
import { FloatingCard } from './FloatingCard';
import { MergePlanner } from './MergePlanner';
import type { CardMessage, FromValley, ValleyHostHandle } from './protocol';
import { RevealCard, type RevealCardProps } from './RevealCard';
import { ValleyHost } from './ValleyHost';
import { color, Floating, Icon, icons, numerals } from '../../ui';

/**
 * The whole valley as one screen. The 3D world runs in the valley host (a WebView on phones, the
 * page itself on the web); the floating card, the Merge button, the planner and the reveal are
 * React Native, driven by messages from the world.
 */
export function ValleyView({ seed, history, growing, bottomInset, topInset, merging, plantedAt, onMerge, onPlanning }: {
  seed: number;
  history: ValleyEvent[];
  growing: { entity: ValleyEntity; progress: number } | null;
  /** Space taken by the panel at the bottom, so buttons sit above it. */
  bottomInset: number;
  topInset: number;
  /** Whether merging is offered right now (not while a session grows). */
  merging: boolean;
  /** When each item was planted or made, for the card ("Planted 3 days ago"). */
  plantedAt: Record<string, number>;
  onMerge: (plan: PlannedMerge[]) => void;
  /** The planner covers the bottom of the screen; the host hides its own panel meanwhile. */
  onPlanning?: (open: boolean) => void;
}) {
  const host = useRef<ValleyHostHandle>(null);
  const [ready, setReady] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<RevealCardProps['reveal']>(null);
  const [card, setCard] = useState<CardMessage | null>(null);
  const [live, setLive] = useState<string | undefined>(undefined);
  const [planner, setPlannerOpen] = useState(false);
  const cardX = useSharedValue(0), cardY = useSharedValue(0), cardVisible = useSharedValue(0);
  const setPlanner = (open: boolean) => { setPlannerOpen(open); onPlanning?.(open); };

  // Everything the world needs, sent whenever it changes (and in full whenever the world is (re)loaded).
  useEffect(() => { if (ready) host.current?.post({ type: 'init', seed, lowPower: Platform.OS === 'android' }); }, [ready, seed]);
  useEffect(() => { if (ready) host.current?.post({ type: 'history', history, growing, plantedAt }); }, [ready, seed, history, growing, plantedAt]);
  useEffect(() => { if (ready) host.current?.post({ type: 'insets', top: topInset, bottom: bottomInset }); }, [ready, topInset, bottomInset]);
  // The world stops (no stepping, no drawing) whenever it is not on screen: the app is in the
  // background or behind a system sheet, or another tab or a full screen covers the Focus tab.
  // Tabs stay mounted, so without this the valley would keep drawing out of sight.
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  const paused = !focused || !appActive;
  useEffect(() => { if (ready) host.current?.post({ type: 'pause', paused }); }, [ready, paused]);

  const onMessage = useCallback((message: FromValley) => {
    switch (message.type) {
      case 'ready': setReady((n) => n + 1); setBusy(false); setCard(null); break;
      case 'busy': setBusy(message.busy); break;
      case 'card':
        setCard(message.card); setLive(message.card?.live);
        if (!message.card) cardVisible.set(0);
        break;
      case 'anchor': cardX.set(message.x); cardY.set(message.y); cardVisible.set(message.visible ? 1 : 0); break;
      case 'live': setLive(message.text); break;
      case 'reveal': {
        const info = levelInfo(message.entity.level);
        setReveal({ key: message.entity.id, badge: `Level ${message.entity.level} · ${info.name}`, title: uniqueName(message.entity.level, message.entity.style, message.entity.seed), subtitle: `${message.ingredients} merged into one.${info.kind === 'tree' ? '' : ' A new place in your valley.'}` });
        break;
      }
      case 'summary': {
        const made = message.made.map(([level, n]) => `${n} ${levelInfo(level).name.toLowerCase()}${n > 1 ? 's' : ''}`).join(', ');
        setReveal({ key: `summary-${Date.now()}`, badge: `${message.merges} merges`, title: 'Your valley grew', subtitle: `${made}${message.villagers ? `. ${message.villagers} villagers moved in.` : ''}` });
        break;
      }
      case 'haptic':
        if (message.kind === 'selection') void Haptics.selectionAsync().catch(() => {});
        else if (message.kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        break;
      case 'stats': if (__DEV__) console.log(`[valley] ${message.fps} fps, ${message.frameMs} ms per frame, ${message.width}x${message.height}${message.layout ? ` (${message.layout})` : ''}`); break;
      case 'error': console.warn(`[valley] ${message.message}`); break;
    }
  }, [cardVisible, cardX, cardY]);

  // Merging is planned here from the same deterministic history the world replays, so the plan's
  // ids match what the world shows.
  const placed = useMemo(() => replayValley(growing ? [...history, { type: 'plant', entity: growing.entity }] : history, seed).placed, [history, growing, seed]);
  const exclude = useMemo(() => new Set(growing ? [growing.entity.id] : []), [growing]);
  const options = useMemo(() => (merging && !busy ? mergeOptions(placed, exclude) : []), [merging, busy, placed, exclude]);
  const possible = options.reduce((n, option) => n + option.available, 0);
  const plan = useCallback((counts: Partial<Record<Level, number>>, cascade: boolean) => planMerges(placed, counts, { cascade, exclude }), [placed, exclude]);

  function confirm(chosen: PlannedMerge[]) {
    if (!chosen.length || busy) return;
    onMerge(chosen);
    host.current?.post({ type: 'merge', plan: chosen });
  }

  return <View style={{ flex: 1 }}>
    <SkyBackdrop />
    <ValleyHost ref={host} onMessage={onMessage} />

    {card ? <FloatingCard key={card.key} card={card} live={live} x={cardX} y={cardY} visible={cardVisible}
      onClose={() => host.current?.post({ type: 'closeCard' })} onFocus={() => host.current?.post({ type: 'focusCard' })} /> : null}

    {possible > 0 && !planner && !reveal ? <Animated.View entering={FadeInDown.springify().dampingRatio(0.75)} exiting={FadeOutDown.duration(160)} pointerEvents="box-none" style={{ position: 'absolute', right: 14, bottom: bottomInset + 12 }}>
      <Floating round>
        <Pressable accessibilityRole="button" accessibilityLabel={`Merge. ${possible} possible`} onPress={() => { host.current?.post({ type: 'closeCard' }); setPlanner(true); void Haptics.selectionAsync().catch(() => {}); }}
          className="min-h-11 flex-row items-center gap-2 rounded-full pl-3.5 pr-2 active:opacity-70">
          <Icon name={icons.merge} size={16} tint={color.sunInk} weight="semibold" />
          <Text className="text-headline text-ink">Merge</Text>
          <View className="min-w-7 items-center rounded-full bg-sun px-2 py-0.5"><Text style={numerals} className="text-footnote font-bold text-ink">{possible}</Text></View>
        </Pressable>
      </Floating>
    </Animated.View> : null}

    <MergePlanner visible={planner} options={options} plan={plan} onConfirm={confirm} onClose={() => setPlanner(false)} />
    <RevealCard reveal={reveal} onDone={() => setReveal(null)} />
  </View>;
}

/** The sky behind the (transparent) world: a soft afternoon gradient, drawn by React Native. */
function SkyBackdrop() {
  // CSS gradients: `experimental_backgroundImage` on the new architecture, `backgroundImage` on web.
  const gradient = 'linear-gradient(180deg, #ffd9b3 0%, #cfe8ee 100%)';
  const fill = Platform.OS === 'web' ? { backgroundImage: gradient } : { experimental_backgroundImage: gradient };
  return <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#cfe8ee' }, fill as object]} />;
}
