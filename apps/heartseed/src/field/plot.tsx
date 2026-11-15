/**
 * The field's furrows as home draws them. A furrow's head holds its title
 * (never a heading: a reference may spell `Your field` or `Today`, and the
 * field holds one heading, its own) and its caption (`captionOf`) inside
 * one button, `Open <title>`, at least 44 pt tall, with a chevron hidden
 * from the screen reader, and no icon: its tap opens the list's own page,
 * where a held passage or Handbook list is removed and each verse's stage
 * is drawn. Under it, its plants, then a soil line. Each plant is one
 * button named `<reference>, <stage>` (then `, ready today`), whose tap
 * starts its verse (`./screen`); inside it, hidden from the screen reader,
 * the gold dot of a plant ready today over a dash, `ink` once planted and
 * `soil` before, and no text or image. A pressed plant or title is filled
 * `hearing`. Nothing moves. Every text is a text role of the scheme, and
 * every fill a role.
 */

import { Match, Option } from 'effect';
import { Fragment, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Stage } from '../garden';
import type { Furrow, FurrowPlant, HomeIcon } from '../home';
import { ICON_IMAGES } from '../home/icons';
import { themed, useScheme, useThemed } from '../look';
import { passageReference, type Range } from '../passages';
import { useLook } from '../sayit/draw';

/** The icon each stage is drawn with, on a list's page and at the end of a run: full corn as `corn`. */
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

/** One plant: a button over its dot and its dash, each hidden inside it, with no text; filled `hearing` while pressed. */
function Plot({
  plant,
  onPlant,
}: {
  readonly plant: FurrowPlant;
  readonly onPlant: (reference: string) => void;
}) {
  const styles = useThemed(sheets);
  const planted = plant.stage !== 'not planted';
  return (
    <Pressable
      testID="field-plant"
      role="button"
      aria-label={plant.label}
      onPress={() => onPlant(plant.reference)}
      style={({ pressed }) => [styles.plot, pressed && styles.pressed]}
    >
      {plant.ready && <View aria-hidden testID="dot" style={[styles.dot, styles.ready]} />}
      {!plant.ready && <View aria-hidden style={styles.dot} />}
      {planted && <View aria-hidden testID="plant-sown" style={[styles.dash, styles.sown]} />}
      {!planted && <View aria-hidden testID="plant-soil" style={[styles.dash, styles.bare]} />}
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

/** One furrow: its head (its title and caption as one button, `Open <title>`, with a chevron, which opens its list view, filled `hearing` while pressed), its plants, and its soil line. */
function FurrowRow({
  furrow,
  onPlant,
  onOpen,
}: {
  readonly furrow: Furrow;
  readonly onPlant: (reference: string) => void;
  readonly onOpen: (id: string) => void;
}) {
  const styles = useThemed(sheets);
  return (
    <View testID="row" style={styles.furrow}>
      <Pressable
        role="button"
        aria-label={`Open ${furrow.title}`}
        onPress={() => onOpen(furrow.id)}
        style={({ pressed }) => [styles.open, pressed && styles.pressed]}
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
      <View style={styles.plots}>
        {furrow.plants.map((plant, index) => (
          <Plot key={index} plant={plant} onPlant={onPlant} />
        ))}
      </View>
      <View aria-hidden style={styles.soil} />
    </View>
  );
}

/** The field's rows, in order; `underFirst` sits directly under the first row. */
export function Furrows({
  furrows,
  onPlant,
  onOpen,
  underFirst,
}: {
  readonly furrows: readonly Furrow[];
  readonly onPlant: (reference: string) => void;
  readonly onOpen: (id: string) => void;
  readonly underFirst?: ReactNode;
}) {
  return furrows.map((furrow, index) => (
    <Fragment key={index}>
      <FurrowRow furrow={furrow} onPlant={onPlant} onOpen={onOpen} />
      {index === 0 && underFirst}
    </Fragment>
  ));
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
    open: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      borderRadius: 12,
    },
    pressed: { backgroundColor: color.hearing },
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
    dot: { width: 8, height: 8, borderRadius: 4 },
    ready: { backgroundColor: color.sun },
    dash: { width: 24, height: 3, marginVertical: 14, borderRadius: 1.5 },
    sown: { backgroundColor: color.ink },
    bare: { backgroundColor: color.soil },
    soil: { height: 2, borderRadius: 1, backgroundColor: color.furrow },
  }),
);
