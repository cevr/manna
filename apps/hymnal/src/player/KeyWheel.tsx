/**
 * The key button's wheel, drawn while a hold keeps it open (`wheel.ts`):
 * its items fan up and to the right of the origin, each a pill at least 44
 * points tall. The item under the finger draws on the button's fill under
 * its ink (`button`, `onButton`) and grows; the others draw on the panel
 * under the ink, in the panel's edge. A small dot marks the origin. The
 * wheel takes no touch (the key button's own gesture keeps the finger) and
 * is hidden from VoiceOver, which reaches each item by the key button's
 * actions instead. It grows in from its origin, or with Reduce Motion
 * appears at its size.
 */

import { Match, Option } from 'effect';
import { createContext, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { color, useButton, useOnButton } from '~/color';
import { available } from '~/tuner/native';

import { useReduceMotion } from './motion';
import { TunerMark } from './TunerMark';
import { type Item, placeOf, type Point } from './wheel';

/** Whether the device has the tuner's ear, so the wheel offers the Tuner: the platform's, or a test's. */
export const Ear = createContext<boolean>(available);

/** Each item's word on the wheel. */
export const WORDS: Readonly<Record<Item, string>> = {
  tuner: 'Tuner',
  keyDown: 'Key ♭',
  keyUp: 'Key ♯',
  reset: 'Reset',
  chords: 'Chords off',
};

/** The wheel open: its origin, its items and the one under the finger. */
export interface Shown {
  readonly origin: Point;
  readonly items: ReadonlyArray<Item>;
  readonly over: Option.Option<Item>;
}

/** An item's box, centred on its place: wide enough for the longest word. */
const BOX = { width: 120, height: 44 } as const;

/** How much the item under the finger grows. */
const GROWN = 1.15;

/** The wheel's grow-in from its origin: 160 ms on the strong ease-out. */
const GROW = { duration: 160, easing: Easing.bezier(0.23, 1, 0.32, 1) };

/** The wheel `shown`, its origin `at` from the view it lies in, as an origin in that view. */
export function KeyWheel({ shown, at }: { readonly shown: Shown; readonly at: Point }) {
  const reduced = useReduceMotion();
  const grow = useSharedValue(Number(reduced));
  useEffect(() => {
    grow.value = withTiming(1, { ...GROW, reduceMotion: ReduceMotion.Never });
  }, []);
  const growing = useAnimatedStyle(() => ({
    opacity: grow.value,
    transform: [{ scale: 0.6 + 0.4 * grow.value }],
  }));
  const origin = { x: at.x + shown.origin.x, y: at.y + shown.origin.y };
  return (
    <View
      testID="key-wheel"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <View style={[styles.hub, { left: origin.x - HUB / 2, top: origin.y - HUB / 2 }]} />
      {shown.items.map((item) => {
        const place = placeOf(origin, item);
        return (
          <Animated.View
            key={item}
            style={[
              styles.box,
              { left: place.x - BOX.width / 2, top: place.y - BOX.height / 2 },
              growing,
            ]}
          >
            <Pill item={item} over={Option.contains(shown.over, item)} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** One item: on the button's fill while the finger is over it, else on the panel. */
function Pill({ item, over }: { readonly item: Item; readonly over: boolean }) {
  const button = useButton();
  const onButton = useOnButton();
  const ink = Match.value(over).pipe(
    Match.when(true, () => onButton),
    Match.orElse(() => color.ink),
  );
  return (
    <View
      testID={`key-wheel-${item}`}
      aria-selected={over}
      style={[
        styles.pill,
        Match.value(over).pipe(
          Match.when(true, () => ({
            backgroundColor: button,
            borderColor: button,
            transform: [{ scale: GROWN }],
          })),
          Match.orElse(() => styles.rest),
        ),
      ]}
    >
      {item === 'tuner' && <TunerMark tint={ink} />}
      <Text style={[styles.word, { color: ink }]} numberOfLines={1}>
        {WORDS[item]}
      </Text>
    </View>
  );
}

/** The origin's dot. */
const HUB = 8;

const styles = StyleSheet.create({
  hub: {
    position: 'absolute',
    width: HUB,
    height: HUB,
    borderRadius: HUB / 2,
    backgroundColor: color.edge,
  },
  box: {
    position: 'absolute',
    width: BOX.width,
    height: BOX.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    minWidth: 62,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  rest: { backgroundColor: color.panel, borderColor: color.edge },
  word: { fontSize: 15, fontWeight: '600' },
});
