/**
 * The Sections list's number rail, on the list's right edge: a few hymn
 * numbers, faint, from the first to the last. A drag along it takes the
 * list to the hymn under the thumb (`markAt`, one equal band per hymn), and
 * a bubble beside the thumb shows that hymn's number and its topic. Each
 * topic the drag passes is a `rail-tick` (`crossings`), felt only; the
 * ticks keep the feel's floor, so a fast drag is a ratchet, not a buzz.
 *
 * The touch is a gesture handler's pan (`usePanGesture`), as the player's
 * bar's is: it begins at the touch and holds the finger, so the list does
 * not scroll under a drag on the rail.
 *
 * Screen readers do not see the rail: it is hidden from them, and the
 * list's own topic rows (headings) and the home's tabs and `All at once`
 * are their way through the hymns.
 */

import { Option } from 'effect';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';

import { crossings, labelsOf, type Mark, markAt } from './rail-marks';

/** The rail's width, from the screen's right edge. */
const WIDTH = 20;

/** How many numbers the rail shows. */
const LABELS = 6;

const BUBBLE = 56;

/** Where the drag is: the hymn under the thumb, and the thumb's height on the rail. */
interface Held {
  readonly index: number;
  readonly y: number;
}

export function Rail({
  marks,
  sections,
  top,
  bottom,
  onMark,
  onHold,
}: {
  /** The hymns along the rail, in the list's order (`marksOf`). */
  readonly marks: ReadonlyArray<Mark>;
  /** Each topic's name, by its place among the topics. */
  readonly sections: ReadonlyArray<string>;
  /** The rail's ends, from the list's top and bottom. */
  readonly top: number;
  readonly bottom: number;
  /** The hymn the thumb has come to: the list shows it. */
  readonly onMark: (mark: Mark) => void;
  /** The drag began (`true`) or ended (`false`). */
  readonly onHold: (held: boolean) => void;
}) {
  const accent = useAccent();
  const cue = useCue();
  const [height, setHeight] = useState(0);
  const [held, setHeld] = useState<Option.Option<Held>>(Option.none());
  const last = useRef<Option.Option<Mark>>(Option.none());
  const to = (y: number) => {
    const index = markAt(y, height, marks.length);
    Option.map(Option.fromNullishOr(marks[index]), (mark) => {
      Option.match(last.current, {
        onNone: () => onMark(mark),
        onSome: (before) => {
          for (let k = 0; k < crossings(before.section, mark.section); k += 1)
            cue(plain('rail-tick'));
          if (before.number !== mark.number) onMark(mark);
        },
      });
      last.current = Option.some(mark);
      setHeld(Option.some({ index, y: Math.min(height, Math.max(0, y)) }));
    });
  };
  const end = () => {
    last.current = Option.none();
    setHeld(Option.none());
    onHold(false);
  };
  // The pan's callbacks read the rail as it is now, not as it was when the pan was made.
  const live = useRef({ to, end, onHold });
  live.current = { to, end, onHold };
  const pan = usePanGesture({
    runOnJS: true,
    disableReanimated: true,
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onBegin: ({ y }) => {
      live.current.onHold(true);
      live.current.to(y);
    },
    onUpdate: ({ y }) => live.current.to(y),
    onFinalize: () => live.current.end(),
  });
  const band = height / Math.max(1, marks.length);
  return (
    <>
      <GestureHandlerRootView style={[styles.root, { top, bottom }]}>
        <GestureDetector gesture={pan}>
          <View
            testID="rail"
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
            style={styles.rail}
          >
            {height > 0 &&
              labelsOf(marks.length, LABELS).map((index) => (
                <Text key={index} style={[styles.label, { top: (index + 0.5) * band - LABEL / 2 }]}>
                  {marks[index]?.number}
                </Text>
              ))}
            {Option.getOrNull(
              Option.map(held, ({ y }) => (
                <View
                  pointerEvents="none"
                  style={[styles.thumb, { top: y - THUMB / 2, backgroundColor: accent }]}
                />
              )),
            )}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
      {Option.getOrNull(
        Option.map(held, ({ index, y }) => (
          <View
            pointerEvents="none"
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.bubble, { top: top + y - BUBBLE / 2 }]}
          >
            <Text style={[styles.number, { color: accent }]}>{marks[index]?.number}</Text>
            <Text style={styles.section} numberOfLines={1}>
              {sections[marks[index]?.section ?? 0]}
            </Text>
          </View>
        )),
      )}
    </>
  );
}

const LABEL = 12;
const THUMB = 10;

const styles = StyleSheet.create({
  root: { position: 'absolute', right: 0, width: WIDTH },
  rail: { flex: 1 },
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
