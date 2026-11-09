/**
 * The field's furrows as home A draws them. A furrow's head holds its icon,
 * its title (plain text, never a heading: a reference may spell `Your field`
 * or `Today`, and the field holds one heading, its own), how many of its
 * plants are ripe and, for a passage the reader holds, its `Remove`; under
 * it, its plants, then a soil line. Each plant is one button named
 * `<reference>, <stage>` (then `, ready today`), selected while its verse is
 * the one chosen; inside it, hidden from the screen reader, the gold dot of
 * a plant ready today, its stage drawn with the home's icons of the scheme
 * now (bare soil before planting) and its verse number. The legend draws
 * the four stages the same way, over Mark 4:28. Every text is a text role
 * of the scheme, and every fill a role.
 */

import { Option } from 'effect';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { verseNumberOf, type PlantStage } from '../field';
import { STAGES, type Stage } from '../garden';
import type { Furrow, FurrowPlant, HomeIcon } from '../home';
import { ICON_IMAGES } from '../home/icons';
import { themed, useScheme, useThemed } from '../look';
import { passageReference, type Range } from '../passages';
import { useLook } from '../sayit/draw';

/** The icon each stage is drawn with: full corn as `corn`. */
const DRAWN: Readonly<Record<Stage, HomeIcon>> = {
  seed: 'seed',
  blade: 'blade',
  ear: 'ear',
  'full corn': 'corn',
};

/** One of the home's icons in the scheme now, `size` points square, hidden from the screen reader; its own source stands in while it loads, so no frame draws it blank. */
export function Icon({
  name,
  size,
  testID,
}: {
  readonly name: HomeIcon;
  readonly size: number;
  readonly testID?: string;
}) {
  const scheme = useScheme();
  const source = ICON_IMAGES[name][scheme];
  return (
    <Image
      testID={testID}
      aria-hidden
      source={source}
      defaultSource={source}
      style={{ width: size, height: size }}
    />
  );
}

/** A pill of the field, outlined in ink, or filled in ink with `onInk` text when `strong`: at least 44 pt tall, named `label`, showing `shown` after an optional icon, disabled while a remove is pending. */
export function Control({
  label,
  shown,
  pending,
  onPress,
  strong = false,
  icon,
  testID,
}: {
  readonly label: string;
  readonly shown: string;
  readonly pending: boolean;
  readonly onPress: () => void;
  readonly strong?: boolean;
  readonly icon?: HomeIcon;
  readonly testID?: string;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID={testID}
      role="button"
      aria-label={label}
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        strong && styles.strong,
        pressed && look.pressed,
        pending && look.disabled,
      ]}
    >
      {Option.match(Option.fromUndefinedOr(icon), {
        onNone: () => false,
        onSome: (name) => <Icon name={name} size={22} />,
      })}
      <Text style={[styles.pillText, strong && styles.strongText]}>{shown}</Text>
    </Pressable>
  );
}

/** A plant's stage drawn: its icon, or bare soil before planting. */
function Drawing({ stage }: { readonly stage: PlantStage }) {
  const styles = useThemed(sheets);
  if (stage === 'not planted') return <View aria-hidden testID="plant-soil" style={styles.bare} />;
  return <Icon testID="plant-image" name={DRAWN[stage]} size={32} />;
}

/** One plant: a button over its dot, its drawing and its number, each hidden inside it. */
function Plot({
  plant,
  chosen,
  pending,
  onChoose,
}: {
  readonly plant: FurrowPlant;
  readonly chosen: boolean;
  readonly pending: boolean;
  readonly onChoose: (reference: string) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID="field-plant"
      role="button"
      aria-label={plant.label}
      aria-selected={chosen}
      disabled={pending}
      onPress={() => onChoose(plant.reference)}
      style={({ pressed }) => [
        styles.plot,
        chosen && styles.chosenPlot,
        pressed && look.pressed,
        pending && look.disabled,
      ]}
    >
      {plant.ready && <View aria-hidden testID="dot" style={[styles.dot, styles.ready]} />}
      {!plant.ready && <View aria-hidden style={styles.dot} />}
      <Drawing stage={plant.stage} />
      <Text aria-hidden style={styles.number}>
        {verseNumberOf(plant.reference)}
      </Text>
    </Pressable>
  );
}

/** One furrow: its head (icon, title, ripe count and, on a held passage, `Remove`), its plants, and its soil line. */
export function FurrowRow({
  furrow,
  chosen,
  pending,
  onChoose,
  onRemove,
}: {
  readonly furrow: Furrow;
  readonly chosen: Option.Option<string>;
  readonly pending: boolean;
  readonly onChoose: (reference: string) => void;
  readonly onRemove: (range: Range) => void;
}) {
  const styles = useThemed(sheets);
  return (
    <View testID="row" style={styles.furrow}>
      <View style={styles.head}>
        <Icon testID="furrow-icon" name={furrow.icon} size={28} />
        <View style={styles.names}>
          <Text testID="row-title" style={styles.title}>
            {furrow.title}
          </Text>
          <Text testID="ripe" style={styles.ripe}>
            {furrow.ripe}
          </Text>
        </View>
        {Option.match(Option.fromUndefinedOr(furrow.range), {
          onNone: () => false,
          onSome: (range) => (
            <Control
              label={`Remove ${passageReference(range)}`}
              shown="Remove"
              pending={pending}
              onPress={() => onRemove(range)}
            />
          ),
        })}
      </View>
      <View style={styles.plots}>
        {furrow.plants.map((plant, index) => (
          <Plot
            key={index}
            plant={plant}
            chosen={Option.contains(chosen, plant.reference)}
            pending={pending}
            onChoose={onChoose}
          />
        ))}
      </View>
      <View aria-hidden style={styles.soil} />
    </View>
  );
}

/** The dashed row at the field's end: `Add verses`, as the bar's does. */
export function AddRow({ onAdd }: { readonly onAdd: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID="add-row"
      role="button"
      aria-label="Add verses"
      onPress={onAdd}
      style={({ pressed }) => [styles.addRow, pressed && look.pressed]}
    >
      <Icon name="add" size={28} />
      <Text style={styles.addText}>Add verses</Text>
    </Pressable>
  );
}

/** The four stages as the plants draw them, named, hidden from the screen reader, over Mark 4:28. */
export function Legend() {
  const styles = useThemed(sheets);
  return (
    <View style={styles.legendPlace}>
      <View aria-hidden style={styles.legend}>
        {STAGES.map((stage) => (
          <View key={stage} style={styles.key}>
            <Icon name={DRAWN[stage]} size={24} />
            <Text style={styles.keyName}>{stage}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>Mark 4:28</Text>
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    pill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: color.ink,
      justifyContent: 'center',
    },
    strong: { backgroundColor: color.ink },
    pillText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    strongText: { color: color.onInk },
    furrow: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    names: { flex: 1, gap: 2 },
    title: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    ripe: { fontFamily: face, fontSize: 13, color: color.quiet },
    plots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    plot: {
      width: 48,
      minHeight: 44,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 4,
      borderRadius: 12,
    },
    chosenPlot: { backgroundColor: color.card },
    dot: { width: 8, height: 8, borderRadius: 4 },
    ready: { backgroundColor: color.sun },
    bare: {
      width: 24,
      height: 3,
      marginVertical: 14,
      borderRadius: 1.5,
      backgroundColor: color.soil,
    },
    number: { fontFamily: face, fontSize: 11, color: color.ink },
    soil: { height: 2, borderRadius: 1, backgroundColor: color.furrow },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 56,
      borderRadius: 20,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: color.furrow,
    },
    addText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    legendPlace: { alignItems: 'center', gap: 6, marginTop: 4 },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      columnGap: 12,
      rowGap: 4,
    },
    key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    keyName: { fontFamily: face, fontSize: 12, color: color.ink },
    caption: { fontFamily: face, fontStyle: 'italic', fontSize: 13, color: color.ink },
  }),
);
