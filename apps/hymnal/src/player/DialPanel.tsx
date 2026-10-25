/**
 * The panel the dials stand on: one opaque, raised surface, a little lighter
 * than the page, with an edge that reads against it (`panel` and `edge`,
 * `theme.ts`) and a soft shadow, so no page word shows through it or between
 * its rows. The dials draw no surface of their own (`DialView`): over the
 * bar the panel holds the reset chip and the rows, and in the player sheet
 * the chord section's dials and the text size dial stand on one each.
 *
 * Over the bar the panel is a popover of the key button (`DialPopover`): it
 * springs open out of the key button, its rows fading in 40 ms apart from
 * the bottom one up, and closes back into it. A close keeps the panel on
 * screen, drawn as it was last open, until it has gone. While open the panel
 * takes every touch on it, so a tap on its padding or between its rows never
 * reaches the page under it; it takes none once its close has started. With
 * Reduce Motion on, open and
 * close are a fade alone.
 *
 * Every frame of it runs on the UI thread: React is told only as the close
 * ends, to take the panel away.
 */

import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color } from '~/color';

import { DETENT } from './dial';

/** The panel's padding round its rows, and the space between them, in points. */
export const PANEL_PAD = 8;
export const ROW_GAP = 10;

/** The panel as a surface: its rows stand on it with no fill of their own. */
export function DialPanel({
  testID,
  children,
}: {
  readonly testID?: string;
  readonly children: ReactNode;
}) {
  return (
    <View testID={testID} style={styles.panel}>
      {children}
    </View>
  );
}

/**
 * The open: a spring of 0.4 s and bounce 0.3 (the `ui` skill's largest
 * release bounce, for the owner's "springy"), so the panel overshoots its
 * size a little and settles. The close: 0.35 s and no bounce, shorter than
 * the open, with no overshoot; with the fade over the whole way back, the
 * panel is out of sight about a quarter second after the touch.
 * Stiffness `(2π/d)²`, damping `4π(1 − b)/d`.
 */
const OPEN = { stiffness: 247, damping: 22, mass: 1 };
const CLOSE = { stiffness: 322, damping: 35.9, mass: 1 };

/** Where the open starts: this much of its size, this far below its rest, in points. */
const FROM_SCALE = 0.55;
const FROM_LOW = 10;

/**
 * The share of the open under which the panel fades as it opens: below it,
 * it is see-through in step, so it is solid before the spring overshoots. As
 * it closes it fades over the whole way back, so it stays in sight while it
 * shrinks into the key button.
 */
const FADE_UNDER = 0.4;

/** Reduce Motion's fade, in milliseconds, at an even pace, so the whole of it shows. */
const REDUCED_FADE = 150;

/** How far apart the rows start, from the bottom one up, in milliseconds. */
export const ROW_STAGGER = 40;

/** Whether the rows in the panel fade in one after another as it opens: over the bar, with motion allowed. */
const Staggered = createContext(false);

/**
 * The panel over the bar, open while `open`: it springs out of the key
 * button, whose centre is `keyAt` points from the panel's left edge and
 * `below` points under its bottom edge, and closes back into it.
 */
export function DialPopover({
  open,
  keyAt,
  below,
  children,
}: {
  readonly open: boolean;
  readonly keyAt: SharedValue<number>;
  readonly below: number;
  readonly children: ReactNode;
}) {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  // While it closes the panel draws what it showed when it was last open: a page turn or a reset
  // that closes it changes nothing in it as it goes.
  const last = useRef(children);
  if (open) last.current = children;
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0);
  // The panel's size, measured as it lays out; until then, its size with two rows across the screen.
  const size = useSharedValue({
    width: width - 24,
    height: 2 * DETENT + ROW_GAP + 2 * PANEL_PAD + 2,
  });
  const hide = () => setShown(false);

  useEffect(() => {
    const ended = (finished?: boolean) => {
      'worklet';
      if (finished && !open) scheduleOnRN(hide);
    };
    const to = (open && 1) || 0;
    if (reduced) {
      progress.value = withTiming(
        to,
        {
          duration: REDUCED_FADE,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.Never,
        },
        ended,
      );
      return;
    }
    progress.value = withSpring(
      to,
      { ...((open && OPEN) || CLOSE), reduceMotion: ReduceMotion.Never },
      ended,
    );
  }, [open, reduced]);

  const drawn = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduced) return { opacity: Math.min(Math.max(p, 0), 1) };
    // The key button's centre from the panel's centre: the scale's origin.
    const ox = keyAt.value - size.value.width / 2;
    const oy = size.value.height / 2 + below;
    return {
      opacity: Math.min(Math.max(p / ((open && FADE_UNDER) || 1), 0), 1),
      transform: [
        { translateY: FROM_LOW * (1 - p) },
        { translateX: ox },
        { translateY: oy },
        { scale: FROM_SCALE + (1 - FROM_SCALE) * p },
        { translateX: -ox },
        { translateY: -oy },
      ],
    };
  });

  const measured = (event: LayoutChangeEvent) => {
    size.value = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  };

  if (!shown) return <></>;
  return (
    <Animated.View
      testID="dials-panel"
      pointerEvents={(open && 'auto') || 'none'}
      onLayout={measured}
      style={[styles.panel, drawn]}
    >
      <Staggered value={!reduced}>{(open && children) || last.current}</Staggered>
    </Animated.View>
  );
}

/** How long a row's fade takes, on the strong ease-out. */
const ROW_FADE = 200;

/**
 * One row of the panel, `fromBottom` rows over its bottom one: in the
 * popover it fades in `ROW_STAGGER` ms after the row under it as it mounts;
 * elsewhere it stands as it is.
 */
export function PanelRow({
  fromBottom,
  children,
}: {
  readonly fromBottom: number;
  readonly children: ReactNode;
}) {
  const staggered = use(Staggered);
  const shown = useSharedValue(Number(!staggered));
  useEffect(() => {
    if (!staggered) return;
    shown.value = withDelay(
      fromBottom * ROW_STAGGER,
      withTiming(1, {
        duration: ROW_FADE,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, []);
  const drawn = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View style={drawn}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  panel: {
    padding: PANEL_PAD,
    gap: ROW_GAP,
    borderRadius: DETENT / 2 + PANEL_PAD,
    borderWidth: 1,
    borderColor: color.edge,
    backgroundColor: color.panel,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
