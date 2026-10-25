/**
 * The bar's key button, at its left end, for the page's hymn. With chords
 * on it shows the guitar's head and the key: a small "KEY" over the
 * sounding key, or "CAPO n" over the key the chords are played in. A tap
 * opens the key and capo dials above the bar, and closes them; a hold
 * (450 ms) turns chords on or off, and no tap follows it. With chords off
 * it is the guitar's head alone, dim, and a tap opens the key dial alone.
 * VoiceOver turns chords on or off by the button's action.
 *
 * The button presses in under a finger, as a mechanical switch does: it
 * shrinks steadily to 0.90 of its size over the hold, as card J does, and
 * at the toggle it springs back out past its size and settles (a spring
 * of 0.35 s and bounce 0.3, started at the speed a released spring has). A
 * tap lets it back out in 200 ms with no overshoot. With Reduce Motion on
 * the spring-out has no overshoot either. The scale is the press: the
 * button's frame and fill are the same with the dials open or closed.
 */

import type * as Chord from '@bible/hymnal/chord';
import { Match, Option } from 'effect';
import { useRef } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color } from '~/color';
import { GuitarHead } from '~/reader/GuitarHead';

import type { BoundThumb } from './Dials';
import { type Face, faceOf, saidOf, ThumbEvent } from './thumb';

/** How long a press is held before it turns chords on or off. */
export const HOLD = 450;

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

export function KeyButton({
  thumb,
  onLayout,
}: {
  readonly thumb: BoundThumb;
  /** The button laid out in the bar: the dials open out of its centre. */
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { printed, state, send } = thumb;
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  // Whether the press under way turned chords on or off: its release then lets nothing go.
  const held = useRef(false);
  const face = Option.map(printed, (key: Chord.Key) => faceOf(key, state));
  const said = Option.match(printed, {
    onNone: () => (state.chords && 'No chords') || 'Chords off',
    onSome: (key) => saidOf(key, state),
  });
  const act = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'chords') send(ThumbEvent.Hold());
  };
  const pressIn = () => {
    held.current = false;
    scale.value = withTiming(PRESSED_IN, {
      duration: HOLD,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
  };
  const toggle = () => {
    held.current = true;
    send(ThumbEvent.Hold());
    scale.value = Match.value(reduced).pipe(
      Match.when(true, () => withTiming(1, { ...LET_GO, reduceMotion: ReduceMotion.Never })),
      Match.orElse(() => withSpring(1, { ...SPRING_OUT, reduceMotion: ReduceMotion.Never })),
    );
  };
  const pressOut = () => {
    if (held.current) return;
    scale.value = withTiming(1, { ...LET_GO, reduceMotion: ReduceMotion.Never });
  };
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      role="button"
      aria-label="Key"
      aria-valuetext={said}
      aria-expanded={state.open}
      accessibilityActions={[
        { name: 'chords', label: (state.chords && 'Turn chords off') || 'Turn chords on' },
      ]}
      onAccessibilityAction={act}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => send(ThumbEvent.Tap())}
      onLongPress={toggle}
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
  lit: { backgroundColor: color.soft },
  off: {
    paddingRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  dim: { opacity: 0.5 },
  words: { alignItems: 'flex-start' },
  over: { fontSize: 9.5, lineHeight: 11, fontWeight: '600', letterSpacing: 0.8, color: color.ink },
  key: { fontSize: 15, lineHeight: 17, fontWeight: '700', color: color.ink },
});
