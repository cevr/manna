/**
 * A sung line drawn as its syllables, chords on or off: a row of words that
 * wraps between words, each word kept together on one row, with a muted
 * hyphen between the syllables of one word. The row is indented and its
 * first word pulled back to the line's start, so a wrapped line hangs
 * (`HangingLine` does the same for a Plain part's words).
 *
 * With chords off (and under a line-level part's chord row), a word is one
 * text: its syllables are spans of it, each with its own colour, and the
 * words sit a space apart, as the page's words do. Under syllable-level
 * chords, each syllable with a chord over it is a box with its chords over
 * it (`over`), the words a fixed gap apart; a box widened by a long chord
 * stretches the hyphen after it; a box that can hold no chord keeps its
 * hyphen as a span of its text. The chordless syllables that follow a
 * chordless syllable of the same word join its box as spans of its text, so
 * they keep the places they had as boxes of their own. A box with no chord
 * has an empty view as tall as a chord row in its chord's place, and every
 * box stands on its syllables' foot, so the syllables keep one baseline. A
 * page draws about one native view a word or a chord, not four a syllable.
 *
 * Each text names its first syllable (`syllable-p-l-s`): on the web every
 * syllable keeps its own id, as a span; on iOS a span is no element, so a
 * syllable inside a word's text or a joined box is found by its text's id.
 *
 * Unboxed, the row is one accessible element that reads the whole line as
 * words (`label`); the syllables and hyphens are not read on their own.
 * Boxed, the row is not one element, so each chord keeps its own id on iOS
 * (`chord-p-l-s`) and each box's syllables are read under its chords. While
 * the line is sung (`follow/`), it is `selected`, its syllables take the
 * muted colour and the sung syllable the accent: a change of colour only, so
 * nothing moves.
 *
 * A syllable's text takes no touch, so a tap in the target of the chord over
 * it (`chordSlop`, 44 points tall) opens that chord wherever the syllable
 * lies under it; a drag that starts there still scrolls or turns the page.
 */

import { Array as Arr, Option } from 'effect';
import { Fragment, type ReactNode } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import { color } from '~/color';
import type { Box, Word } from '~/hymns/chords';

import { currentOf } from '~/follow/current';
import { useLineFollow } from '~/follow/follow';
import { WithIntro } from '~/follow/IntroLine';

import { usePageText } from './pageText';

/** A syllable of a line: its box, and its place in the line from 0. */
interface Placed {
  readonly box: Box;
  readonly s: number;
}

export function SyllableLine({
  words,
  label,
  at,
  index,
  style,
  over,
}: {
  readonly words: ReadonlyArray<Word>;
  /** The line's words as printed: what a screen reader reads. */
  readonly label: string;
  /** The line's place, `p-l`: its syllables are `syllable-p-l-s`. */
  readonly at: string;
  /** The line's place in the hymn as sung, from 0: its mark in the follow. */
  readonly index: number;
  readonly style: StyleProp<TextStyle>;
  /** What sits over each syllable, its place `p-l-s` given: its chords, when the line is boxed. */
  readonly over: Option.Option<(box: Box, place: string) => ReactNode>;
}) {
  const { fontScale } = useWindowDimensions();
  const text = usePageText();
  const { marked, ref, syllableStyle } = useLineFollow(index);
  const starts = wordStarts(words);
  const boxed = Option.isSome(over);
  const textStyle = [style, text.words];
  /** The muted hyphen between two syllables of one word, as a span of the text before it. */
  const hyphen = (
    <Text style={styles.muted} aria-hidden>
      -
    </Text>
  );
  /** A run of syllables as one text: the first its own colour, each later one a span after a muted hyphen. */
  const run = (syllables: Arr.NonEmptyReadonlyArray<Placed>, after: ReactNode) => {
    const first = Arr.headNonEmpty(syllables);
    return (
      <Text
        testID={`syllable-${at}-${first.s + 1}`}
        style={[textStyle, syllableStyle(first.s)]}
        dynamicTypeRamp="body"
        pointerEvents="none"
      >
        {first.box.text}
        {Arr.tailNonEmpty(syllables).map(({ box, s }) => (
          <Fragment key={s}>
            {hyphen}
            <Text testID={`syllable-${at}-${s + 1}`} style={syllableStyle(s)}>
              {box.text}
            </Text>
          </Fragment>
        ))}
        {after}
      </Text>
    );
  };
  return (
    <WithIntro index={index}>
      <View
        ref={ref}
        {...readAs(boxed, label)}
        aria-selected={marked}
        {...currentOf(marked)}
        testID="line"
        style={[
          styles.line,
          boxed && [styles.boxed, { columnGap: 5 * fontScale }],
          { paddingLeft: text.indent },
        ]}
      >
        {words.map((word, w) => {
          const placed = word.map((box, k) => ({ box, s: (starts[w] ?? 0) + k }));
          if (!Arr.isReadonlyArrayNonEmpty(placed)) return <Fragment key={w} />;
          const pulled = w === 0 && { marginLeft: -text.indent };
          return Option.match(over, {
            // A word alone is one text, the space after it a no-break space, so no row drops it at its end.
            onNone: () => (
              <View key={w} style={[styles.word, pulled]}>
                {run(placed, (w < words.length - 1 && '\u00A0') || '')}
              </View>
            ),
            onSome: (draw) => (
              <View key={w} style={[styles.word, styles.onFoot, pulled]}>
                {boxesOf(placed).map((joined, b, all) => {
                  const head = Arr.headNonEmpty(joined);
                  const more = b < all.length - 1;
                  // A box that can hold no chord is never wider than its text, so its hyphen never stretches: a span.
                  const bare = head.s > 0 && head.box.chords.length === 0;
                  return (
                    <View key={head.s} style={styles.box}>
                      {draw(head.box, `${at}-${head.s + 1}`)}
                      <View style={styles.syllable}>
                        {run(joined, more && bare && hyphen)}
                        {more && !bare && (
                          <Text
                            style={[textStyle, styles.muted, styles.hyphen]}
                            dynamicTypeRamp="body"
                            pointerEvents="none"
                            aria-hidden
                          >
                            -
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ),
          });
        })}
      </View>
    </WithIntro>
  );
}

/**
 * A word's syllables in boxes: each syllable with a chord (and the line's
 * first, which may hold a chord over from the line before) starts a box, and
 * so does a chordless syllable after one; a chordless syllable after a
 * chordless one joins its box. A box with no chord is as wide as its text,
 * so the joined syllables sit where their own boxes stood.
 */
const boxesOf = (
  word: Arr.NonEmptyReadonlyArray<Placed>,
): ReadonlyArray<Arr.NonEmptyReadonlyArray<Placed>> =>
  Arr.tailNonEmpty(word).reduce<Arr.NonEmptyArray<Arr.NonEmptyArray<Placed>>>(
    (boxes, placed, k) => {
      const before = word[k] ?? placed;
      const last = Arr.lastNonEmpty(boxes);
      if (before.s === 0 || before.box.chords.length > 0 || placed.box.chords.length > 0)
        return Arr.append(boxes, Arr.of(placed));
      return Arr.append(Arr.initNonEmpty(boxes), Arr.append(last, placed));
    },
    Arr.of(Arr.of(Arr.headNonEmpty(word))),
  );

/** An unboxed line is one element read by its words; a boxed one leaves its chords their own ids. */
const readAs = (boxed: boolean, label: string) => {
  if (boxed) return { accessible: false };
  return { accessible: true, 'aria-label': label };
};

/** Each word's first syllable's place in its line, from 0. */
const wordStarts = (words: ReadonlyArray<Word>): ReadonlyArray<number> =>
  words.reduce<Array<number>>(
    (starts, word, w) => [...starts, (starts[w - 1] ?? 0) + (words[w - 1]?.length ?? 0)],
    [],
  );

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap' },
  // A boxed line's words, and each word's boxes, stand on their syllables' foot: one baseline in a row.
  boxed: { rowGap: 6, marginBottom: 8, alignItems: 'flex-end' },
  onFoot: { alignItems: 'flex-end' },
  word: { flexDirection: 'row' },
  box: { flexDirection: 'column' },
  syllable: { flexDirection: 'row' },
  // The hyphen keeps its own width and takes what a long chord adds to its box.
  hyphen: { flexGrow: 1, textAlign: 'center' },
  muted: { color: color.muted },
});
