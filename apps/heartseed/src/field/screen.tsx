/**
 * The field as the reader meets it: the way back to Today, the heading, the
 * days sown and the harvest, one card per row titled by its passage, each
 * verse a plant drawn as Today draws its stage with its verse number small
 * beneath, and a legend of the four stages under Mark 4:28. Each plant is
 * one image to the screen reader, labelled `<reference>, <stage>`; its
 * drawing and number are hidden inside it. Every text is Palette A's ink, so
 * each reads at WCAG AA contrast on the ground and on a card. It draws a
 * `Field` it is given and holds no state, so every frame shows the field as
 * derived.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import {
  harvestText,
  sownText,
  verseNumberOf,
  type Field,
  type FieldPlant,
  type FieldRow,
} from '../field';
import { STAGES } from '../garden';
import { color, look, PlantMark } from '../sayit/draw';

/** One verse: its plant over its number, one labelled image. */
function Plot({ plant }: { readonly plant: FieldPlant }) {
  return (
    <View
      testID="field-plant"
      role="img"
      accessible
      aria-label={`${plant.reference}, ${plant.stage}`}
      style={styles.plot}
    >
      <PlantMark stage={plant.stage} />
      <Text aria-hidden style={styles.number}>
        {verseNumberOf(plant.reference)}
      </Text>
    </View>
  );
}

/**
 * One passage: its title and its verses' plots. The title is plain text, seen
 * and read as stored, never a heading: a reference may spell `Your field` or
 * `Today`, and the field holds one heading, its own.
 */
function Row({ row }: { readonly row: FieldRow }) {
  return (
    <View testID="row" style={styles.card}>
      <Text testID="row-title" style={styles.title}>
        {row.title}
      </Text>
      <View style={styles.plots}>
        {row.plants.map((plant, index) => (
          <Plot key={index} plant={plant} />
        ))}
      </View>
    </View>
  );
}

/** The four stages as the plants draw them, named, hidden from the screen reader as one more image would be. */
function Legend() {
  return (
    <View style={styles.legendPlace}>
      <View aria-hidden style={styles.legend}>
        {STAGES.map((stage) => (
          <View key={stage} style={styles.key}>
            <PlantMark stage={stage} />
            <Text style={styles.keyName}>{stage}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>Mark 4:28</Text>
    </View>
  );
}

/** The field screen over `field`, with the way back to Today. */
export function FieldScreen({
  field,
  onToday,
}: {
  readonly field: Field;
  readonly onToday: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={look.screen}
      contentContainerStyle={[
        look.content,
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Pressable
        role="button"
        aria-label="Today"
        hitSlop={10}
        onPress={onToday}
        style={({ pressed }) => [styles.back, pressed && look.pressed]}
      >
        <Text style={styles.backText}>‹ Today</Text>
      </Pressable>
      <View style={styles.head}>
        <Text role="heading" aria-level={1} style={look.title}>
          Your field
        </Text>
        <Text testID="sown" style={look.summary}>
          {sownText(field.sown)}
        </Text>
        <Text testID="harvest" style={look.summary}>
          {harvestText(field.harvest)}
        </Text>
      </View>
      {field.rows.map((row, index) => (
        <Row key={index} row={row} />
      ))}
      <Legend />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 17, fontWeight: '600', color: color.ink },
  head: { gap: 6 },
  card: {
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: color.card,
  },
  title: { fontFamily: 'Georgia', fontSize: 15, fontWeight: '600', color: color.ink },
  plots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  plot: { width: 44, alignItems: 'center', gap: 2 },
  number: { fontSize: 11, color: color.ink },
  legendPlace: { alignItems: 'center', gap: 6, marginTop: 4 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 12,
    rowGap: 4,
  },
  key: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  keyName: { fontSize: 12, color: color.ink },
  caption: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 13, color: color.ink },
});
