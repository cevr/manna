/**
 * The field as home draws it, the app's home. Fixed above the scroll view
 * sit the greeting by the hour and one card (`./card`): the Today card
 * with the day's line and its one full-width button (`Start`, or
 * `Practice anyway` when nothing is due), or, with a verse chosen, the
 * chosen card with `Practice this verse` or `Learn this verse`. Nothing
 * else is fixed, so what starts a recital is the first and largest thing
 * on the screen.
 *
 * In the scroll view: the heading `Your field` with the days sown and the
 * harvest; the label `Lists` with `Add a list` while fewer than 3 passages
 * and lists are held together, else the limit line; one furrow per row
 * (`./plot`), whose title (`Open <title>`) opens the list's own page,
 * where a held list is removed; the legend under Mark 4:28; then the rows
 * `Settings`, which opens the Settings sheet (`../settings/sheet`) over
 * home, and `How Heartseed works`, which shows About.
 *
 * A tap on a plant chooses its verse, a tap on a plant of the chosen verse
 * lets it go, and a tap on another moves the choice: one verse at most, the
 * screen's own state, as is whether the sheet is open, both dropped when
 * the reader leaves. With the passages unread it offers no add. Home holds
 * no remove.
 */

import { Array as Arr, Option } from 'effect';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { LIMIT_LINE } from '../chooser';
import { harvestText, sownText, type Field } from '../field';
import type { Furrow, Greeting } from '../home';
import type { TodayCard } from '../home/today';
import { themed, useThemed } from '../look';
import { heldCount, MOST_PASSAGES, type PassagesView } from '../passages';
import { useLook } from '../sayit/draw';
import { SettingsSheet } from '../settings/sheet';
import { ChosenCard, TodayCardView, type Chosen, type StartKind } from './card';
import { Control, Furrows, Icon, Legend } from './plot';

/** The label `Lists` and what it offers with the passages read: `Add a list`, else the limit line at 3 held. */
function Lists({
  passages,
  onAdd,
}: {
  readonly passages: PassagesView;
  readonly onAdd: () => void;
}) {
  const styles = useThemed(sheets);
  const offers = passages._tag === 'Read' && heldCount(passages) < MOST_PASSAGES;
  const full = passages._tag === 'Read' && heldCount(passages) >= MOST_PASSAGES;
  return (
    <View style={styles.lists}>
      <Text style={styles.label}>Lists</Text>
      {offers && (
        <Control
          testID="add-list"
          label="Add a list"
          shown="Add a list"
          icon="add"
          pending={false}
          onPress={onAdd}
        />
      )}
      {full && (
        <Text testID="limit" style={styles.limit}>
          {LIMIT_LINE}
        </Text>
      )}
    </View>
  );
}

/** A row at the field's end: a button the width of the field, named and showing `label`. */
function EndRow({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID="end-row"
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.endRow, pressed && look.pressed]}
    >
      <Text style={styles.endText}>{label}</Text>
      <Text aria-hidden style={styles.endText}>
        ›
      </Text>
    </Pressable>
  );
}

/** The chosen verse as the chosen card shows it: none when no furrow holds it now. */
const chosenIn = (
  furrows: readonly Furrow[],
  chosen: Option.Option<string>,
  starts: (verse: string) => Option.Option<StartKind>,
): Option.Option<Chosen> =>
  Option.flatMap(chosen, (reference) =>
    Option.map(
      Arr.findFirst(
        furrows.flatMap((furrow) => furrow.plants),
        (plant) => plant.reference === reference,
      ),
      (plant): Chosen => ({ reference, stage: plant.stage, starts: starts(reference) }),
    ),
  );

/**
 * The field screen over `field` (its days sown and harvest), its `furrows`
 * and the reader's `passages`, greeting by `greeting`; the Today card
 * `card`, and on a chosen verse what `starts` gives it. `onToday` is
 * `Start`'s way to Today, `onStart` the way `Practice anyway`, `Practice
 * this verse` and `Learn this verse` start a verse, `onAdd` the way to the
 * Add a list sheet, `onAbout` the way to About and `onOpen` the way to a
 * furrow's list view, by its id.
 */
export function FieldScreen({
  field,
  furrows,
  passages,
  greeting,
  card,
  starts,
  onToday,
  onStart,
  onAdd,
  onAbout,
  onOpen,
}: {
  readonly field: Field;
  readonly furrows: readonly Furrow[];
  readonly passages: PassagesView;
  readonly greeting: Greeting;
  readonly card: TodayCard;
  readonly starts: (verse: string) => Option.Option<StartKind>;
  readonly onToday: () => void;
  readonly onStart: (verse: string) => void;
  readonly onAdd: () => void;
  readonly onAbout: () => void;
  readonly onOpen: (id: string) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const [choice, setChoice] = useState<Option.Option<string>>(Option.none());
  const [settings, setSettings] = useState(false);
  const chosen = chosenIn(furrows, choice, starts);
  const shownChoice = Option.map(chosen, (verse) => verse.reference);
  const onChoose = (reference: string) =>
    setChoice(
      Option.match(shownChoice, {
        onNone: () => Option.some(reference),
        onSome: (now) => Option.filter(Option.some(reference), (next) => next !== now),
      }),
    );
  return (
    <View style={look.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View testID="greeting" style={styles.greeting}>
          <Icon name={greeting.icon} size={28} />
          <Text style={styles.greetingText}>{greeting.words}</Text>
        </View>
        {Option.match(chosen, {
          onSome: (verse) => <ChosenCard verse={verse} pending={false} onStart={onStart} />,
          onNone: () => (
            <TodayCardView card={card} pending={false} onToday={onToday} onStart={onStart} />
          ),
        })}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + 24 },
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
        <Lists passages={passages} onAdd={onAdd} />
        <Furrows furrows={furrows} chosen={shownChoice} onChoose={onChoose} onOpen={onOpen} />
        <Legend />
        <View style={styles.ends}>
          <EndRow label="Settings" onPress={() => setSettings(true)} />
          <EndRow label="How Heartseed works" onPress={onAbout} />
        </View>
      </ScrollView>
      {settings && <SettingsSheet onDone={() => setSettings(false)} onAbout={onAbout} />}
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    top: { paddingHorizontal: 24, paddingBottom: 8, gap: 12 },
    scroll: { flex: 1 },
    content: { gap: 16 },
    greeting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    greetingText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.sun },
    head: { gap: 6 },
    lists: { gap: 8 },
    label: { fontFamily: face, fontSize: 13, fontWeight: '600', color: color.ink },
    limit: { fontFamily: face, fontSize: 15, lineHeight: 21, color: color.ink },
    ends: { gap: 8, marginTop: 8 },
    endRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: color.card,
    },
    endText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
  }),
);
