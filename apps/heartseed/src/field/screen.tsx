/**
 * The field as home draws it, the app's home. Fixed above the scroll view
 * sit the greeting by the hour and one card (`./card`): the Today card
 * with the day's line and its one full-width button (`Start`, or
 * `Practice anyway` when nothing is due), or, with a verse chosen, the
 * chosen card with `Practice this verse` or `Learn this verse`, or, while
 * a furrow's `Remove` (a held passage's or a planted list's) asks, the ask
 * with `Remove` and `Keep`; a remove that does not land leaves an alert
 * under it. Nothing else is fixed, so what starts a recital is the first
 * and largest thing on the screen.
 *
 * In the scroll view: the heading `Your field` with the days sown and the
 * harvest; the label `Lists` with `Add a list` while fewer than 3 passages
 * and lists are held together, else the limit line; one furrow per row
 * (`./plot`); the legend under Mark 4:28; then the rows `Settings`, which
 * opens the Settings sheet (`../settings/sheet`) over home, and `How
 * Heartseed works`, which shows About.
 *
 * A tap on a plant chooses its verse, a tap on a plant of the chosen verse
 * lets it go, and a tap on another moves the choice: one verse at most, the
 * screen's own state, as are the ask, the alert and whether the sheet is
 * open, all dropped when the reader leaves. With the passages unread it
 * offers no add and no remove. From a tap of the ask's `Remove` until its
 * answer, no tap of a field control changes anything, even two in one
 * turn, and each shows as disabled.
 */

import { useAtomSet } from '@effect/atom-react';
import { Array as Arr, Match, Option } from 'effect';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { uprootList, uprootPassage } from '../app';
import { LIMIT_LINE } from '../chooser';
import { harvestText, sownText, type Field } from '../field';
import type { Furrow, Greeting } from '../home';
import type { TodayCard } from '../home/today';
import { themed, useThemed } from '../look';
import { heldCount, MOST_PASSAGES, type PassagesView } from '../passages';
import { useLook } from '../sayit/draw';
import { SettingsSheet } from '../settings/sheet';
import { ChosenCard, TodayCardView, type Chosen, type StartKind } from './card';
import { Control, Furrows, Icon, Legend, type Removal } from './plot';

/** The screen's remove state: the passage or list a furrow's `Remove` asks about, the alert of a remove that did not land, and whether a remove is pending. */
interface Bar {
  readonly ask: Option.Option<Removal>;
  readonly alert: Option.Option<string>;
  readonly pending: boolean;
}

const IDLE: Bar = { ask: Option.none(), alert: Option.none(), pending: false };

/** The alert a remove's answer leaves: none once `Removed`, else that the passage or list was not removed. */
const alertAfter = (answer: string, removal: Removal): Option.Option<string> => {
  if (answer === 'Removed') return Option.none();
  return Option.some(`${removal.name} was not removed. Try again.`);
};

/** Whether the field offers `Add a list`: the passages read, no ask showing, and fewer than 3 passages and lists held together. */
const offersAdd = (passages: PassagesView, bar: Bar) =>
  passages._tag === 'Read' && Option.isNone(bar.ask) && heldCount(passages) < MOST_PASSAGES;

/** The ask a furrow's `Remove` puts in the card's place, with `Remove` and `Keep`. */
function Ask({
  removal,
  pending,
  onConfirm,
  onKeep,
}: {
  readonly removal: Removal;
  readonly pending: boolean;
  readonly onConfirm: (removal: Removal) => void;
  readonly onKeep: () => void;
}) {
  const styles = useThemed(sheets);
  return (
    <View style={styles.ask}>
      <Text testID="ask" style={styles.line}>
        {`Remove ${removal.name}? Its plants stay in your field.`}
      </Text>
      <View style={styles.answers}>
        <Control
          label="Remove"
          shown="Remove"
          pending={pending}
          onPress={() => onConfirm(removal)}
        />
        <Control label="Keep" shown="Keep" pending={pending} onPress={onKeep} />
      </View>
    </View>
  );
}

/** The label `Lists` and what it offers with the passages read: `Add a list`, else the limit line at 3 held, else nothing while an ask shows. */
function Lists({
  passages,
  bar,
  onAdd,
}: {
  readonly passages: PassagesView;
  readonly bar: Bar;
  readonly onAdd: () => void;
}) {
  const styles = useThemed(sheets);
  const full =
    passages._tag === 'Read' && Option.isNone(bar.ask) && heldCount(passages) >= MOST_PASSAGES;
  return (
    <View style={styles.lists}>
      <Text style={styles.label}>Lists</Text>
      {offersAdd(passages, bar) && (
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
function EndRow({
  label,
  pending,
  onPress,
}: {
  readonly label: string;
  readonly pending: boolean;
  readonly onPress: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID="end-row"
      role="button"
      aria-label={label}
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [styles.endRow, pressed && look.pressed, pending && look.disabled]}
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
 * Add a list sheet and `onAbout` the way to About.
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
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const [bar, setBar] = useState<Bar>(IDLE);
  const [choice, setChoice] = useState<Option.Option<string>>(Option.none());
  const [settings, setSettings] = useState(false);
  const busy = useRef(false);
  const uproot = useAtomSet(uprootPassage, { mode: 'promise' });
  const uprootPlanted = useAtomSet(uprootList, { mode: 'promise' });
  /** The remove `removal` names, run by its kind: a passage by its range, a list by its id. */
  const removeOf = Match.type<Removal>().pipe(
    Match.tagsExhaustive({
      Passage: ({ range }): Promise<string> => uproot(range),
      Handbook: ({ id }): Promise<string> => uprootPlanted(id),
    }),
  );
  const chosen = chosenIn(furrows, choice, starts);
  const shownChoice = Option.map(chosen, (verse) => verse.reference);
  /** A tap of a field control: nothing while a remove is pending, else the alert clears and `then` runs. */
  const tapped = (then: () => void) => {
    if (busy.current) return;
    setBar((now) => ({ ...now, alert: Option.none() }));
    then();
  };
  const onChoose = (reference: string) =>
    tapped(() =>
      setChoice(
        Option.match(shownChoice, {
          onNone: () => Option.some(reference),
          onSome: (now) => Option.filter(Option.some(reference), (next) => next !== now),
        }),
      ),
    );
  const onRemove = (removal: Removal) =>
    tapped(() => setBar({ ask: Option.some(removal), alert: Option.none(), pending: false }));
  const onConfirm = (removal: Removal) => {
    if (busy.current) return;
    busy.current = true;
    setBar((now) => ({ ...now, pending: true }));
    const settle = (answer: string) => {
      busy.current = false;
      setBar({ ask: Option.none(), alert: alertAfter(answer, removal), pending: false });
    };
    void removeOf(removal).then(settle, () => settle('Failed'));
  };
  const start = (verse: string) => tapped(() => onStart(verse));
  return (
    <View style={look.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View testID="greeting" style={styles.greeting}>
          <Icon name={greeting.icon} size={28} />
          <Text style={styles.greetingText}>{greeting.words}</Text>
        </View>
        {Option.match(bar.ask, {
          onSome: (removal) => (
            <Ask
              removal={removal}
              pending={bar.pending}
              onConfirm={onConfirm}
              onKeep={() => tapped(() => setBar(IDLE))}
            />
          ),
          onNone: () =>
            Option.match(chosen, {
              onSome: (verse) => <ChosenCard verse={verse} pending={bar.pending} onStart={start} />,
              onNone: () => (
                <TodayCardView
                  card={card}
                  pending={bar.pending}
                  onToday={() => tapped(onToday)}
                  onStart={start}
                />
              ),
            }),
        })}
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
        <Lists passages={passages} bar={bar} onAdd={() => tapped(onAdd)} />
        <Furrows
          furrows={furrows}
          chosen={shownChoice}
          pending={bar.pending}
          onChoose={onChoose}
          onRemove={onRemove}
        />
        <Legend />
        <View style={styles.ends}>
          <EndRow
            label="Settings"
            pending={bar.pending}
            onPress={() => tapped(() => setSettings(true))}
          />
          <EndRow
            label="How Heartseed works"
            pending={bar.pending}
            onPress={() => tapped(onAbout)}
          />
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
    line: { fontFamily: face, fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
    ask: { gap: 8 },
    answers: { flexDirection: 'row', gap: 8 },
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
