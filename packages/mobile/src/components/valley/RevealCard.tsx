import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { continuous, floatingShadow } from '../../ui/tokens';

export interface RevealCardProps {
  reveal: { badge: string; title: string; subtitle: string; key: string } | null;
  onDone?: () => void;
}

export function RevealCard({ reveal, onDone }: RevealCardProps) {
  return reveal ? <RevealContent key={reveal.key} reveal={reveal} onDone={onDone} /> : null;
}

function RevealContent({ reveal, onDone }: RevealCardProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.85);
  const [done, setDone] = useState(false);
  const active = useRef(true);
  const doneCallback = useRef(onDone);
  useEffect(() => { doneCallback.current = onDone; }, [onDone]);
  const finish = useCallback(() => {
    if (!active.current) return;
    setDone(true);
    doneCallback.current?.();
  }, []);

  useEffect(() => {
    active.current = true;
    scale.set(reducedMotion ? 1 : withSpring(1, { duration: 400, dampingRatio: 0.7 }));
    opacity.set(withSequence(
      ReduceMotion.Never,
      withTiming(1, { duration: 200, reduceMotion: ReduceMotion.Never }),
      withDelay(3800, withTiming(0, { duration: 250, reduceMotion: ReduceMotion.Never }, (finished) => {
        if (finished) scheduleOnRN(finish);
      }), ReduceMotion.Never),
    ));
    return () => {
      active.current = false;
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [finish, opacity, reducedMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  if (done || !reveal) return null;
  return <View pointerEvents="none" className="absolute inset-0 items-center justify-center px-6">
    <Animated.View
      accessible accessibilityLiveRegion="polite"
      accessibilityLabel={`${reveal.badge}. ${reveal.title}. ${reveal.subtitle}`}
      style={[continuous, floatingShadow, animatedStyle]}
      className="w-full max-w-[360px] items-center rounded-[24px] border border-white/70 bg-surface/95 px-6 py-5"
    >
      <View className="rounded-full bg-sun px-3 py-1">
        <Text className="text-footnote font-semibold text-ink">{reveal.badge}</Text>
      </View>
      <Text className="mb-1 mt-2 text-center text-title-2 text-ink">{reveal.title}</Text>
      <Text className="text-center text-subhead text-ink-2">{reveal.subtitle}</Text>
    </Animated.View>
  </View>;
}
