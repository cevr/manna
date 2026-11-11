/**
 * The bar's key button, at its left end, for the page's hymn. With chords
 * on it shows the guitar's head and the key: a small "KEY" over the
 * sounding key, or "CAPO n" over the key the chords are played in. A tap
 * opens the key and capo dials above the bar, and closes them. A hold
 * (`HOLD`, 350 ms) with chords on, on a hymn with a printed key, opens the
 * wheel around the press (`wheel.ts`, drawn by the bar as `KeyWheel`): the
 * finger slides to the Tuner (with the ear), Key ♭, Key ♯, Reset or Chords
 * off and lets go to do it, once; a tick marks each item it enters. Otherwise
 * a hold turns chords on or off, and no tap follows it. With chords off
 * it is the guitar's head alone, dim: the chords switch, on every hymn's
 * page, and a tap or a hold turns chords on and opens nothing. Its hint says
 * what the next tap does (`hintOf`): turns chords on, opens the dials or
 * closes them. VoiceOver reaches each of the wheel's items by the button's
 * actions, and turns chords on or off by its `chords` action.
 *
 * The hold is the gesture handler's pan, which takes the touch only once
 * the finger has stayed within `SLOP` points for `HOLD` ms, so a swipe up
 * still opens the sheet; once it takes, the bar's swipe and the page's
 * gestures lose the touch, and the slide is the wheel's.
 *
 * The button presses in under a finger, as a mechanical switch does: it
 * shrinks steadily to 0.90 of its size over the hold, as card J does, and
 * at the hold it springs back out past its size and settles (a spring
 * of 0.35 s and bounce 0.3, started at the speed a released spring has). A
 * tap lets it back out in 200 ms with no overshoot. With Reduce Motion on
 * the spring-out has no overshoot either. The scale is the press: the
 * button's frame and fill are the same with the dials open or closed.
 */

import type * as Chord from '@manna/hymnal/chord';
import { Match, Option } from 'effect';
import { useRouter } from 'one';
import { useRef } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { GuitarHead } from '~/reader/GuitarHead';

import type { BoundThumb } from './Dials';
import type { Shown } from './KeyWheel';
import { useReduceMotion } from './motion';
import { type Face, faceOf, hintOf, saidOf, ThumbEvent } from './thumb';
import { HOLD, idle, type Item, Out, SLOP, step, Wheel, WheelEvent } from './wheel';

/** The least distance of the wheel's origin from the screen's left edge, so the Tuner, at 98°, is not clipped. */
export const WHEEL_LEFT = 84;

/** The button's height: the wheel's origin is held no lower than its middle. */
const HEIGHT = 44;

/** How far the button presses in by the end of a hold: card J's. */
export const PRESSED_IN = 0.9;

/**
 * The spring-out at the toggle: 0.35 s, bounce 0.3 (stiffness `(2π/0.35)²`,
 * damping `4π·0.7/0.35`), from the press's depth at 3.5 a second, so it
 * overshoots its size by about 3% within 150 ms and rests by 300 ms.
 */
const SPRING_OUT = { stiffness: 322, damping: 25.1, mass: 1, velocity: 3.5 };

/** A tap's release, and Reduce Motion's spring-out: 200 ms on the strong ease-out. */
const LET_GO = { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) };

/** The wheel's items VoiceOver reaches as the key button's actions, in the wheel's order. */
const ACTIONS: ReadonlyArray<{ readonly name: Item; readonly label: string }> = [
  { name: 'tuner', label: 'Open tuner' },
  { name: 'keyDown', label: 'Key down' },
  { name: 'keyUp', label: 'Key up' },
  { name: 'reset', label: 'Reset key' },
];

/** The key button's actions: the wheel's items while a hold offers the wheel (the Tuner with the ear), and the chords switch. */
export const actionsOf = (offered: boolean, ear: boolean, chords: boolean) => [
  ...ACTIONS.filter(({ name }) => offered && (name !== 'tuner' || ear)),
  { name: 'chords', label: (chords && 'Turn chords off') || 'Turn chords on' },
];

/** The wheel open in `wheel`, as the bar draws it; none while it is shut. */
const shownOf = (wheel: Wheel): Option.Option<Shown> =>
  Wheel.$match(wheel, {
    Idle: () => Option.none(),
    Pressing: () => Option.none(),
    Open: ({ origin, items, over }) => Option.some({ origin, items, over }),
  });

/** Whether VoiceOver's action `name` is one of the wheel's items. */
const isItem = (name: string): name is Item => ACTIONS.some((action) => action.name === name);

export function KeyButton({
  thumb,
  onLayout,
  ear = false,
  screenX = 0,
  onWheel = () => {},
}: {
  readonly thumb: BoundThumb;
  /** The button laid out in the bar: the dials open out of its centre. */
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  /** Whether the device has the tuner's ear: the wheel offers the Tuner only then. */
  readonly ear?: boolean;
  /** The button's left edge from the screen's, in points: the wheel's origin keeps `WHEEL_LEFT` from it. */
  readonly screenX?: number;
  /** The wheel opened, its finger moved, or it shut: the bar draws it (`KeyWheel`). */
  readonly onWheel?: (shown: Option.Option<Shown>) => void;
}) {
  const { printed, state, send } = thumb;
  const reduced = useReduceMotion();
  const router = useRouter();
  const cue = useCue();
  const scale = useSharedValue(1);
  const held = useRef(false);
  const wheel = useRef<Wheel>(idle);
  const landed = useRef(0);
  const now = useRef({ thumb, ear, screenX, onWheel });
  now.current = { thumb, ear, screenX, onWheel };
  const offered = state.chords && Option.isSome(printed);
  const face = Option.map(printed, (key: Chord.Key) => faceOf(key, state));
  const said = Option.match(printed, {
    onNone: () => (state.chords && 'No chords') || 'Chords off',
    onSome: (key) => saidOf(key, state),
  });
  const hint = hintOf(printed, state);
  const springOut = () => {
    held.current = true;
    cancelAnimation(scale);
    scale.value = Match.value(reduced).pipe(
      Match.when(true, () => withTiming(1, { ...LET_GO, reduceMotion: ReduceMotion.Never })),
      Match.orElse(() => withSpring(1, { ...SPRING_OUT, reduceMotion: ReduceMotion.Never })),
    );
  };
  const turn = (by: number) => now.current.thumb.send(ThumbEvent.StepKey({ by }));
  const pick = (item: Item) => {
    const bound = now.current.thumb;
    Match.value(item).pipe(
      Match.when('tuner', () => {
        bound.send(ThumbEvent.Tune());
        router.push('/tuner');
      }),
      Match.when('keyDown', () => turn(-1)),
      Match.when('keyUp', () => turn(1)),
      Match.when('reset', () => bound.send(ThumbEvent.Reset())),
      Match.when('chords', () => bound.send(ThumbEvent.Hold())),
      Match.exhaustive,
    );
  };
  const run = (out: Out) =>
    Out.$match(out, {
      Tap: () => now.current.thumb.send(ThumbEvent.Tap()),
      Hold: () => {
        now.current.thumb.send(ThumbEvent.Hold());
        springOut();
      },
      Enter: () => cue(plain('choose')),
      Pick: ({ item }) => pick(item),
    });
  const feed = (event: WheelEvent) => {
    const was = wheel.current;
    const next = step(was, event);
    wheel.current = next.wheel;
    if (!Wheel.$is('Open')(was) && Wheel.$is('Open')(next.wheel)) springOut();
    for (const out of next.outs) run(out);
    if (Wheel.$is('Open')(was) || Wheel.$is('Open')(next.wheel))
      now.current.onWheel(shownOf(next.wheel));
  };
  // oxlint-disable-next-line effect/noGlobals -- the touch path's clock: a sync read for the hold's start and its tick, with no Effect run per touch event.
  const clock = () => performance.now();
  const setup = () => {
    const bound = now.current.thumb;
    return {
      wheel: bound.state.chords && Option.isSome(bound.printed),
      ear: now.current.ear,
      left: WHEEL_LEFT - now.current.screenX,
      bottom: HEIGHT / 2,
    };
  };
  const hold = usePanGesture({
    testID: 'key-hold',
    runOnJS: true,
    maxPointers: 1,
    activateAfterLongPress: HOLD,
    failOffsetX: [-SLOP, SLOP],
    failOffsetY: [-SLOP, SLOP],
    shouldCancelWhenOutside: false,
    onBegin: ({ x, y }) => {
      landed.current = clock();
      feed(WheelEvent.Down({ x, y, t: landed.current, setup: setup() }));
    },
    onActivate: () => feed(WheelEvent.Tick({ t: Math.max(clock(), landed.current + HOLD) })),
    onUpdate: ({ x, y }) => feed(WheelEvent.Move({ x, y, t: clock() })),
    onDeactivate: ({ canceled }) =>
      feed(
        Match.value(canceled).pipe(
          Match.when(true, () => WheelEvent.Cancel()),
          Match.orElse(() => WheelEvent.Up({ t: clock() })),
        ),
      ),
    onFinalize: ({ canceled }) => {
      if (canceled) feed(WheelEvent.Cancel());
    },
  });
  const tap = () => {
    const t = clock();
    if (!Wheel.$is('Pressing')(wheel.current))
      feed(WheelEvent.Down({ x: 0, y: 0, t, setup: setup() }));
    feed(WheelEvent.Up({ t }));
  };
  const act = ({ nativeEvent }: AccessibilityActionEvent) => {
    const name = nativeEvent.actionName;
    if (name === 'chords') send(ThumbEvent.Hold());
    else if (isItem(name)) pick(name);
  };
  const pressIn = () => {
    held.current = false;
    scale.value = withTiming(PRESSED_IN, {
      duration: HOLD,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
  };
  const pressOut = () => {
    if (held.current) return;
    scale.value = withTiming(1, { ...LET_GO, reduceMotion: ReduceMotion.Never });
  };
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <GestureDetector gesture={hold}>
      <Pressable
        role="button"
        aria-label="Key"
        aria-valuetext={said}
        aria-expanded={state.open}
        accessibilityHint={Option.getOrUndefined(hint)}
        accessibilityActions={actionsOf(offered, ear, state.chords)}
        onAccessibilityAction={act}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={tap}
        onLongPress={() => {}}
        delayLongPress={HOLD}
        onLayout={onLayout}
        testID="key-button"
      >
        <Animated.View
          testID="key-face"
          style={[
            styles.button,
            Match.value(state.chords).pipe(
              Match.when(true, () => styles.lit),
              Match.orElse(() => styles.off),
            ),
            pressed,
          ]}
        >
          <View style={!state.chords && styles.dim}>
            <GuitarHead on={state.chords} />
          </View>
          {Option.match(face, {
            onNone: () => [],
            onSome: (shown) => <Words face={shown} />,
          })}
        </Animated.View>
      </Pressable>
    </GestureDetector>
  );
}

/** The small word over the key; nothing with chords off. */
function Words({ face }: { readonly face: Face }) {
  if (face._tag === 'Off') return [];
  return (
    <View style={styles.words}>
      <Text style={styles.over}>{face.over}</Text>
      <Text style={styles.key}>{face.key}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    paddingLeft: 6,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  lit: { backgroundColor: color.pill },
  off: {
    paddingRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  dim: { opacity: 0.5 },
  words: { alignItems: 'flex-start' },
  over: {
    fontSize: 9.5,
    lineHeight: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: color.onPill,
  },
  key: { fontSize: 15, lineHeight: 17, fontWeight: '700', color: color.onPill },
});
