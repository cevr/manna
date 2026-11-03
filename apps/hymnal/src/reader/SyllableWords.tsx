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
  readonly label: string;
  readonly at: string;
  readonly index: number;
  readonly style: StyleProp<TextStyle>;
  readonly over: Option.Option<(box: Box, place: string) => ReactNode>;
}) {
  const { fontScale } = useWindowDimensions();
  const text = usePageText();
  const { marked, ref, syllableStyle } = useLineFollow(index);
  const starts = wordStarts(words);
  const boxed = Option.isSome(over);
  const textStyle = [style, text.words];
  const hyphen = (
    <Text style={styles.muted} aria-hidden>
      -
    </Text>
  );
  const run = (syllables: Arr.NonEmptyReadonlyArray<Placed>, after: ReactNode) => {
    const first = Arr.headNonEmpty(syllables);
    return (
      <Text
        testID={`syllable-${at}-${first.s + 1}`}
        style={[textStyle, syllableStyle(first.s)]}
        dynamicTypeRamp="body"
        pointerEvents="none"
        {...(boxed && { 'aria-label': syllables.map(({ box }) => box.text).join('') })}
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

const readAs = (boxed: boolean, label: string) => {
  if (boxed) return { accessible: false };
  return { accessible: true, 'aria-label': label };
};

const wordStarts = (words: ReadonlyArray<Word>): ReadonlyArray<number> =>
  words.reduce<Array<number>>(
    (starts, word, w) => [...starts, (starts[w - 1] ?? 0) + (words[w - 1]?.length ?? 0)],
    [],
  );

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap' },
  boxed: { rowGap: 6, marginBottom: 8, alignItems: 'flex-end' },
  onFoot: { alignItems: 'flex-end' },
  word: { flexDirection: 'row' },
  box: { flexDirection: 'column' },
  syllable: { flexDirection: 'row' },
  hyphen: { flexGrow: 1, textAlign: 'center' },
  muted: { color: color.muted },
});
