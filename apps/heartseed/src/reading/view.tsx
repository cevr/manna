/**
 * The reading view: a verse the voice reads, one `word-<i>` text per word
 * (`shownWordsOf`), each a direct child of the view. The words before the
 * read point are in `ink` and the rest in `quiet`, and the words the voice
 * says now carry `aria-selected` on the `hearing` ground. Nothing animates:
 * the ink and the ground change at once.
 */

import { Option } from 'effect';
import { StyleSheet, Text, View } from 'react-native';

import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import type { VoiceView } from '../voice';
import { shownWordsOf } from './words';

/** The words selected now: the voice's current range, none when it says none. */
const selectedOf = (
  view: VoiceView,
): Option.Option<{ readonly first: number; readonly last: number }> =>
  Option.fromNullishOr(view.current);

/** The verse `text` as the voice's reading `view` lights it: read to `view.lit`, the current range selected. */
export function ReadingView({ text, view }: { readonly text: string; readonly view: VoiceView }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const selected = selectedOf(view);
  return (
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
            style={[
              look.word,
              look.lit,
              index >= view.lit && styles.unread,
              isSelected && styles.current,
            ]}
          >
            {word}
          </Text>
        );
      })}
    </View>
  );
}

const sheets = themed((color) =>
  StyleSheet.create({
    reading: { minHeight: 44 },
    unread: { color: color.quiet },
    current: { backgroundColor: color.hearing, borderRadius: 4 },
  }),
);
