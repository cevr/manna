import { Option } from 'effect';
import { useEffect, useMemo, type ReactNode } from 'react';
import Animated, {
  Easing,
  FadeInDown,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { MOTION, type PlantMotion } from '../home/motion';

/** One furrow icon enters without moving its title or controls; no wrapper is added at rest. */
export function EnteringIcon({
  delay,
  children,
}: {
  readonly delay: Option.Option<number>;
  readonly children: ReactNode;
}) {
  return Option.match(delay, {
    onNone: () => children,
    onSome: (ms) => <IconEntrance delay={ms}>{children}</IconEntrance>,
  });
}

function IconEntrance({
  delay,
  children,
}: {
  readonly delay: number;
  readonly children: ReactNode;
}) {
  const entering = useMemo(
    () => FadeInDown.delay(delay).duration(MOTION.iconDuration).reduceMotion(ReduceMotion.System),
    [delay],
  );
  return (
    <Animated.View aria-hidden entering={entering}>
      {children}
    </Animated.View>
  );
}

/** A spring builder belongs to its own delay: Keyframe.delay mutates its instance. */
function Spring({ delay, children }: { readonly delay: number; readonly children: ReactNode }) {
  const entering = useMemo(
    () =>
      new Keyframe({
        0: { opacity: 0, transform: [{ translateY: 10 }, { scale: 0.4 }] },
        60: { opacity: 1, transform: [{ translateY: -2 }, { scale: 1.06 }] },
        100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
      })
        .delay(delay)
        .duration(MOTION.springDuration)
        .reduceMotion(ReduceMotion.System),
    [delay],
  );
  return (
    <Animated.View aria-hidden entering={entering}>
      {children}
    </Animated.View>
  );
}

/** Full corn starts upright and sways on Reanimated's shared value, which cancels on unmount. */
function Sway({ children }: { readonly children: ReactNode }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(
      withSequence(
        ReduceMotion.System,
        withTiming(MOTION.swayDegrees, {
          duration: MOTION.swayDuration / 2,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
        withTiming(-MOTION.swayDegrees, {
          duration: MOTION.swayDuration,
          easing: Easing.inOut(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
        withTiming(0, {
          duration: MOTION.swayDuration / 2,
          easing: Easing.in(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
      ),
      -1,
      false,
      // oxlint-disable-next-line effect/noNullish -- Reanimated's positional no-callback argument keeps ReduceMotion.System explicit in slot five
      undefined,
      ReduceMotion.System,
    );
  }, [turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View aria-hidden style={style}>
      {children}
    </Animated.View>
  );
}

/** A plant image springs and sways independently; at rest the image has no animated wrapper. */
export function Moves({
  motion,
  children,
}: {
  readonly motion: PlantMotion;
  readonly children: ReactNode;
}) {
  let drawing = children;
  if (motion.sway) drawing = <Sway>{children}</Sway>;
  return Option.match(motion.spring, {
    onNone: () => drawing,
    onSome: (delay) => <Spring delay={delay}>{drawing}</Spring>,
  });
}
