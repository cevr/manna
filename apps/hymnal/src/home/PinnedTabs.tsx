/**
 * The home list's tab row pinned under the status bar, over the list's top,
 * once the reader scrolls up deep in the list (`reveal.ts`), and sent away
 * by a downward scroll: a layer on the ground, so the rows pass under it and
 * the list's content and offset never move for it. The pinned topic row
 * stands under it (`PullDown.cover`). At or above the row's resting place
 * the list's own tab row shows, and the pinned one is hidden and out of
 * reach.
 *
 * Its slide runs on the UI thread from the list's offset; React hears only
 * when the row turns, to let touches and VoiceOver reach it exactly while it
 * is shown. With Reduce Motion on, it appears and leaves by a fade alone.
 */

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

/** The row's slide in or out over the list's top: quick out of the way, as a toolbar's. */
const slide = { duration: 200, easing: Easing.out(Easing.cubic) };

/** Its fade alone with Reduce Motion on, as the find bar's cross-fade. */
const fade = { duration: 150, easing: Easing.linear };

/** The pinned tab row's place over the list, read on the UI thread. */
export interface TabReveal {
  /** The row's turn: shown or not, and where its run counts from. */
  readonly state: SharedValue<Reveal>;
  /** How far the row slid in: 0 hidden to 1 shown. */
  readonly progress: SharedValue<number>;
  /** How many points of the list's top the row covers (`shownHeight`). */
  readonly cover: SharedValue<number>;
  /** The list's resting place: the offset at which its own row meets its top. */
  readonly rest: number;
  /** The row's height. */
  readonly height: number;
  /** Whether the reader asks for reduced motion: the row then fades in place, with no slide. */
  readonly reduced: boolean;
  /** Moves the list to `at` for the app (a tab chosen, a tile picked), which turns nothing and holds the row. */
  readonly jump: (at: number) => void;
  /** The reader's finger met the list: the app's move is over, and the next run counts from where the list stands. */
  readonly touch: () => void;
  /** The list's offset the row follows. */
  readonly scroll: SharedValue<number>;
}

/**
 * The pinned row's turn and cover from the list's offset `scroll`: `revealAt`
 * turns it on each frame's offset, a turn slides it in or out, and at or
 * above the resting place `rest` it is hidden at once (the list's own row
 * stands where it would). From the app's move (`jump`) to the reader's touch
 * (`touch`) the row is held: it keeps its slide, and shows where the list
 * stands past the resting place.
 */
export function useTabReveal(scroll: SharedValue<number>, rest: number, height: number): TabReveal {
  const reduced = useReduceMotion();
  const state = useSharedValue(hidden(rest));
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => scroll.value,
    (now) => {
      const next = revealAt(state.value, now, rest);
      // Held, the row neither turns nor slides.
      if (!next.held && now <= rest) {
        if (progress.value !== 0) progress.value = 0;
      } else if (next.shown !== state.value.shown) {
        progress.value = withTiming(Number(next.shown), { ...slide, ...(reduced && fade) });
      }
      state.value = next;
    },
  );
  const cover = useDerivedValue(() => {
    // With Reduce Motion the row stands in place while any of it shows, and fades.
    if (reduced) return shownHeight(Math.ceil(progress.value), height, scroll.value, rest);
    return shownHeight(progress.value, height, scroll.value, rest);
  });
  const jump = (at: number) => {
    state.value = jumped(state.value, at);
  };
  const touch = () => {
    const next = touched(state.value, scroll.value, rest);
    // Let go at or above the resting place, the row is hidden there, slid out.
    if (state.value.shown && !next.shown) progress.value = 0;
    state.value = next;
  };
  return { state, progress, cover, rest, height, reduced, jump, touch, scroll };
}

/** The pinned layer (`shown-tabs`): `children` is the tab row, drawn as the list's own. */
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

/** Untouchable and unseen by assistive technology, as the hidden row is. */
const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;

const styles = StyleSheet.create({
  pinned: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: color.ground },
});
