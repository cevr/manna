/**
 * The key button's wheel, drawn while a hold keeps it open (`wheel.ts`) and
 * on through its exit (`WheelDrawn`, closing). Its items are pills on the Arc,
 * up and to the right of the key button, which is the wheel's centre: there
 * is no mark of the origin. The page under them dims (`key-wheel-backdrop`,
 * the night at `BACKDROP.opacity`) and the bar's other controls fade with it
 * (`dim`, which the bar reads). The item under the finger lifts: it draws
 * on the button's fill under its ink (`button`, `onButton`), grows to `LIFT`
 * on a deeper shadow, and a dotted ray in the button's role runs to it from
 * the key button's centre. The others draw on the panel under the ink, in
 * the panel's edge.
 *
 * The motion is `wheelmotion.ts`'s, read off one clock: the items spring
 * out of the key button along their rays as the wheel opens, and at a
 * release or a cancel go back into it from where they stood, the picked
 * one last; the clock runs on from the release, so no frame mixes the exit
 * with the enter's time. With Reduce Motion they fade in and out at their
 * slots. The wheel takes no touch (the key button's own gesture keeps the
 * finger) and is hidden from VoiceOver, which reaches each item by the key
 * button's actions instead.
 */

import { Match, Option } from 'effect';
import { createContext, useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color, useButton, useOnButton } from '~/color';
import { available } from '~/tuner/native';

import { TunerMark } from './TunerMark';
import { type Item, ITEM, LIFT, type Point, slotOf } from './wheel';
import {
  backdropAt,
  enterEnd,
  enterPose,
  exitEnd,
  exitPose,
  type Pose,
  travelAt,
} from './wheelmotion';

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

/** The wheel as the bar draws it: open, or closing after a release or a cancel, with the item picked if one was. */
export interface WheelDrawn {
  readonly shown: Shown;
  readonly closing: boolean;
  readonly picked: Option.Option<Item>;
}

/**
 * The wheel drawn after the key button tells `shown` (none once it shut)
 * and `picked`: open while shown; on shutting, the wheel that was open,
 * closing; nothing when none was drawn.
 */
export const drawnAfter = (
  was: Option.Option<WheelDrawn>,
  shown: Option.Option<Shown>,
  picked: Option.Option<Item>,
): Option.Option<WheelDrawn> =>
  Option.match(shown, {
    onSome: (open) => Option.some({ shown: open, closing: false, picked: Option.none() }),
    onNone: () => Option.map(was, (drawn) => ({ ...drawn, closing: true, picked })),
  });

/** The backdrop's colour: the night at its deepest, by day and by night. */
const NIGHT = '#02080e';

/** How far a word may grow with the reader's text size and stay on one line in its pill. */
const MOST_WORD_SCALE = 1.15;

/** A linear run of the clock over `duration` ms, whatever the device's Reduce Motion: the poses carry it. */
const run = (duration: number) => ({
  duration,
  easing: Easing.linear,
  reduceMotion: ReduceMotion.Never,
});

/** The pose `item` stands in on the clock: entering until the release (`released` below 0), then leaving from where it stood. */
const poseOn = (
  item: Item,
  items: ReadonlyArray<Item>,
  ms: number,
  released: number,
  reduced: boolean,
  // oxlint-disable-next-line effect/noNullish -- a worklet reads the picked item as a plain value: an Option does not cross to the UI thread.
  picked: Item | null,
): Pose => {
  'worklet';
  if (released < 0) return enterPose(item, items, ms, reduced);
  const was = enterPose(item, items, released, reduced);
  const pose = exitPose(
    item,
    items,
    travelAt(item, items, released),
    ms - released,
    reduced,
    picked,
  );
  return { ...pose, opacity: Math.min(pose.opacity, was.opacity) };
};

/**
 * The wheel `drawn`, its origin `at` in the view it lies in. It writes the
 * backdrop's opacity to `dim` for the bar's controls to fade by, and calls
 * `onClosed` once its exit has run.
 */
export function KeyWheel({
  drawn,
  at,
  dim,
  reduced,
  onClosed,
}: {
  readonly drawn: WheelDrawn;
  readonly at: Point;
  readonly dim: SharedValue<number>;
  /** Whether Reduce Motion is on, as the bar read it before the wheel opened. */
  readonly reduced: boolean;
  readonly onClosed: () => void;
}) {
  const { items, over } = drawn.shown;
  const picked = Option.getOrNull(drawn.picked);
  const lit = Match.value(drawn.closing).pipe(
    Match.when(true, () => drawn.picked),
    Match.orElse(() => over),
  );
  const clock = useSharedValue(0);
  const released = useSharedValue(-1);
  useEffect(() => {
    const end = enterEnd(items, reduced);
    clock.value = withTiming(end, run(end));
    return () => {
      dim.value = 0;
    };
  }, []);
  useEffect(() => {
    if (!drawn.closing) return;
    const from = clock.value;
    const end = exitEnd(items, reduced);
    released.value = from;
    clock.value = withTiming(from + end, run(end), (finished) => {
      'worklet';
      if (finished) scheduleOnRN(onClosed);
    });
  }, [drawn.closing]);
  useAnimatedReaction(
    () => {
      if (released.value < 0) return backdropAt('enter', clock.value, reduced);
      return backdropAt('exit', clock.value - released.value, reduced);
    },
    (now) => {
      dim.value = now;
    },
  );
  const { height } = useWindowDimensions();
  const backdrop = useAnimatedStyle(() => ({ opacity: dim.value }));
  return (
    <View
      testID="key-wheel"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Animated.View
        testID="key-wheel-backdrop"
        pointerEvents="none"
        style={[styles.backdrop, { top: -height, height }, backdrop]}
      />
      {Option.match(lit, {
        onNone: () => <></>,
        onSome: (item) => (
          <Ray
            item={item}
            items={items}
            at={at}
            clock={clock}
            released={released}
            reduced={reduced}
            picked={picked}
          />
        ),
      })}
      {items.map((item) => (
        <Place
          key={item}
          item={item}
          items={items}
          at={at}
          clock={clock}
          released={released}
          reduced={reduced}
          picked={picked}
          lit={Option.contains(lit, item)}
        />
      ))}
    </View>
  );
}

interface Clocked {
  readonly item: Item;
  readonly items: ReadonlyArray<Item>;
  readonly at: Point;
  readonly clock: SharedValue<number>;
  readonly released: SharedValue<number>;
  readonly reduced: boolean;
  // oxlint-disable-next-line effect/noNullish -- a worklet reads the picked item as a plain value: an Option does not cross to the UI thread.
  readonly picked: Item | null;
}

/** One item's box at its pose on the clock, lifted while lit. */
function Place({
  item,
  items,
  at,
  clock,
  released,
  reduced,
  picked,
  lit,
}: Clocked & { readonly lit: boolean }) {
  const grown = (lit && LIFT) || 1;
  const posed = useAnimatedStyle(() => {
    const pose = poseOn(item, items, clock.value, released.value, reduced, picked);
    return {
      opacity: pose.opacity,
      transform: [{ translateX: pose.x }, { translateY: pose.y }, { scale: pose.scale * grown }],
    };
  });
  return (
    <Animated.View
      testID={`key-wheel-place-${item}`}
      style={[
        styles.box,
        { left: at.x - ITEM.width / 2, top: at.y - ITEM.height / 2, zIndex: Number(lit) },
        posed,
      ]}
    >
      <Pill item={item} lit={lit} />
    </Animated.View>
  );
}

/** The dotted ray from the key button's centre to the lit item, as far as the item stands. */
function Ray({ item, items, at, clock, released, reduced, picked }: Clocked) {
  const button = useButton();
  const slot = slotOf(item);
  const angle = Math.atan2(slot.y, slot.x);
  const posed = useAnimatedStyle(() => {
    const pose = poseOn(item, items, clock.value, released.value, reduced, picked);
    const length = Math.hypot(pose.x, pose.y);
    return {
      width: length,
      opacity: RAY_SEEN * pose.opacity,
      transform: [
        { translateX: pose.x / 2 - length / 2 },
        { translateY: pose.y / 2 - RAY / 2 },
        { rotate: `${angle}rad` },
      ],
    };
  });
  return (
    <Animated.View
      testID="key-wheel-ray"
      style={[styles.ray, { left: at.x, top: at.y, borderColor: button }, posed]}
    />
  );
}

/** The ray's thickness, in points. */
const RAY = 2;

/** How strongly the ray is seen: the button's role at 45 %. */
const RAY_SEEN = 0.45;

/** One item: on the button's fill while lit, else on the panel. */
function Pill({ item, lit }: { readonly item: Item; readonly lit: boolean }) {
  const button = useButton();
  const onButton = useOnButton();
  const ink = Match.value(lit).pipe(
    Match.when(true, () => onButton),
    Match.orElse(() => color.ink),
  );
  return (
    <View
      testID={`key-wheel-${item}`}
      aria-selected={lit}
      style={[
        styles.pill,
        Match.value(lit).pipe(
          Match.when(true, () => [styles.lit, { backgroundColor: button, borderColor: button }]),
          Match.orElse(() => styles.rest),
        ),
      ]}
    >
      {item === 'tuner' && <TunerMark tint={ink} />}
      <Text
        style={[styles.word, { color: ink }]}
        numberOfLines={1}
        maxFontSizeMultiplier={MOST_WORD_SCALE}
      >
        {WORDS[item]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, right: 0, backgroundColor: NIGHT },
  ray: { position: 'absolute', height: RAY, borderTopWidth: RAY, borderStyle: 'dotted' },
  box: {
    position: 'absolute',
    width: ITEM.width,
    height: ITEM.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: ITEM.width,
    height: ITEM.height,
    borderRadius: ITEM.height / 2,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: NIGHT,
    shadowOpacity: 0.45,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  lit: { shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  rest: { backgroundColor: color.panel, borderColor: color.edge },
  word: { fontSize: 15, fontWeight: '600' },
});
