/**
 * The Sections list's number rail, on the list's right edge: a few hymn
 * numbers, faint, from the first to the last. A drag along it takes the
 * list to the hymn under the thumb (`markAt`, one equal band per hymn), and
 * a bubble beside the thumb shows that hymn's number and its topic. Each
 * topic the drag passes is a `rail-tick` (`crossings`), felt only; the
 * ticks keep the feel's floor, so a fast drag is a ratchet, not a buzz.
 *
 * The touch is a gesture handler's pan on the list's own view (`useRail`),
 * held to the rail's strip (`railStrip`), and it engages only on a hold:
 * the finger rests `HOLD` ms in the strip, then drags. Until then the touch
 * is the list's, so a tap in the strip reaches the row under it (a star,
 * `See all`) and a flick there scrolls the list as it does elsewhere. The
 * rail's drawing lets every touch through.
 *
 * The drag runs on the UI thread: the thumb and the bubble follow a shared
 * value, and the list scrolls from the gesture's worklet (`onMark`), once
 * for each hymn the thumb comes to. React draws again only for the bubble's
 * words and the ticks, once per hymn.
 *
 * Screen readers do not see the rail: it is hidden from them, and the
 * list's own topic rows (headings) and the home's tabs and `All at once`
 * are their way through the hymns.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type PanGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';

import { crossings, labelsOf, type Mark, markAt, railStrip } from './rail-marks';

/** The rail's width, from the screen's right edge. */
export const WIDTH = 20;

/** How long, in ms, a finger rests in the rail's strip before the rail takes it. */
export const HOLD = 250;

/** How many numbers the rail shows. */
const LABELS = 6;

const BUBBLE = 56;

/** A held rail: its gesture, for the list's view, and what its drawing follows. */
export interface RailHold {
  readonly gesture: PanGesture;
  /** The hymn under the thumb, by its place on the rail; -1 while the rail is not held. */
  readonly at: SharedValue<number>;
  /** The thumb's height on the rail. */
  readonly y: SharedValue<number>;
  /** The rail's height, as laid out. */
  readonly height: SharedValue<number>;
}

export function useRail({
  marks,
  top,
  bottom,
  quiet,
  felt,
  onMark,
}: {
  /** The hymns along the rail, in the list's order (`marksOf`). */
  readonly marks: ReadonlyArray<Mark>;
  /** The rail's ends, from the list's top and bottom. */
  readonly top: number;
  readonly bottom: number;
  /** Held `true` while the rail is: the pin gives no `section` cue of its own then. */
  readonly quiet: SharedValue<boolean>;
  /** The topic last felt, by its place: the rail's own, so the pin does not feel it again as the list lands. */
  readonly felt: SharedValue<number>;
  /** The hymn the thumb has come to, a worklet on the UI thread: the list shows it. */
  readonly onMark: (mark: Mark) => void;
}): RailHold {
  const cue = useCue();
  const at = useSharedValue(-1);
  const y = useSharedValue(0);
  const height = useSharedValue(0);
  // The marks live in a shared value, so the gesture's worklets carry no copy of them.
  const held = useSharedValue<ReadonlyArray<Mark>>(marks);
  useEffect(() => {
    held.value = marks;
  }, [held, marks]);
  const tick = (count: number) => {
    for (let k = 0; k < count; k += 1) cue(plain('rail-tick'));
  };
  const to = (touch: number) => {
    'worklet';
    const all = held.value;
    const now = markAt(touch - top, height.value, all.length);
    y.value = Math.min(height.value, Math.max(0, touch - top));
    const mark = all[now];
    // oxlint-disable-next-line effect/noNullish -- a worklet reads an array's place as it is.
    if (now === at.value || mark === undefined) return;
    const before = all[at.value];
    let ticks = 0;
    // oxlint-disable-next-line effect/noNullish -- the first hymn of a hold has none before it.
    if (before !== undefined) ticks = crossings(before.section, mark.section);
    at.value = now;
    felt.value = mark.section;
    onMark(mark);
    if (ticks > 0) scheduleOnRN(tick, ticks);
  };
  const gesture = usePanGesture({
    testID: 'rail',
    enabled: marks.length > 0,
    activateAfterLongPress: HOLD,
    hitSlop: railStrip(WIDTH, top, bottom),
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onActivate: ({ y: touch }) => {
      'worklet';
      quiet.value = true;
      to(touch);
    },
    onUpdate: ({ y: touch }) => {
      'worklet';
      if (at.value >= 0) to(touch);
    },
    onFinalize: () => {
      'worklet';
      at.value = -1;
      quiet.value = false;
    },
  });
  return { gesture, at, y, height };
}

/** The rail's drawing: its numbers, and while held its thumb and the bubble beside it. Every touch passes through it. */
export function Rail({
  hold,
  marks,
  sections,
  top,
  bottom,
}: {
  readonly hold: RailHold;
  readonly marks: ReadonlyArray<Mark>;
  /** Each topic's name, by its place among the topics. */
  readonly sections: ReadonlyArray<string>;
  readonly top: number;
  readonly bottom: number;
}) {
  const accent = useAccent();
  const [height, setHeight] = useState(0);
  const band = height / Math.max(1, marks.length);
  const thumb = useAnimatedStyle(() => ({
    opacity: Math.min(1, hold.at.value + 1),
    transform: [{ translateY: hold.y.value - THUMB / 2 }],
  }));
  return (
    <>
      <View
        testID="rail"
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => {
          const laid = event.nativeEvent.layout.height;
          hold.height.value = laid;
          setHeight(laid);
        }}
        style={[styles.rail, { top, bottom }]}
      >
        {height > 0 &&
          labelsOf(marks.length, LABELS).map((index) => (
            <Text key={index} style={[styles.label, { top: (index + 0.5) * band - LABEL / 2 }]}>
              {marks[index]?.number}
            </Text>
          ))}
        <Animated.View style={[styles.thumb, { backgroundColor: accent }, thumb]} />
      </View>
      <Bubble hold={hold} marks={marks} sections={sections} top={top} />
    </>
  );
}

/** The bubble beside the thumb: the hymn under it, drawn again only when that hymn changes. */
function Bubble({
  hold,
  marks,
  sections,
  top,
}: {
  readonly hold: RailHold;
  readonly marks: ReadonlyArray<Mark>;
  readonly sections: ReadonlyArray<string>;
  readonly top: number;
}) {
  const accent = useAccent();
  const [shown, setShown] = useState(-1);
  useAnimatedReaction(
    () => hold.at.value,
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
  );
  const place = useAnimatedStyle(() => ({
    opacity: Math.min(1, hold.at.value + 1),
    transform: [{ translateY: hold.y.value - BUBBLE / 2 }],
  }));
  const mark = marks[shown];
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.bubble, { top }, place]}
    >
      <Text style={[styles.number, { color: accent }]}>{mark?.number}</Text>
      <Text style={styles.section} numberOfLines={1}>
        {sections[mark?.section ?? 0]}
      </Text>
    </Animated.View>
  );
}

const LABEL = 12;
const THUMB = 10;

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: 0, width: WIDTH },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: LABEL,
    fontSize: 10,
    lineHeight: LABEL,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    color: color.muted,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    left: (WIDTH - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
  bubble: {
    position: 'absolute',
    right: WIDTH + 12,
    maxWidth: 220,
    minHeight: BUBBLE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    backgroundColor: color.panel,
    justifyContent: 'center',
  },
  number: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  section: { fontSize: 13, color: color.muted },
});
