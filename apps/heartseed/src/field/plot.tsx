/**
 * The field's furrows as home A draws them. A furrow's head holds its icon,
 * then its title (never a heading: a reference may spell `Your field` or
 * `Today`, and the field holds one heading, its own) and its caption
 * (`captionOf`) inside one button, `Open <title>`, at least 44 pt tall,
 * with a chevron hidden from the screen reader: its tap opens the list's
 * own page, where a held passage or Handbook list is removed. Under
 * it, its plants, then a soil line. Each plant is one button named
 * `<reference>, <stage>` (then `, ready today`), selected while its verse is
 * the one chosen; inside it, hidden from the screen reader, the gold dot of
 * a plant ready today, its stage drawn with the home's icons of the scheme
 * now (bare soil before planting), and no text. The legend draws
 * the four stages the same way, over Mark 4:28. Every text is a text role
 * of the scheme, and every fill a role.
 */

import { Match, Option } from 'effect';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlantStage } from '../field';
import { STAGES, type Stage } from '../garden';
import type { Furrow, FurrowPlant, HomeIcon } from '../home';
import { ICON_IMAGES } from '../home/icons';
import { motionOf, type FurrowMotion, type PlantMotion } from '../home/motion';
import { themed, useScheme, useThemed } from '../look';
import { passageReference, type Range } from '../passages';
import { useLook } from '../sayit/draw';
import { EnteringIcon, Moves } from './moves';

const STILL_PLANT: PlantMotion = { spring: Option.none(), sway: false };

/** The icon each stage is drawn with, on the field and at the end of a run: full corn as `corn`. */
export const DRAWN: Readonly<Record<Stage, HomeIcon>> = {
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

/** A pill of the field, outlined in ink, or filled in ink with `onInk` text when `strong`, the card's whole width and 52 pt tall when `wide`: at least 44 pt tall, named `label`, showing `shown` after an optional icon, disabled while a remove is pending. */
export function Control({
  label,
  shown,
  pending,
  onPress,
  strong = false,
  wide = false,
  icon,
  testID,
}: {
  readonly label: string;
  readonly shown: string;
  readonly pending: boolean;
  readonly onPress: () => void;
  readonly strong?: boolean;
  readonly wide?: boolean;
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
        wide && styles.wide,
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
function Drawing({ stage, motion }: { readonly stage: PlantStage; readonly motion: PlantMotion }) {
  const styles = useThemed(sheets);
  if (stage === 'not planted') return <View aria-hidden testID="plant-soil" style={styles.bare} />;
  return (
    <Moves motion={motion}>
      <Icon testID="plant-image" name={DRAWN[stage]} size={32} />
    </Moves>
  );
}

/** One plant: a button over its dot and its drawing, each hidden inside it, with no text. */
function Plot({
  plant,
  motion,
  chosen,
  onChoose,
}: {
  readonly plant: FurrowPlant;
  readonly motion: PlantMotion;
  readonly chosen: boolean;
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
      onPress={() => onChoose(plant.reference)}
      style={({ pressed }) => [styles.plot, chosen && styles.chosenPlot, pressed && look.pressed]}
    >
      {plant.ready && <View aria-hidden testID="dot" style={[styles.dot, styles.ready]} />}
      {!plant.ready && <View aria-hidden style={styles.dot} />}
      <Drawing stage={plant.stage} motion={motion} />
    </Pressable>
  );
}

/** What a list view's `Remove this list` takes away, named as its ask names it: a held passage by its range, or a planted Handbook list by its id. */
export type Removal =
  | { readonly _tag: 'Passage'; readonly name: string; readonly range: Range }
  | { readonly _tag: 'Handbook'; readonly name: string; readonly id: string };

/** The removal a list view's `Remove this list` offers, by its furrow's source: a passage named by its reference, a Handbook list by its title, and none for any other furrow. */
export const removalOf = (furrow: Furrow): Option.Option<Removal> =>
  Match.value(furrow.source).pipe(
    Match.tagsExhaustive({
      Own: () => Option.none<Removal>(),
      Passage: ({ range }) =>
        Option.some<Removal>({ _tag: 'Passage', name: passageReference(range), range }),
      Collection: () => Option.none<Removal>(),
      Handbook: ({ id }) => Option.some<Removal>({ _tag: 'Handbook', name: furrow.title, id }),
      Loose: () => Option.none<Removal>(),
    }),
  );

/** One furrow: its head (icon, then its title and caption as one button, `Open <title>`, with a chevron, which opens its list view), its plants, and its soil line. */
export function FurrowRow({
  furrow,
  motion,
  chosen,
  onChoose,
  onOpen,
}: {
  readonly furrow: Furrow;
  readonly motion: FurrowMotion;
  readonly chosen: Option.Option<string>;
  readonly onChoose: (reference: string) => void;
  readonly onOpen: (id: string) => void;
}) {
  const styles = useThemed(sheets);
  return (
    <View testID="row" style={styles.furrow}>
      <View style={styles.head}>
        <EnteringIcon delay={motion.icon}>
          <Icon testID="furrow-icon" name={furrow.icon} size={28} />
        </EnteringIcon>
        <Pressable
          role="button"
          aria-label={`Open ${furrow.title}`}
          onPress={() => onOpen(furrow.id)}
          style={({ pressed }) => [styles.open, pressed && styles.openPressed]}
        >
          <View style={styles.names}>
            <Text testID="row-title" style={styles.title}>
              {furrow.title}
            </Text>
            <Text testID="caption" style={styles.furrowCaption}>
              {furrow.caption}
            </Text>
          </View>
          <Text aria-hidden style={styles.chevron}>
            ›
          </Text>
        </Pressable>
      </View>
      <View style={styles.plots}>
        {furrow.plants.map((plant, index) => (
          <Plot
            key={index}
            plant={plant}
            motion={motion.plants[index] ?? STILL_PLANT}
            chosen={Option.contains(chosen, plant.reference)}
            onChoose={onChoose}
          />
        ))}
      </View>
      <View aria-hidden style={styles.soil} />
    </View>
  );
}

/** The field's rows share one motion plan per furrows value; only their icon and plant images move. */
export function Furrows({
  furrows,
  chosen,
  onChoose,
  onOpen,
}: {
  readonly furrows: readonly Furrow[];
  readonly chosen: Option.Option<string>;
  readonly onChoose: (reference: string) => void;
  readonly onOpen: (id: string) => void;
}) {
  const motion = useMemo(() => motionOf(furrows), [furrows]);
  return furrows.map((furrow, index) => (
    <FurrowRow
      key={index}
      furrow={furrow}
      motion={motion[index] ?? { icon: Option.none(), plants: [] }}
      chosen={chosen}
      onChoose={onChoose}
      onOpen={onOpen}
    />
  ));
}

/** The four stages as the plants draw them, named, hidden from the screen reader, over Mark 4:28. */
export function Legend() {
  const styles = useThemed(sheets);
  return (
    <View testID="legend" style={styles.legendPlace}>
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
    wide: { alignSelf: 'stretch', minHeight: 52 },
    pillText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    strongText: { color: color.onInk },
    furrow: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    open: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      borderRadius: 12,
    },
    openPressed: { backgroundColor: color.card },
    names: { flex: 1, gap: 2 },
    chevron: { fontFamily: face, fontSize: 22, fontWeight: '600', color: color.quiet },
    title: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    furrowCaption: { fontFamily: face, fontSize: 13, color: color.quiet },
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
    soil: { height: 2, borderRadius: 1, backgroundColor: color.furrow },
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
