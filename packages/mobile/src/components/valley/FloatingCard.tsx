import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import type { CardMessage } from './protocol';
import { readNote, writeNote } from '../../features/valley/useStoredMerges';
import { color, continuous, floatingShadow, Icon, icons } from '../../ui';

const WIDTH = 248;

/**
 * A card that floats above whatever you tapped and follows it as the camera moves.
 * The position comes from the render loop (projected anchor), so it never lags a frame behind.
 */
export function FloatingCard({ card, live, x, y, visible, onClose, onFocus }: {
  card: CardMessage;
  /** A line that changes while you watch (what a villager is doing). */
  live?: string;
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 0 when the anchor is behind the camera or off screen. */
  visible: SharedValue<number>;
  onClose: () => void;
  onFocus?: () => void;
}) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(reduced ? 1 : 0);
  const bob = useSharedValue(0);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // The text being typed. Saved when the field closes, and also if the card closes first.
  const draft = useRef<string | null>(null);
  const noteKey = card.noteKey;
  useEffect(() => () => { if (noteKey && draft.current !== null) void writeNote(noteKey, draft.current); }, [noteKey]);

  useEffect(() => {
    pop.set(reduced ? 1 : withSpring(1, { dampingRatio: 0.62, duration: 520 }));
    if (!reduced) bob.set(withRepeat(withSequence(withTiming(-3, { duration: 1600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) })), -1));
  }, [bob, pop, reduced]);


  useEffect(() => {
    if (!card.noteKey) return;
    let alive = true;
    readNote(card.noteKey).then((text) => { if (alive) setNote(text); }).catch(() => { if (alive) setNote(''); });
    return () => { alive = false; };
  }, [card.noteKey]);

  const style = useAnimatedStyle(() => {
    const k = pop.get();
    return {
      opacity: Math.min(k, visible.get()),
      transform: [
        { translateX: x.get() - WIDTH / 2 },
        { translateY: y.get() + bob.get() + (1 - k) * 18 },
        { translateY: -14 }, // sits above the anchor, pointer touching it
        { scale: 0.7 + k * 0.3 },
      ],
    };
  });

  function finishNote() {
    const text = draft.current;
    draft.current = null;
    setEditing(false);
    if (text === null) return;
    setNote(text.trim());
    if (card.noteKey) void writeNote(card.noteKey, text);
  }

  // The exit fade sits on its own wrapper so it never fights the per-frame opacity.
  return <Animated.View pointerEvents="box-none" exiting={FadeOut.duration(140)} style={{ position: 'absolute', left: 0, top: 0 }}>
    <Animated.View pointerEvents="box-none" style={[{ width: WIDTH }, style]}>
    <View style={{ transform: [{ translateY: '-100%' }] }}>
      <View accessibilityRole="summary" className="rounded-[20px] border border-white/70 bg-surface/95 px-4 pb-3 pt-3" style={[continuous, floatingShadow]}>
        <View className="flex-row items-start gap-2">
          <Pressable className="flex-1" accessibilityRole="button" accessibilityLabel={`${card.name}. Move closer`} onPress={onFocus}>
            <Text className="text-footnote font-semibold text-sun-ink">{card.eyebrow}</Text>
            <Text className="text-headline text-ink" numberOfLines={2}>{card.name}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-sunk active:opacity-60">
            <Icon name={icons.close} size={12} tint={color.ink2} weight="bold" />
          </Pressable>
        </View>
        {card.facts.map((fact) => <Text key={fact} className="mt-0.5 text-subhead text-ink-2">{fact}</Text>)}
        {live ? <View className="mt-1.5 flex-row items-center gap-1.5"><View className="h-2 w-2 rounded-full bg-moss" /><Text className="text-subhead font-medium text-moss">{live}</Text></View> : null}
        {card.noteKey && note !== null ? editing
          ? <TextInput autoFocus multiline maxLength={280} defaultValue={note} placeholder="A note for this one…" placeholderTextColor={color.ink3} onChangeText={(text) => { draft.current = text; }} onBlur={finishNote} submitBehavior="blurAndSubmit" returnKeyType="done"
              className="mt-2 min-h-11 rounded-xl bg-sunk px-3 py-2 text-subhead text-ink" />
          : <Pressable accessibilityRole="button" accessibilityLabel={note ? `Note: ${note}. Edit note` : 'Add a note'} onPress={() => setEditing(true)} className="mt-2 min-h-11 flex-row items-center gap-2 rounded-xl bg-sunk px-3 py-2 active:opacity-70">
              {note ? null : <Icon name={icons.note} size={15} tint={color.ink2} />}
              <Text className={note ? 'flex-1 text-subhead italic text-ink' : 'flex-1 text-subhead text-ink-2'} numberOfLines={3}>{note ? `“${note}”` : 'Add a note'}</Text>
            </Pressable>
          : null}
      </View>
      <View className="h-3 w-3 self-center bg-surface/95" style={{ marginTop: -6, transform: [{ rotate: '45deg' }] }} />
    </View>
    </Animated.View>
  </Animated.View>;
}
