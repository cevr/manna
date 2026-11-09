/**
 * The reading view: a verse the voice reads, one `word-<i>` text per word
 * (`shownWordsOf`), each a direct child of the view with its own layout.
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
 */

import { Option } from 'effect';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import type { VoiceView } from '../voice';
import { shownWordsOf, wordAt, type Box } from './words';

/** How long a finger rests still on the words before the hold takes it, in milliseconds. */
const LONG_PRESS = 350;

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

/** The verse `text` as the voice's reading `view` lights it, under the hold `hold`. */
export function ReadingView({
  text,
  view,
  hold,
}: {
  readonly text: string;
  readonly view: VoiceView;
  readonly hold: Hold;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
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
        {shownWordsOf(text).map((word, index) => {
          const isSelected = Option.exists(
            selected,
            (range) => index >= range.first && index <= range.last,
          );
          return (
            <Text
              key={index}
              testID={`word-${index}`}
              aria-selected={isSelected}
              onLayout={({ nativeEvent }) => boxes.current.set(index, nativeEvent.layout)}
              style={[
                look.word,
                look.lit,
                index >= readTo && styles.unread,
                isSelected && styles.current,
              ]}
            >
              {word}
            </Text>
          );
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
