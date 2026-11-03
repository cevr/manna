import { Array as Arr, Match, Option } from 'effect';
import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
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

type Runs =
  | { readonly axis?: 'row'; readonly title: string }
  | { readonly axis: 'column'; readonly title?: never };

export type DialProps<A> = Runs & {
  readonly dial: DialName;
  readonly label: string;
  readonly stops: ReadonlyArray<A>;
  readonly index: number;
  readonly wrap: boolean;
  readonly said: string;
  readonly drawStop: (stop: A, current: boolean) => ReactNode;
  readonly onTurn: (n: number) => void;
  readonly onReset?: () => void;
  readonly onTouch?: () => void;
  readonly resets?: number;
  readonly testID: string;
};

const TITLE = 58;

export const MOST_SCALE = 1.3;

export const RESET_TURN = 300;

const FOLLOW_TURN = 240;

const FADE = 3.6;

const NOTCH = 140;

const DRUM_WINDOW = 3 * DETENT;

const shifted = (axis: Axis, by: number) => {
  'worklet';
  if (axis === 'column') return { translateY: by };
  return { translateX: by };
};

const stretched = (axis: Axis, by: number) => {
  'worklet';
  if (axis === 'column') return { scaleX: by };
  return { scaleY: by };
};

const ROW_TITLES = ['KEY', 'CAPO', 'SIZE', 'PLACE', 'TEMPO'] as const;

function Dial<A>(props: DialProps<A>) {
  const {
    dial,
    label,
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
  const driven = useSharedValue(false);
  const glides = useSharedValue(0);
  const walled = useSharedValue(false);
  const dragged = useSharedValue(false);
  const following = useSharedValue(false);
  const aim = useSharedValue(index * DETENT);
  const stoppedFollow = useSharedValue(false);
  const stretch = useSharedValue(1);
  const [span, setSpan] = useState(0);
  const live = useRef(props);
  live.current = props;
  const homed = useRef(resets);
  const told = useRef<Array<number>>([]);

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
    const back = told.current.indexOf(index);
    const echo = !byReset && back >= 0;
    told.current = (echo && told.current.slice(back + 1)) || [];
    const to = placeOf(detents, place.value, index);
    aim.value = to;
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
      if (following.value) return;
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
    live.current.onTurn(
      Match.value(wrap).pipe(
        Match.when(true, () => ownDetent(detents, index + by)),
        Match.orElse(() => index + by),
      ),
    );
  };

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
          {props.axis !== 'column' && <RowName title={props.title} />}
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

function RowName({ title }: { readonly title: string }) {
  return (
    <View style={styles.titleColumn} aria-hidden>
      <View style={styles.sizer}>
        {ROW_TITLES.map((name) => (
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
        style={[styles.title, styles.name]}
        numberOfLines={1}
        maxFontSizeMultiplier={MOST_SCALE}
      >
        {title}
      </Text>
    </View>
  );
}

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

const AXES = {
  row: {
    pan: { activeOffsetX: [-6, 6], failOffsetY: [-14, 14] },
    dial: styles.dial,
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
    readonly window: ViewStyle;
    readonly row: ViewStyle;
    readonly stop: ViewStyle;
    readonly tick: ViewStyle;
    readonly notch: ViewStyle;
    readonly offset: (by: number) => ViewStyle;
  }
>;
