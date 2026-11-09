import { ScrollView, StyleSheet, Text } from 'react-native';

import { HANDBOOK, HANDBOOK_LISTS } from '../../src/handbook';
import { versesOf } from '../../src/kjv';
import { themed, useScheme } from '../../src/look';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

const sheets = themed((roles, each) =>
  StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingTop: 80,
      paddingHorizontal: 24,
      gap: 8,
      backgroundColor: roles.ground,
    },
    line: { fontSize: 17, fontFamily: each, color: roles.ink },
  }),
);

/** Every distinct verse the Handbook's lists name, as book, chapter and verse. */
const versesNamed = () => {
  const keyed = new Map(
    HANDBOOK_LISTS.flatMap((list) =>
      list.promises.flatMap((range) =>
        Array.from({ length: range.last - range.first + 1 }, (_, index) => {
          const verse = range.first + index;
          return [
            `${range.book}:${range.chapter}:${verse}`,
            { book: range.book, chapter: range.chapter, verse },
          ] as const;
        }),
      ),
    ),
  );
  return [...keyed.values()];
};

/** The probe's six lines: the Handbook's counts, and how many of its verses the device's corpus gives text. */
const linesOf = () => {
  const verses = versesNamed();
  const resolved = verses.filter(
    ({ book, chapter, verse }) => (versesOf(book, chapter)[verse - 1] ?? '').length > 0,
  ).length;
  return [
    `sections ${HANDBOOK.length}`,
    `lists ${HANDBOOK_LISTS.length}`,
    `ranges ${HANDBOOK_LISTS.reduce((sum, list) => sum + list.promises.length, 0)}`,
    `verses ${verses.length}`,
    `resolved ${resolved}`,
    `missing ${verses.length - resolved}`,
  ];
};

/**
 * A development probe for the live check of the Bible Handbook's lists
 * (verify-heartseed, `handbook-probe`): its sections, lists, ranges and
 * distinct verses, how many of those verses the bundled KJV gives text on
 * the device, and how many it does not, one line each. Counts only, never
 * a word of a verse. A release build renders nothing.
 */
export default function HandbookProbe() {
  const scheme = useScheme();
  if (!dev) return;
  return (
    <ScrollView contentContainerStyle={sheets[scheme].content}>
      {linesOf().map((line) => (
        <Text key={line.split(' ')[0]} style={sheets[scheme].line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}
