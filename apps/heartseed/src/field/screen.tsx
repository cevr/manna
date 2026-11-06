/**
 * The field as the reader meets it. A bar fixed above the scroll view holds
 * the way back to Today and, with the reader's passages read, `Add a
 * passage` while fewer than 3 are held, else the limit line; a row's
 * `Remove` puts its ask there instead, with `Remove` and `Keep`, and a
 * remove that does not land leaves an alert there. So however long the
 * field, they are on screen without a scroll. Under the bar scroll the
 * heading, the days sown and the harvest, one card per row titled by its
 * passage, each verse a plant drawn as Today draws its stage with its verse
 * number small beneath, and a legend of the four stages under Mark 4:28.
 * Each plant is one image to the screen reader, labelled `<reference>,
 * <stage>`; its drawing and number are hidden inside it. Each row of a
 * passage the reader chose, and no other, holds its own `Remove`. Every
 * text is Palette A's ink, so each reads at WCAG AA contrast on the ground
 * and on a card.
 *
 * The field it draws is derived from what it is given; the ask and the
 * alert are the screen's own state, dropped when the reader leaves. With
 * the passages unread it offers no add and no remove. From a tap of the
 * ask's `Remove` until its answer, no tap of a field control changes
 * anything, even two in one turn, and each shows as disabled.
 */

import { useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { uprootPassage } from '../app';
import { LIMIT_LINE } from '../chooser';
import {
  harvestText,
  sownText,
  verseNumberOf,
  type Field,
  type FieldPlant,
  type FieldRow,
} from '../field';
import { STAGES } from '../garden';
import { MOST_PASSAGES, passageReference, type PassagesView, type Range } from '../passages';
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
function Row({
  row,
  pending,
  onRemove,
}: {
  readonly row: FieldRow;
  readonly pending: boolean;
  readonly onRemove: (range: Range) => void;
}) {
  return (
    <View testID="row" style={styles.card}>
      <View style={styles.rowHead}>
        <Text testID="row-title" style={styles.title}>
          {row.title}
        </Text>
        {Option.match(Option.fromUndefinedOr(row.range), {
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

/** A pill of the field, outlined in ink so it shows on the ground and on a card: at least 44 pt tall, named `label`, showing `shown`, disabled while a remove is pending. */
function Control({
  label,
  shown,
  pending,
  onPress,
}: {
  readonly label: string;
  readonly shown: string;
  readonly pending: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && look.pressed, pending && look.disabled]}
    >
      <Text style={styles.pillText}>{shown}</Text>
    </Pressable>
  );
}

/** The bar's own state: the passage a row's `Remove` asks about, the alert of a remove that did not land, and whether a remove is pending. */
interface Bar {
  readonly ask: Option.Option<Range>;
  readonly alert: Option.Option<string>;
  readonly pending: boolean;
}

const IDLE: Bar = { ask: Option.none(), alert: Option.none(), pending: false };

/** The alert a remove's answer leaves: none once `Removed`, else that the range was not removed. */
const alertAfter = (answer: string, range: Range): Option.Option<string> => {
  if (answer === 'Removed') return Option.none();
  return Option.some(`${passageReference(range)} was not removed. Try again.`);
};

/** What the bar offers after `‹ Today` with the passages read: the ask while one shows, else `Add a passage` under 3 held, else the limit line. */
function Offer({
  bar,
  held,
  onAdd,
  onConfirm,
  onKeep,
}: {
  readonly bar: Bar;
  readonly held: number;
  readonly onAdd: () => void;
  readonly onConfirm: (range: Range) => void;
  readonly onKeep: () => void;
}) {
  return Option.match(bar.ask, {
    onSome: (range) => (
      <View style={styles.ask}>
        <Text testID="ask" style={styles.line}>
          {`Remove ${passageReference(range)}? Its plants stay in your field.`}
        </Text>
        <View style={styles.answers}>
          <Control
            label="Remove"
            shown="Remove"
            pending={bar.pending}
            onPress={() => onConfirm(range)}
          />
          <Control label="Keep" shown="Keep" pending={bar.pending} onPress={onKeep} />
        </View>
      </View>
    ),
    onNone: () => {
      if (held >= MOST_PASSAGES)
        return (
          <Text testID="limit" style={styles.line}>
            {LIMIT_LINE}
          </Text>
        );
      return (
        <Control label="Add a passage" shown="Add a passage" pending={false} onPress={onAdd} />
      );
    },
  });
}

/**
 * The field screen over `field` and the reader's `passages`, with the way
 * back to Today and, over passages read, the way to the chooser (`onAdd`).
 */
export function FieldScreen({
  field,
  passages,
  onToday,
  onAdd,
}: {
  readonly field: Field;
  readonly passages: PassagesView;
  readonly onToday: () => void;
  readonly onAdd: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [bar, setBar] = useState<Bar>(IDLE);
  const busy = useRef(false);
  const uproot = useAtomSet(uprootPassage, { mode: 'promise' });
  /** A tap of a field control: nothing while a remove is pending, else the alert clears and `then` runs. */
  const tapped = (then: () => void) => {
    if (busy.current) return;
    setBar((now) => ({ ...now, alert: Option.none() }));
    then();
  };
  const onRemove = (range: Range) =>
    tapped(() => setBar({ ask: Option.some(range), alert: Option.none(), pending: false }));
  const onConfirm = (range: Range) => {
    if (busy.current) return;
    busy.current = true;
    setBar((now) => ({ ...now, pending: true }));
    const settle = (answer: string) => {
      busy.current = false;
      setBar({ ask: Option.none(), alert: alertAfter(answer, range), pending: false });
    };
    void uproot(range).then(settle, () => settle('Failed'));
  };
  return (
    <View style={look.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 16 }]}>
        <Pressable
          role="button"
          aria-label="Today"
          hitSlop={10}
          disabled={bar.pending}
          onPress={() => tapped(onToday)}
          style={({ pressed }) => [styles.back, pressed && look.pressed]}
        >
          <Text style={styles.backText}>‹ Today</Text>
        </Pressable>
        {passages._tag === 'Read' && (
          <Offer
            bar={bar}
            held={passages.passages.length}
            onAdd={() => tapped(onAdd)}
            onConfirm={onConfirm}
            onKeep={() => tapped(() => setBar(IDLE))}
          />
        )}
        {Option.match(bar.alert, {
          onNone: () => false,
          onSome: (alert) => (
            <Text role="alert" testID="remove-alert" style={styles.line}>
              {alert}
            </Text>
          ),
        })}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + 32 },
        ]}
      >
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
          <Row key={index} row={row} pending={bar.pending} onRemove={onRemove} />
        ))}
        <Legend />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 24, paddingBottom: 8, gap: 8 },
  scroll: { flex: 1 },
  content: { gap: 16 },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 17, fontWeight: '600', color: color.ink },
  pill: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: color.ink,
    justifyContent: 'center',
  },
  pillText: { fontSize: 15, fontWeight: '600', color: color.ink },
  line: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
  ask: { gap: 8 },
  answers: { flexDirection: 'row', gap: 8 },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
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
