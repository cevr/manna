/**
 * A dial: a pill with its name at the left and a row of detents, `DETENT`
 * points apart, that slides past a notch at the row's middle. The detent at
 * the notch is the dial's value. A finger drags the row sideways and flings
 * it; let go, the row glides on and snaps to a detent (`dial.ts`). A dial
 * of any finite, ordered list of stops either wraps (the keys) or stops at
 * its ends (the capo, the text size), where a drag stops and cues a wall.
 *
 * The drag and the glide run as worklets on the UI thread; JavaScript is
 * called only when the row reaches a new detent, not once per frame: it is
 * told a `detent` cue for each detent passed since the last, in order, and
 * `onTurn` once with the latest. A value set from outside (a reset, the
 * twin dial in the player sheet) turns the row the short way to it, and
 * tells nothing back.
 * A double tap asks for a reset. VoiceOver reads the dial as adjustable:
 * a swipe up or down turns it one detent.
 *
 * The drag is a gesture handler's pan that needs a sideways move to begin,
 * so a vertical scroll under the dial still scrolls, and the dial lies over
 * the page, outside the pager, so a drag on it never turns the page.
 */

import { Array as Arr, Match, Option } from 'effect';
import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color, useAccent } from '~/color';
import { type DialName, useCue } from '~/feel/cue';

import { DETENT, detentAt, dragTo, FRAME, glide, ownDetent, passed, placeOf } from './dial';

export interface DialProps<A> {
  /** Which dial it is: its detents' cues name it (`~/feel/cue`). */
  readonly dial: DialName;
  /** What VoiceOver names the dial by, and a test finds it by. */
  readonly label: string;
  /** The small word at the dial's left. */
  readonly title: string;
  readonly stops: ReadonlyArray<A>;
  /** The stop at the notch. */
  readonly index: number;
  readonly wrap: boolean;
  /** What VoiceOver reads for the dial's value. */
  readonly said: string;
  /** A stop drawn in its detent; `current` while it sits at the notch. */
  readonly drawStop: (stop: A, current: boolean) => ReactNode;
  /**
   * The row reached detent `n`: among the dial's own on a wrapping dial;
   * on a stopping one, one past an end when VoiceOver turns it there.
   */
  readonly onTurn: (n: number) => void;
  /** A double tap. */
  readonly onReset?: () => void;
  readonly testID: string;
}

/** The width of the dial's name at its left, in points. */
const TITLE = 58;

function Dial<A>(props: DialProps<A>) {
  const { dial, label, title, stops, index, wrap, said, drawStop, testID } = props;
  const cue = useCue();
  const accent = useAccent();
  const detents = { name: dial, count: stops.length, wrap };
  const place = useSharedValue(index * DETENT);
  const start = useSharedValue(0);
  // Whether the finger, or the glide it let go, moves the row: only then is a detent told.
  const driven = useSharedValue(false);
  const walled = useSharedValue(false);
  // Whether the touch under way has dragged the row.
  const dragged = useSharedValue(false);
  const [width, setWidth] = useState(0);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    if (driven.value || ownDetent(detents, detentAt(place.value)) === index) return;
    place.value = withTiming(placeOf(detents, place.value, index), {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [index]);

  /** The row passed `crossed` (own detents, in order): a cue for each, one turn to the last. */
  const turned = (crossed: ReadonlyArray<number>) => {
    for (const at of crossed) cue({ _tag: 'detent', dial, at });
    for (const last of crossed.slice(-1)) live.current.onTurn(last);
  };
  const wall = () => cue({ _tag: 'wall' });
  const reset = () => live.current.onReset?.();

  useAnimatedReaction(
    () => detentAt(place.value),
    (now, before) => {
      // The first call (before none) comes as the dial mounts, when nothing drives it.
      // oxlint-disable-next-line effect/noNullish -- Reanimated gives a reaction's first call its previous value as null.
      if (before !== null && now !== before && driven.value)
        scheduleOnRN(turned, passed(detents, before, now));
    },
  );

  /** The row glides on from where it is at `speed` points a second, and snaps to a detent. */
  const settle = (speed: number) => {
    'worklet';
    const rest = glide(detents, place.value, speed);
    place.value = withTiming(
      rest.at,
      { duration: rest.frames * FRAME, easing: Easing.out(Easing.exp) },
      (finished) => {
        'worklet';
        driven.value = false;
        if (finished && rest.cues.some((told) => told._tag === 'wall')) scheduleOnRN(wall);
        // A wrapping row comes back to its first turn, so it never runs off its copies.
        if (finished && detents.wrap) place.value = ownDetent(detents, detentAt(rest.at)) * DETENT;
      },
    );
  };

  const pan = usePanGesture({
    testID: `${testID}-pan`,
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    maxPointers: 1,
    onBegin: () => {
      'worklet';
      cancelAnimation(place);
      start.value = place.value;
      walled.value = false;
      dragged.value = false;
    },
    onActivate: () => {
      'worklet';
      driven.value = true;
      dragged.value = true;
    },
    onUpdate: ({ translationX = 0 }) => {
      'worklet';
      const to = dragTo(detents, start.value - translationX);
      place.value = to.place;
      if (to.wall && !walled.value) scheduleOnRN(wall);
      walled.value = to.wall;
    },
    onDeactivate: ({ velocityX = 0 }) => {
      'worklet';
      settle(-velocityX);
    },
    onFinalize: ({ canceled }) => {
      'worklet';
      // A touch that stopped a glide and never dragged leaves the row between detents: it snaps.
      if (!dragged.value) settle(0);
      else if (canceled) driven.value = false;
    },
  });
  const twice = useTapGesture({
    testID: `${testID}-twice`,
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      scheduleOnRN(reset);
    },
  });
  const gesture = useCompetingGestures(pan, twice);

  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: width / 2 - DETENT / 2 - place.value }],
  }));

  const act = ({ nativeEvent }: AccessibilityActionEvent) => {
    const by = (nativeEvent.actionName === 'increment' && 1) || -1;
    cue({ _tag: 'detent', dial, at: ownDetent(detents, index + by) });
    // A stopping dial is told one past its end, which its owner holds there.
    live.current.onTurn(
      Match.value(wrap).pipe(
        Match.when(true, () => ownDetent(detents, index + by)),
        Match.orElse(() => index + by),
      ),
    );
  };

  // A wrapping row draws two turns of copies each side of its own, so a glide never runs off them.
  const copies = (wrap && 2) || 0;
  const drawn = Array.from({ length: stops.length * (2 * copies + 1) }, (_, k) => {
    const n = k - copies * stops.length;
    return { n, stop: Arr.get(stops, ownDetent(detents, n)) };
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          aria-label={label}
          aria-valuetext={said}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={act}
          testID={testID}
          style={styles.dial}
        >
          <Text style={styles.title} aria-hidden>
            {title}
          </Text>
          <View
            style={styles.window}
            onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          >
            <Animated.View testID={`${testID}-row`} pointerEvents="none" style={[styles.row, row]}>
              {drawn.map(({ n, stop }) => (
                <View key={n} style={[styles.stop, { left: n * DETENT }]}>
                  {Option.match(stop, {
                    onNone: () => [],
                    onSome: (shown) => drawStop(shown, ownDetent(detents, n) === index),
                  })}
                </View>
              ))}
            </Animated.View>
            <View pointerEvents="none" style={[styles.notch, { backgroundColor: accent }]} />
          </View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/**
 * Whether a dial draws as it did: its handlers are read through `live`, and
 * a stop is drawn from the stop and whether it is current alone, so a
 * handler's new identity draws nothing again. A dial redraws when its stops,
 * its value or its words change, not each time the player's place does.
 */
const same = <A,>(a: DialProps<A>, b: DialProps<A>) =>
  a.dial === b.dial &&
  a.label === b.label &&
  a.title === b.title &&
  a.stops === b.stops &&
  a.index === b.index &&
  a.wrap === b.wrap &&
  a.said === b.said &&
  a.testID === b.testID;

// oxlint-disable-next-line effect/noAs -- memo erases a generic component's type parameter; this restores it.
export const DialView = memo(Dial, same) as <A>(props: DialProps<A>) => ReactNode;

const styles = StyleSheet.create({
  root: { flex: 0 },
  dial: {
    height: DETENT,
    borderRadius: DETENT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: color.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  title: {
    width: TITLE,
    paddingLeft: 16,
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1,
    color: color.muted,
  },
  window: { flex: 1, height: DETENT, overflow: 'hidden' },
  row: { position: 'absolute', top: 0, left: 0, height: DETENT },
  stop: {
    position: 'absolute',
    top: 0,
    width: DETENT,
    height: DETENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -1,
    width: 2,
    height: 9,
  },
});
