import { type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

import { currentOf } from '~/follow/current';
import { useLineFollow } from '~/follow/follow';
import { WithIntro } from '~/follow/IntroLine';

import { usePageText } from './pageText';

const wordsOf = (line: string): ReadonlyArray<string> => {
  const words = line.split(/ +/).filter((word) => word.length > 0);
  return [...words.slice(0, -1).map((word) => `${word}\u00A0`), ...words.slice(-1)];
};

export function HangingLine({
  line,
  index,
  style,
}: {
  readonly line: string;
  readonly index: number;
  readonly style: StyleProp<TextStyle>;
}) {
  const { words, indent } = usePageText();
  const { marked, ref, wordsStyle } = useLineFollow(index);
  return (
    <WithIntro index={index}>
      <View
        ref={ref}
        accessible
        aria-label={line}
        aria-selected={marked}
        {...currentOf(marked)}
        testID="line"
        style={[styles.row, { paddingLeft: indent }]}
      >
        {wordsOf(line).map((word, k) => (
          <Text
            key={k}
            style={[style, words, k === 0 && { marginLeft: -indent }, wordsStyle]}
            dynamicTypeRamp="body"
          >
            {word}
          </Text>
        ))}
      </View>
    </WithIntro>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap' } });
