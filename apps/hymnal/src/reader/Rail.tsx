/**
 * The Sections list's number rail, in its own gutter at the list's right
 * edge (`GUTTER`): a few hymn numbers, faint, from the first to the last.
 * The rows end before the gutter, so a number never lies over a row and a
 * row's controls never lie under the rail's touch.
 *
 * The gutter is the rail's touch: a gesture handler's pan on the rail's own
 * view (`useRail`), taken at once. A tap there takes the list to the hymn
 * under it, and a drag along it takes the list to the hymn under the thumb
 * (`markAt`, one equal band per hymn). A bubble beside the thumb shows that
 * hymn's number and its topic. Each topic the drag passes is a `rail-tick`
 * (`crossings`), felt only; the ticks keep the feel's floor, so a fast drag
 * is a ratchet, not a buzz. A flick that starts left of the gutter is the
 * list's.
 *
 * The rail's top follows the header's bottom while the list is pulled past
 * its top (`railShift`), so the header's own controls never lie under it.
 * Each label sits at its band's middle as a percent of the rail (`labelAt`),
 * so the labels move with the rail's top and need no draw of their own. A
 * label's box is as tall as its line at the reader's text size, its type
 * capped at `LABEL_SCALE` (`labelHeight`), so a larger text size never cuts
 * its digits and three digits still fit the gutter.
 *
 * The drag runs on the UI thread: the thumb and the bubble follow shared
 * values, and the list scrolls from the gesture's worklet (`onMark`), once
 * for each hymn the thumb comes to. React draws again only for the bubble's
 * words and the ticks, once per hymn.
 *
 * Screen readers do not see the rail: it is hidden from them, and the
 * list's own topic rows (headings) and the home's tabs and `All at once`
 * are their way through the hymns.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, type PanGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';

import {
  crossings,
  GUTTER,
  LABEL_LINE,
  LABEL_SCALE,
  LABEL_SIZE,
  labelAt,
  labelHeight,
  labelsOf,
  type Mark,
  markAt,
  railShift,
} from './rail-marks';

/** How many numbers the rail shows. */
const LABELS = 6;

const BUBBLE = 56;

/** A rail: its gesture, for the rail's own view, and what its drawing follows. */
export interface RailHold {
  readonly gesture: PanGesture;
  /** The hymn under the thumb, by its place on the rail; -1 while the rail is not held. */
  readonly at: SharedValue<number>;
  /** The thumb's height on the rail, from the rail's shifted top. */
  readonly y: SharedValue<number>;
  /** The rail's full height, from `top` to `bottom`, as laid out. */
  readonly height: SharedValue<number>;
  /** How far the rail's top lies below `top`: the header pulled down past its rest (`railShift`). */
  readonly shift: SharedValue<number>;
}

export function useRail({
  marks,
  scroll,
  rest,
  quiet,
  felt,
  onMark,
}: {
  /** The hymns along the rail, in the list's order (`marksOf`). */
  readonly marks: ReadonlyArray<Mark>;
  /** The list's scroll offset, and the offset at which the header rests: the rail's top follows the header. */
  readonly scroll: SharedValue<number>;
  readonly rest: number;
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
  const shift = useDerivedValue(() => railShift(rest, scroll.value));
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
    const length = Math.max(0, height.value - shift.value);
    const now = markAt(touch, length, all.length);
    y.value = Math.min(length, Math.max(0, touch));
    const mark = all[now];
    // oxlint-disable-next-line effect/noNullish -- a worklet reads an array's place as it is.
    if (now === at.value || mark === undefined) return;
    const before = all[at.value];
    let ticks = 0;
    // oxlint-disable-next-line effect/noNullish -- the first hymn of a touch has none before it.
    if (before !== undefined) ticks = crossings(before.section, mark.section);
    at.value = now;
    felt.value = mark.section;
    onMark(mark);
    if (ticks > 0) scheduleOnRN(tick, ticks);
  };
  const gesture = usePanGesture({
    testID: 'rail',
    enabled: marks.length > 0,
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    // The touch is the rail's from its first point: a tap jumps, a drag drives.
    onBegin: ({ y: touch }) => {
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
  return { gesture, at, y, height, shift };
}

/** The rail in its gutter, `top` to `bottom` on the list's view: its numbers, its touch, and while held its thumb and the bubble beside it. */
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
  const { fontScale } = useWindowDimensions();
  const box = labelHeight(fontScale);
  const shifted = useAnimatedStyle(() => ({ top: hold.shift.value }));
  const thumb = useAnimatedStyle(() => ({
    opacity: Math.min(1, hold.at.value + 1),
    transform: [{ translateY: hold.y.value - THUMB / 2 }],
  }));
  return (
    <>
      <View
        pointerEvents="box-none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => {
          hold.height.value = event.nativeEvent.layout.height;
        }}
        style={[styles.gutter, { top, bottom }]}
      >
        <GestureDetector gesture={hold.gesture}>
          <Animated.View testID="rail" style={[styles.rail, shifted]}>
            {labelsOf(marks.length, LABELS).map((index) => (
              <Text
                key={index}
                numberOfLines={1}
                maxFontSizeMultiplier={LABEL_SCALE}
                style={[
                  styles.label,
                  { top: `${labelAt(index, marks.length)}%`, height: box, marginTop: -box / 2 },
                ]}
              >
                {marks[index]?.number}
              </Text>
            ))}
            <Animated.View style={[styles.thumb, { backgroundColor: accent }, thumb]} />
          </Animated.View>
        </GestureDetector>
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
    transform: [{ translateY: hold.shift.value + hold.y.value - BUBBLE / 2 }],
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

const THUMB = 10;

const styles = StyleSheet.create({
  gutter: { position: 'absolute', right: 0, width: GUTTER },
  rail: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: LABEL_SIZE,
    lineHeight: LABEL_LINE,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    color: color.muted,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    left: (GUTTER - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
  bubble: {
    position: 'absolute',
    right: GUTTER + 12,
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
