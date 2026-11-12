/**
 * The reading view: a verse the voice reads, one `word-<i>` text per word
 * (`shownWordsOf`), each a direct child of the view with its own layout. A
 * lined verse (`linesOf`) starts each line after the first on its own row
 * after a `break-<k>` sibling (`LineBreak`), so the words keep their
 * numbers and their layouts in the view's coordinates.
 * The words before the read point are in `ink` and the rest in `quiet`,
 * and the selected words carry `aria-selected` on the `hearing` ground:
 * the held word while a finger holds the view, else the words the voice
 * says now. Nothing animates: the ink and the ground change at once.
 *
 * The hold is a pan on the whole view (`reading-hold`) that activates only
 * after a still long press, so a swipe scrolls and never holds. At its
 * activation the word under the finger (`wordAt`, over each word's box as
 * its layout gave it) is held and the reading pauses (`onHold`); each move
 * holds the word under the finger; its end acts once, in `onFinalize`: a
 * release reads on from the held word (`onSeek`), a cancel resumes
 * (`onLetGo`). The held word lives in a ref beside the screen's state, so
 * no callback reads a stale one, and when the view goes (the reading
 * ended) the hold is dropped and a later end calls nothing.
 *
 * Each word stays its own accessibility element and offers VoiceOver one
 * action, `Read from here`, which reads on from it (`onSeek`), as a
 * release on it would.
 */

import { Option } from 'effect';
import { useEffect, useRef, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import type { VoiceView } from '../voice';
import { breaksOf, type Line } from './lines';
import { shownWordsOf, wordAt, type Box } from './words';

/** How long a finger rests still on the words before the hold takes it, in milliseconds. */
const LONG_PRESS = 350;

/** The VoiceOver action each word offers: the reading reads on from that word. */
const READ_FROM_HERE = { name: 'readFromHere', label: 'Read from here' } as const;

/** The actions list each word carries, one list for every word. */
const WORD_ACTIONS = [READ_FROM_HERE];

/** The hold as the screen keeps it: the word held, if any, and what each moment of the hold asks of the voice. */
export interface Hold {
  readonly held: Option.Option<number>;
  /** The held word changed: a word under the finger, or none once the hold ends. */
  readonly onHeld: (word: Option.Option<number>) => void;
  /** The hold began: the reading pauses. */
  readonly onHold: () => void;
  /** The finger lifted on `word`: the reading reads on from it. */
  readonly onSeek: (word: number) => void;
  /** The hold was canceled: the reading resumes. */
  readonly onLetGo: () => void;
}

interface Range {
  readonly first: number;
  readonly last: number;
}

/** The words selected now: the held word while held, else the voice's current range, none when it says none. */
const selectedOf = (view: VoiceView, held: Option.Option<number>): Option.Option<Range> =>
  Option.match(held, {
    onNone: () => Option.fromNullishOr(view.current),
    onSome: (word) => Option.some({ first: word, last: word }),
  });

/**
 * The space before the first word of a line after the first (`k`, its word
 * number): a full-width row the line gap tall, a sibling of the words so
 * each word's layout stays in its view's own coordinates. It has no text
 * and no role, and VoiceOver passes over it.
 */
export function LineBreak({ word }: { readonly word: number }) {
  const look = useLook();
  return (
    <View
      testID={`break-${word}`}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={look.lineBreak}
    />
  );
}

/** The break before word `index`, when a line starts there after the first; none else. */
export const breakBefore = (
  breaks: ReadonlySet<number>,
  index: number,
): readonly ReactElement[] => {
  if (!breaks.has(index)) return [];
  return [<LineBreak key={`break-${index}`} word={index} />];
};

/** The verse `text` as the voice's reading `view` lights it, under the hold `hold`, its words in `lines` (one line unless given). */
export function ReadingView({
  text,
  view,
  hold,
  lines = [],
}: {
  readonly text: string;
  readonly view: VoiceView;
  readonly hold: Hold;
  readonly lines?: ReadonlyArray<Line>;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const breaks = breaksOf(lines);
  const boxes = useRef(new Map<number, Box>());
  const held = useRef<Option.Option<number>>(Option.none());
  const live = useRef(hold);
  live.current = hold;
  const holdAt = (word: Option.Option<number>) => {
    held.current = word;
    live.current.onHeld(word);
  };
  useEffect(
    () => () => {
      if (Option.isNone(held.current)) return;
      held.current = Option.none();
      live.current.onHeld(Option.none());
    },
    [],
  );
  const pan = usePanGesture({
    testID: 'reading-hold',
    runOnJS: true,
    disableReanimated: true,
    activateAfterLongPress: LONG_PRESS,
    onActivate: ({ x, y }) => {
      const word = wordAt(x, y, boxes.current);
      if (Option.isNone(word)) return;
      holdAt(word);
      live.current.onHold();
    },
    onUpdate: ({ x, y }) => {
      if (Option.isNone(held.current)) return;
      const word = wordAt(x, y, boxes.current);
      if (Option.isSome(word)) holdAt(word);
    },
    onFinalize: ({ canceled }) => {
      const word = held.current;
      if (Option.isNone(word)) return;
      holdAt(Option.none());
      if (canceled) live.current.onLetGo();
      else live.current.onSeek(word.value);
    },
  });
  const selected = selectedOf(view, hold.held);
  const readTo = Option.getOrElse(hold.held, () => view.lit);
  return (
    <GestureDetector gesture={pan}>
      <View testID="reading" style={[look.verse, styles.reading]}>
        {shownWordsOf(text).flatMap((word, index) => {
          const isSelected = Option.exists(
            selected,
            (range) => index >= range.first && index <= range.last,
          );
          return [
            ...breakBefore(breaks, index),
            <Text
              key={index}
              testID={`word-${index}`}
              aria-selected={isSelected}
              accessibilityActions={WORD_ACTIONS}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === READ_FROM_HERE.name) live.current.onSeek(index);
              }}
              onLayout={({ nativeEvent }) => boxes.current.set(index, nativeEvent.layout)}
              style={[
                look.word,
                look.lit,
                index >= readTo && styles.unread,
                isSelected && styles.current,
              ]}
            >
              {word}
            </Text>,
          ];
        })}
      </View>
    </GestureDetector>
  );
}

const sheets = themed((color) =>
  StyleSheet.create({
    reading: { minHeight: 44 },
    unread: { color: color.quiet },
    current: { backgroundColor: color.hearing, borderRadius: 4 },
  }),
);
