/**
 * A dial: a row with its name at the left and a row of detents, `DETENT`
 * points apart, that slides past a notch at the row's middle. The detent at
 * the notch is the dial's value. A finger drags the row sideways and flings
 * it; let go, the row glides on and snaps to a detent (`dial.ts`). A dial
 * of any finite, ordered list of stops either wraps (the keys) or stops at
 * its ends (the capo, the text size), where a drag stops and cues a wall.
 *
 * A dial draws no surface of its own: it lies on the panel the open dials
 * stand on (`DialPanel`). Each stop is drawn by its distance from the notch,
 * as card J draws it: the stop at the notch 1.3 times the size of its
 * neighbours, and the stops fading toward the row's ends. The notch
 * stretches and settles on each detent the row reaches.
 *
 * The drag, the glide and every stop's size run as worklets on the UI
 * thread; JavaScript is called only when the row reaches a new detent, not
 * once per frame: it is told a `detent` cue for each detent passed since the
 * last, in order, and `onTurn` once with the latest. A value set from
 * outside (the twin dial in the player sheet) turns the row the short way to
 * it, and tells nothing back; a reset (`resets`) turns it home on a slower
 * curve, so the reader sees it go home. A touch that stops such a turn and
 * lifts with no drag lets it go on to the dial's value, the value as it is
 * at the lift: one set from outside while the finger is down (a second
 * finger on the twin dial or on Reset) is where the row goes. Only a row
 * the finger or its glide moved snaps to the nearest detent. The dial's own
 * turns come back to it as its value, in order and maybe late (a busy
 * JavaScript thread takes them seconds after the glide has ended): the row
 * never turns back for them.
 * A double tap asks for a reset. VoiceOver reads the dial as adjustable:
 * a swipe up or down turns it one detent.
 *
 * A wrapping row's stops stand on a ring (`ringOf`): each one is placed
 * every frame, on the UI thread, at the copy of it nearest the notch
 * (`slotOf`), so at any place, however far and fast the row is flung, every
 * slot of the window shows a key, in order.
 *
 * The name keeps one line at every text size, whole: its column is as wide
 * as the widest name of its group (`COLUMN`) drawn at the text size showing,
 * and `TITLE` points at the least, so the notches of a group's dials line up and
 * the column follows a change of the system's text size as the text does.
 * Every text in the row grows with Dynamic Type at most `MOST_SCALE` times,
 * as a fixed-height control's text does.
 *
 * The drag is a gesture handler's pan that needs a sideways move to begin,
 * so a vertical scroll under the dial still scrolls, and the dial lies over
 * the page, outside the pager, so a drag on it never turns the page.
 *
 * A dial with `axis` `column` is a drum (the find drums): its name stands
 * above a window `DRUM_WINDOW` tall, the detent at the notch with one above
 * and one below, its stops run down the window, and its pan needs a
 * vertical move to begin. A finger dragged up brings the higher detents to
 * the notch, as on a picker wheel. Only the axis differs (`AXES`, `along`):
 * the drag, glide, cues, ring and VoiceOver are the row's.
 */

import { Array as Arr, Match, Option } from 'effect';
import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
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
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  type WithTimingConfig,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color } from '~/color';
import { type DialName, useCue } from '~/feel/cue';

import {
  along,
  type Axis,
  DETENT,
  detentAt,
  dragTo,
  FRAME,
  glide,
  ownDetent,
  passed,
  placeOf,
  ringOf,
  slotOf,
} from './dial';
import { useReduceMotion } from './motion';

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
  /** A finger came down on the dial. */
  readonly onTouch?: () => void;
  /**
   * How many resets the dial's owner has told: an index that comes with a
   * new count is a reset, and the row turns home on the reset's curve.
   */
  readonly resets?: number;
  /**
   * Which way the dial runs: `row` (the default), sideways with its name at
   * the left; `column`, a drum, up and down with its name above.
   */
  readonly axis?: Axis;
  readonly testID: string;
}

/** The width of the dial's name at its left, in points, at the system's default text size. */
const TITLE = 58;

/** The most a dial's texts grow with the system's text size: the row's height is fixed. */
export const MOST_SCALE = 1.3;

/** How long a reset turns the row home, on the strong ease-in-out: slow enough to see. */
export const RESET_TURN = 300;

/** How long a value set from outside turns the row to it. */
const FOLLOW_TURN = 240;

/** How far a stop is drawn from the notch, in detents, before it is at its faintest. */
const FADE = 3.6;

/** How long the notch stretches and settles on each detent, in milliseconds. */
const NOTCH = 140;

/** How tall a drum's window is: the detent at the notch and one above and below it. */
const DRUM_WINDOW = 3 * DETENT;

/** How tall a drum's name above it is, in points. */
const DRUM_TITLE = 24;

/** A stop moved `by` points from the notch along `axis`. */
const shifted = (axis: Axis, by: number) => {
  'worklet';
  if (axis === 'column') return { translateY: by };
  return { translateX: by };
};

/** The notch stretched `by` times across `axis`: down from a row's top, right from a drum's left. */
const stretched = (axis: Axis, by: number) => {
  'worklet';
  if (axis === 'column') return { scaleX: by };
  return { scaleY: by };
};

/**
 * The titles of the dials drawn one over another, so each one's title
 * column is as wide as the widest of its own group: the player's and
 * settings' dials share one column, the find drums (`Drums.tsx`) another.
 */
const PLAYER_TITLES = ['KEY', 'CAPO', 'SIZE', 'PLACE'] as const;
const DRUM_TITLES = ['HUNDREDS', 'TENS', 'ONES'] as const;
const COLUMN = {
  key: PLAYER_TITLES,
  capo: PLAYER_TITLES,
  size: PLAYER_TITLES,
  placement: PLAYER_TITLES,
  hundreds: DRUM_TITLES,
  tens: DRUM_TITLES,
  ones: DRUM_TITLES,
} satisfies Record<DialName, ReadonlyArray<string>>;

function Dial<A>(props: DialProps<A>) {
  const {
    dial,
    label,
    title,
    stops,
    index,
    wrap,
    said,
    drawStop,
    testID,
    resets = 0,
    axis = 'row',
  } = props;
  const look = AXES[axis];
  const cue = useCue();
  const reduced = useReduceMotion();
  const detents = { name: dial, count: stops.length, wrap };
  const place = useSharedValue(index * DETENT);
  const start = useSharedValue(0);
  // Whether the finger, or the glide it let go, moves the row: only then is a detent told.
  const driven = useSharedValue(false);
  // The latest glide, counted: a glide stopped by a touch is told so a frame later, when the
  // touch may already drive the row, so only the latest glide's end lets go of the row.
  const glides = useSharedValue(0);
  const walled = useSharedValue(false);
  // Whether the touch under way has dragged the row.
  const dragged = useSharedValue(false);
  // Whether a turn to a value set from outside (a reset, the twin dial) is under way, and where it goes.
  const following = useSharedValue(false);
  const aim = useSharedValue(index * DETENT);
  // Whether the touch under way stopped such a turn: lifted with no drag, it lets the turn go on to its value.
  const stoppedFollow = useSharedValue(false);
  const stretch = useSharedValue(1);
  const [span, setSpan] = useState(0);
  const live = useRef(props);
  live.current = props;
  const homed = useRef(resets);
  // The detents the finger or its glide told (`onTurn`) that have not come back as the value yet, in order.
  const told = useRef<Array<number>>([]);

  /** The row turns to `to`, a value set from outside, on `timing`; a touch that stops it and never drags lets it go on. */
  const follow = (to: number, timing: WithTimingConfig) => {
    'worklet';
    aim.value = to;
    following.value = true;
    place.value = withTiming(to, timing, (finished) => {
      'worklet';
      if (finished) following.value = false;
    });
  };

  useEffect(() => {
    const byReset = homed.current !== resets;
    homed.current = resets;
    // A value the dial told coming back, in the order told, is its own turn, which the row has shown
    // already, however far it has turned on since; any other value is set from outside.
    const back = told.current.indexOf(index);
    const echo = !byReset && back >= 0;
    told.current = (echo && told.current.slice(back + 1)) || [];
    // Where the row shows the value: a touch that stopped a turn there and lifts with no drag goes on to it.
    // It is handed on as computed: a write here reaches the UI thread later than a read of it would.
    const to = placeOf(detents, place.value, index);
    aim.value = to;
    // A row driven by the finger, or standing on the value, stays; any other turns to it.
    if (echo || driven.value || place.value === to) return;
    follow(
      to,
      Match.value(byReset).pipe(
        Match.when(true, () => ({
          duration: RESET_TURN,
          easing: Easing.bezier(0.77, 0, 0.175, 1),
        })),
        Match.orElse(() => ({ duration: FOLLOW_TURN, easing: Easing.out(Easing.cubic) })),
      ),
    );
  }, [index, resets]);

  /** The row passed `crossed` (own detents, in order): a cue for each, one turn to the last. */
  const turned = (crossed: ReadonlyArray<number>) => {
    for (const at of crossed) cue({ _tag: 'detent', dial, at });
    for (const last of crossed.slice(-1)) {
      told.current.push(last);
      live.current.onTurn(last);
    }
  };
  const wall = () => cue({ _tag: 'wall' });
  const reset = () => live.current.onReset?.();
  const touch = () => live.current.onTouch?.();

  useAnimatedReaction(
    () => detentAt(place.value),
    (now, before) => {
      // The first call (before none) comes as the dial mounts, when nothing drives it.
      // oxlint-disable-next-line effect/noNullish -- Reanimated gives a reaction's first call its previous value as null.
      if (before === null || now === before) return;
      if (!reduced)
        stretch.value = withSequence(
          withTiming(2.2, { duration: NOTCH / 2 }),
          withTiming(1, { duration: NOTCH / 2 }),
        );
      if (driven.value) scheduleOnRN(turned, passed(detents, before, now));
    },
  );

  /** The row glides on from where it is at `speed` points a second, and snaps to a detent. */
  const settle = (speed: number) => {
    'worklet';
    const rest = glide(detents, place.value, speed);
    const own = glides.value + 1;
    glides.value = own;
    place.value = withTiming(
      rest.at,
      { duration: rest.frames * FRAME, easing: Easing.out(Easing.exp) },
      (finished) => {
        'worklet';
        if (glides.value !== own) return;
        driven.value = false;
        if (finished && rest.cues.some((told) => told._tag === 'wall')) scheduleOnRN(wall);
      },
    );
  };

  const pan = usePanGesture({
    testID: `${testID}-pan`,
    ...look.pan,
    maxPointers: 1,
    onBegin: () => {
      'worklet';
      cancelAnimation(place);
      // The touch stopped any glide where it stands: the row is the finger's now, and moves again only once it drags.
      glides.value += 1;
      driven.value = false;
      stoppedFollow.value = following.value;
      following.value = false;
      start.value = place.value;
      walled.value = false;
      dragged.value = false;
      scheduleOnRN(touch);
    },
    onActivate: ({ translationX = 0, translationY = 0 }) => {
      'worklet';
      // A turn set from outside while the finger was down gives way to the drag, which starts where it stands.
      if (following.value) {
        cancelAnimation(place);
        following.value = false;
        start.value = place.value + along(axis, translationX, translationY);
      }
      driven.value = true;
      dragged.value = true;
    },
    onUpdate: ({ translationX = 0, translationY = 0 }) => {
      'worklet';
      const to = dragTo(detents, start.value - along(axis, translationX, translationY));
      place.value = to.place;
      if (to.wall && !walled.value) scheduleOnRN(wall);
      walled.value = to.wall;
    },
    onDeactivate: ({ velocityX = 0, velocityY = 0 }) => {
      'worklet';
      settle(-along(axis, velocityX, velocityY));
    },
    onFinalize: ({ canceled }) => {
      'worklet';
      if (dragged.value) {
        if (canceled) driven.value = false;
        return;
      }
      // A turn set from outside after the finger came down (a reset, the twin dial) is under way: it goes on.
      if (following.value) return;
      // A touch that stopped a turn from outside lets it go on to the dial's value as it is now;
      // one that stopped a glide leaves the row between detents: it snaps.
      if (stoppedFollow.value)
        follow(aim.value, { duration: FOLLOW_TURN, easing: Easing.out(Easing.cubic) });
      else settle(0);
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

  const notch = useAnimatedStyle(() => ({ transform: [stretched(axis, stretch.value)] }));

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

  // A wrapping row draws the whole turns of its ring once each; a stopping row, its stops.
  const ring = ringOf(detents, span);
  const drawn = Array.from({ length: Math.max(ring / DETENT, stops.length) }, (_, n) => ({
    n,
    stop: Arr.get(stops, ownDetent(detents, n)),
  }));

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
          style={look.dial}
        >
          <View style={look.title} aria-hidden>
            <View style={styles.sizer}>
              {COLUMN[dial].map((name) => (
                <Text
                  key={name}
                  style={styles.title}
                  numberOfLines={1}
                  maxFontSizeMultiplier={MOST_SCALE}
                >
                  {name}
                </Text>
              ))}
            </View>
            <Text
              style={[styles.title, look.name]}
              numberOfLines={1}
              maxFontSizeMultiplier={MOST_SCALE}
            >
              {title}
            </Text>
          </View>
          <View
            style={look.window}
            onLayout={({ nativeEvent: { layout } }: LayoutChangeEvent) =>
              setSpan(along(axis, layout.width, layout.height))
            }
          >
            <View
              testID={`${testID}-row`}
              pointerEvents="none"
              style={[look.row, look.offset(span / 2 - DETENT / 2)]}
            >
              {drawn.map(({ n, stop }) => (
                <Stop
                  key={n}
                  n={n}
                  own={ownDetent(detents, n)}
                  place={place}
                  ring={ring}
                  axis={axis}
                  testID={testID}
                >
                  {Option.match(stop, {
                    onNone: () => [],
                    onSome: (shown) => drawStop(shown, ownDetent(detents, n) === index),
                  })}
                </Stop>
              ))}
            </View>
            <Animated.View pointerEvents="none" style={[look.notch, notch]} />
          </View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/**
 * Drawn stop `n` in its slot (`slotOf`, on the row's ring), drawn by its
 * distance `d` from the notch, in detents (card J): scale
 * `1 + 0.3·max(0, 1 − |d|)`, opacity `0.2 + 0.8·max(0, 1 − |d|/3.6)`, all
 * worked out on the UI thread each frame. Its test id names the stop it
 * draws among the dial's own (`<dial>-stop-<own>`).
 */
function Stop({
  n,
  own,
  place,
  ring,
  axis,
  testID,
  children,
}: {
  readonly n: number;
  readonly own: number;
  readonly place: SharedValue<number>;
  readonly ring: number;
  readonly axis: Axis;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const drawn = useAnimatedStyle(() => {
    const x = slotOf(n, place.value, ring);
    const d = Math.abs(x / DETENT);
    return {
      opacity: 0.2 + 0.8 * Math.max(0, 1 - d / FADE),
      transform: [shifted(axis, x), { scale: 1 + 0.3 * Math.max(0, 1 - d) }],
    };
  });
  return (
    <Animated.View testID={`${testID}-stop-${own}`} style={[AXES[axis].stop, drawn]}>
      <View style={AXES[axis].tick} />
      {children}
    </Animated.View>
  );
}

/**
 * Whether a dial draws as it did: its handlers are read through `live`, and
 * a stop is drawn from the stop and whether it is current alone, so a
 * handler's new identity draws nothing again. A dial redraws when its stops,
 * its value, its words or its resets change, not each time the player's
 * place does.
 */
const same = <A,>(a: DialProps<A>, b: DialProps<A>) =>
  a.dial === b.dial &&
  a.label === b.label &&
  a.title === b.title &&
  a.stops === b.stops &&
  a.index === b.index &&
  a.wrap === b.wrap &&
  a.said === b.said &&
  a.resets === b.resets &&
  a.testID === b.testID &&
  a.axis === b.axis;

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
  },
  titleColumn: { minWidth: TITLE, justifyContent: 'center' },
  sizer: { opacity: 0, height: 0 },
  name: { position: 'absolute', left: 0 },
  title: {
    paddingLeft: 16,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
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
  tick: {
    position: 'absolute',
    top: 3,
    width: 1,
    height: 5,
    backgroundColor: color.edge,
  },
  notch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -1,
    width: 2,
    height: 9,
    transformOrigin: 'top',
    backgroundColor: color.chord,
  },
  drum: {
    borderRadius: DETENT / 2,
    flexDirection: 'column',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  drumTitle: { height: DRUM_TITLE, alignItems: 'center', justifyContent: 'center' },
  drumName: { position: 'absolute', left: 0, right: 0, paddingLeft: 0, textAlign: 'center' },
  drumWindow: { height: DRUM_WINDOW, overflow: 'hidden' },
  drumRow: { position: 'absolute', top: 0, left: 0, right: 0, height: DETENT },
  drumStop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DETENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drumTick: {
    position: 'absolute',
    left: 3,
    width: 5,
    height: 1,
    backgroundColor: color.edge,
  },
  drumNotch: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -1,
    width: 9,
    height: 2,
    transformOrigin: 'left',
    backgroundColor: color.chord,
  },
});

/**
 * What a dial draws and reads by its axis: a row's pan begins on a sideways
 * move and fails on a vertical one, and a drum's the other way about; its
 * stops are laid from the notch along the axis, by `offset` from the
 * window's start.
 */
const AXES = {
  row: {
    pan: { activeOffsetX: [-6, 6], failOffsetY: [-14, 14] },
    dial: styles.dial,
    title: styles.titleColumn,
    name: styles.name,
    window: styles.window,
    row: styles.row,
    stop: styles.stop,
    tick: styles.tick,
    notch: styles.notch,
    offset: (by: number) => ({ left: by }),
  },
  column: {
    pan: { activeOffsetY: [-6, 6], failOffsetX: [-14, 14] },
    dial: styles.drum,
    title: styles.drumTitle,
    name: styles.drumName,
    window: styles.drumWindow,
    row: styles.drumRow,
    stop: styles.drumStop,
    tick: styles.drumTick,
    notch: styles.drumNotch,
    offset: (by: number) => ({ top: by }),
  },
} satisfies Record<
  Axis,
  {
    readonly pan: {
      readonly activeOffsetX?: [number, number];
      readonly activeOffsetY?: [number, number];
      readonly failOffsetX?: [number, number];
      readonly failOffsetY?: [number, number];
    };
    readonly dial: ViewStyle;
    readonly title: ViewStyle;
    readonly name: TextStyle;
    readonly window: ViewStyle;
    readonly row: ViewStyle;
    readonly stop: ViewStyle;
    readonly tick: ViewStyle;
    readonly notch: ViewStyle;
    readonly offset: (by: number) => ViewStyle;
  }
>;
