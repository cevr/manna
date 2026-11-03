import type * as Chord from '@manna/hymnal/chord';
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
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color } from '~/color';
import { GuitarHead } from '~/reader/GuitarHead';

import type { BoundThumb } from './Dials';
import { useReduceMotion } from './motion';
import { type Face, faceOf, hintOf, saidOf, ThumbEvent } from './thumb';

export const HOLD = 450;

export const PRESSED_IN = 0.9;

const SPRING_OUT = { stiffness: 322, damping: 25.1, mass: 1, velocity: 3.5 };

const LET_GO = { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) };

export function KeyButton({
  thumb,
  onLayout,
}: {
  readonly thumb: BoundThumb;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { printed, state, send } = thumb;
  const reduced = useReduceMotion();
  const scale = useSharedValue(1);
  const held = useRef(false);
  const face = Option.map(printed, (key: Chord.Key) => faceOf(key, state));
  const said = Option.match(printed, {
    onNone: () => (state.chords && 'No chords') || 'Chords off',
    onSome: (key) => saidOf(key, state),
  });
  const hint = hintOf(printed, state);
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
    cancelAnimation(scale);
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
      accessibilityHint={Option.getOrUndefined(hint)}
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
