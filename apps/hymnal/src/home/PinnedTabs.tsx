import { type ReactNode, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color } from '~/color';
import { useReduceMotion } from '~/player/motion';

import { hidden, inReach, jumped, type Reveal, revealAt, shownHeight, touched } from './reveal';

const slide = { duration: 200, easing: Easing.out(Easing.cubic) };

const fade = { duration: 150, easing: Easing.linear };

export interface TabReveal {
  readonly state: SharedValue<Reveal>;
  readonly progress: SharedValue<number>;
  readonly cover: SharedValue<number>;
  readonly rest: number;
  readonly height: number;
  readonly reduced: boolean;
  readonly jump: (at: number) => void;
  readonly touch: () => void;
  readonly scroll: SharedValue<number>;
}

export function useTabReveal(scroll: SharedValue<number>, rest: number, height: number): TabReveal {
  const reduced = useReduceMotion();
  const state = useSharedValue(hidden(rest));
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => scroll.value,
    (now) => {
      const next = revealAt(state.value, now, rest);
      if (!next.held && now <= rest) {
        if (progress.value !== 0) progress.value = 0;
      } else if (next.shown !== state.value.shown) {
        progress.value = withTiming(Number(next.shown), { ...slide, ...(reduced && fade) });
      }
      state.value = next;
    },
  );
  const cover = useDerivedValue(() => {
    if (reduced) return shownHeight(Math.ceil(progress.value), height, scroll.value, rest);
    return shownHeight(progress.value, height, scroll.value, rest);
  });
  const jump = (at: number) => {
    state.value = jumped(state.value, at);
  };
  const touch = () => {
    const next = touched(state.value, scroll.value, rest);
    if (state.value.shown && !next.shown) progress.value = 0;
    state.value = next;
  };
  return { state, progress, cover, rest, height, reduced, jump, touch, scroll };
}

export function PinnedTabs({
  reveal,
  children,
}: {
  readonly reveal: TabReveal;
  readonly children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => inReach(reveal.state.value, reveal.scroll.value, reveal.rest),
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
  );
  const place = useAnimatedStyle(() => {
    const at = { translateY: reveal.cover.value - reveal.height };
    if (reveal.reduced) return { opacity: reveal.progress.value, transform: [at] };
    return { opacity: 1, transform: [at] };
  });
  return (
    <Animated.View
      testID="shown-tabs"
      {...(!shown && outOfReach)}
      style={[styles.pinned, { height: reveal.height }, place]}
    >
      {children}
    </Animated.View>
  );
}

const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;

const styles = StyleSheet.create({
  pinned: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: color.ground },
});
