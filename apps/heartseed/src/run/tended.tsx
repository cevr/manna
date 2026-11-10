/**
 * The end of a run as Today draws it: a sun, one line of how many verses
 * grew a stage, and each grown verse as one image named
 * `<reference>, <stage>`, its stage drawn with the home's icon and its
 * reference beside it, both hidden so the name is the whole reading. It
 * holds no control and no verse's words, and nothing in it moves.
 */

import { StyleSheet, Text, View } from 'react-native';

import { DRAWN, Icon } from '../field/plot';
import type { Grown } from '../home/grown';
import { themed, useThemed } from '../look';

/** The line over `count` verses grown: none, one, or how many. */
const grewOf = (count: number) => {
  if (count === 0) return 'Nothing grew this time.';
  return `${count} grew a stage.`;
};

/** The end's drawing over `grown`, in run order. */
export function Tended({ grown }: { readonly grown: readonly Grown[] }) {
  const styles = useThemed(sheets);
  return (
    <View testID="tended" style={styles.tended}>
      <Icon name="sun" size={48} />
      <Text testID="grew" style={styles.line}>
        {grewOf(grown.length)}
      </Text>
      <View style={styles.list}>
        {grown.map((each) => (
          <View
            key={each.reference}
            testID="grown"
            role="img"
            aria-label={`${each.reference}, ${each.stage}`}
            style={styles.grown}
          >
            <Icon name={DRAWN[each.stage]} size={44} />
            <Text aria-hidden style={styles.reference}>
              {each.reference}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    tended: { alignItems: 'center', gap: 16, paddingVertical: 8 },
    line: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    list: { alignSelf: 'stretch', gap: 8 },
    grown: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
    reference: { flexShrink: 1, fontFamily: face, fontSize: 17, color: color.ink },
  }),
);
