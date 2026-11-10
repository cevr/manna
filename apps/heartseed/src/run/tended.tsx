/**
 * The end of a run as Today draws it: a sun, one line of how many verses
 * grew a stage, and each grown verse as one image named
 * `<reference>, <stage>`, its stage drawn with the home's icon and its
 * reference beside it, both hidden so the name is the whole reading. It
 * holds no control and no verse's words. Only each grown plant's image
 * moves, by `endMotionOf`: the first twelve spring in turn and full corn
 * among them sways; the sun, the line and the references stand still.
 */

import { Option } from 'effect';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Moves } from '../field/moves';
import { DRAWN, Icon } from '../field/plot';
import type { Grown } from '../home/grown';
import { endMotionOf, type PlantMotion } from '../home/motion';
import { themed, useThemed } from '../look';

const STILL: PlantMotion = { spring: Option.none(), sway: false };

/** The line over `count` verses grown: none, one, or how many. */
const grewOf = (count: number) => {
  if (count === 0) return 'Nothing grew this time.';
  return `${count} grew a stage.`;
};

/** The end's drawing over `grown`, in run order. */
export function Tended({ grown }: { readonly grown: readonly Grown[] }) {
  const styles = useThemed(sheets);
  const motion = useMemo(() => endMotionOf(grown), [grown]);
  return (
    <View testID="tended" style={styles.tended}>
      <Icon name="sun" size={48} />
      <Text testID="grew" style={styles.line}>
        {grewOf(grown.length)}
      </Text>
      <View style={styles.list}>
        {grown.map((each, index) => (
          <View
            key={each.reference}
            testID="grown"
            role="img"
            aria-label={`${each.reference}, ${each.stage}`}
            style={styles.grown}
          >
            <Moves motion={motion[index] ?? STILL}>
              <Icon name={DRAWN[each.stage]} size={44} />
            </Moves>
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
