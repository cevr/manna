/**
 * The field as home A draws it, the app's home. A bar fixed above the scroll
 * view holds, in its first row, `When I need…` once a plan is made in this
 * launch and, at the row's end, the gear `Settings`, an icon alone at least
 * 44 pt square, which opens the Settings sheet (`../settings/sheet`) over
 * home; under that row, with the reader's passages read, `Add verses`
 * while fewer than 3 passages and lists are held together, else the limit
 * line; a furrow's `Remove` (a held passage's or a planted list's) puts
 * its ask there instead, with `Remove` and `Keep`, and a remove that does
 * not land leaves an alert there. Under the bar scroll the greeting by
 * the hour, the heading, the days sown and the harvest, a hint, one furrow
 * per row (`./plot`), the dashed `Add verses` row whenever the bar offers
 * it, and the legend under Mark 4:28. A foot fixed under the scroll view
 * (`./foot`) holds the Begin card or, with a verse chosen, the chosen card
 * with `Start here`. So every control but the plants, a furrow's `Remove`
 * and the row is on screen without a scroll.
 *
 * A tap on a plant chooses its verse, a tap on a plant of the chosen verse
 * lets it go, and a tap on another moves the choice: one verse at most, the
 * screen's own state, as are the ask, the alert and whether the sheet is
 * open, all dropped when the reader leaves. The sheet's `About` shows
 * About. With the passages unread it offers no add and no remove.
 * From a tap of the ask's `Remove` until its answer, no tap of a field
 * control changes anything, even two in one turn, and each shows as
 * disabled.
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
import { themed, useThemed } from '../look';
import { heldCount, MOST_PASSAGES, type PassagesView } from '../passages';
import { useLook } from '../sayit/draw';
import { SettingsSheet } from '../settings/sheet';
import { Foot, type Chosen } from './foot';
import { AddRow, Control, Furrows, Icon, Legend, type Removal } from './plot';

/** The bar's own state: the passage or list a furrow's `Remove` asks about, the alert of a remove that did not land, and whether a remove is pending. */
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

/** Whether the bar offers `Add verses`: the passages read, no ask showing, and fewer than 3 passages and lists held together. */
const offersAdd = (passages: PassagesView, bar: Bar) =>
  passages._tag === 'Read' && Option.isNone(bar.ask) && heldCount(passages) < MOST_PASSAGES;

/** What the bar offers after `When I need…` with the passages read: the ask while one shows, else `Add verses` under 3 held, else the limit line. */
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
  readonly onConfirm: (removal: Removal) => void;
  readonly onKeep: () => void;
}) {
  const styles = useThemed(sheets);
  return Option.match(bar.ask, {
    onSome: (removal) => (
      <View style={styles.ask}>
        <Text testID="ask" style={styles.line}>
          {`Remove ${removal.name}? Its plants stay in your field.`}
        </Text>
        <View style={styles.answers}>
          <Control
            label="Remove"
            shown="Remove"
            pending={bar.pending}
            onPress={() => onConfirm(removal)}
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
        <Control
          testID="add-verses"
          label="Add verses"
          shown="Add verses"
          icon="add"
          pending={false}
          onPress={onAdd}
        />
      );
    },
  });
}

/** The chosen verse as the foot shows it: none when no furrow holds it now. */
const chosenIn = (
  furrows: readonly Furrow[],
  chosen: Option.Option<string>,
  startable: (verse: string) => boolean,
): Option.Option<Chosen> =>
  Option.flatMap(chosen, (reference) =>
    Option.map(
      Arr.findFirst(
        furrows.flatMap((furrow) => furrow.plants),
        (plant) => plant.reference === reference,
      ),
      (plant): Chosen => ({
        reference,
        stage: plant.stage,
        startable: startable(reference),
      }),
    ),
  );

/**
 * The field screen over `field` (its days sown and harvest), its `furrows`
 * and the reader's `passages`, greeting by `greeting`; the foot's counts
 * line `counts` (none before a plan), `Begin` when `begin`, and `Start here`
 * on a chosen verse `startable` offers, and `When I need…` when `need`.
 * `onToday` is `Begin`'s way to Today, `onStart` Start here's, `onNeed` the
 * way to When I need…, `onAdd` the way to the chooser and `onAbout` the
 * sheet's way to About.
 */
export function FieldScreen({
  field,
  furrows,
  passages,
  greeting,
  counts,
  begin,
  need,
  startable,
  onToday,
  onNeed,
  onStart,
  onAdd,
  onAbout,
}: {
  readonly field: Field;
  readonly furrows: readonly Furrow[];
  readonly passages: PassagesView;
  readonly greeting: Greeting;
  readonly counts: Option.Option<string>;
  readonly begin: boolean;
  readonly need: boolean;
  readonly startable: (verse: string) => boolean;
  readonly onToday: () => void;
  readonly onNeed: () => void;
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
  const chosen = chosenIn(furrows, choice, startable);
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
  return (
    <View style={look.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 16 }]}>
        <View style={styles.top}>
          {need && (
            <Pressable
              role="button"
              aria-label="When I need…"
              hitSlop={10}
              disabled={bar.pending}
              onPress={() => tapped(onNeed)}
              style={({ pressed }) => [
                styles.need,
                pressed && look.pressed,
                bar.pending && look.disabled,
              ]}
            >
              <Text style={styles.needText}>When I need…</Text>
            </Pressable>
          )}
          <Pressable
            role="button"
            aria-label="Settings"
            hitSlop={10}
            disabled={bar.pending}
            onPress={() => tapped(() => setSettings(true))}
            style={({ pressed }) => [
              styles.gear,
              pressed && look.pressed,
              bar.pending && look.disabled,
            ]}
          >
            <Icon name="gear" size={28} />
          </Pressable>
        </View>
        {passages._tag === 'Read' && (
          <Offer
            bar={bar}
            held={heldCount(passages)}
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
        contentContainerStyle={[look.content, styles.content, { paddingTop: 8, paddingBottom: 24 }]}
      >
        <View testID="greeting" style={styles.greeting}>
          <Icon name={greeting.icon} size={28} />
          <Text style={styles.greetingText}>{greeting.words}</Text>
        </View>
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
        <Text testID="hint" style={styles.hint}>
          A gold dot marks a plant ready today. Tap one to start there.
        </Text>
        <Furrows
          furrows={furrows}
          chosen={shownChoice}
          pending={bar.pending}
          onChoose={onChoose}
          onRemove={onRemove}
        />
        {offersAdd(passages, bar) && <AddRow onAdd={() => tapped(onAdd)} />}
        <Legend />
      </ScrollView>
      <Foot
        chosen={chosen}
        counts={counts}
        begin={begin}
        pending={bar.pending}
        onBegin={() => tapped(onToday)}
        onStart={(reference) => tapped(() => onStart(reference))}
      />
      {settings && <SettingsSheet onDone={() => setSettings(false)} onAbout={onAbout} />}
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    bar: { paddingHorizontal: 24, paddingBottom: 8, gap: 8 },
    scroll: { flex: 1 },
    content: { gap: 16 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
    need: { marginRight: 'auto', minHeight: 44, justifyContent: 'center' },
    gear: {
      minWidth: 44,
      minHeight: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    needText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    line: { fontFamily: face, fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
    ask: { gap: 8 },
    answers: { flexDirection: 'row', gap: 8 },
    greeting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    greetingText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.sun },
    head: { gap: 6 },
    hint: { fontFamily: face, fontSize: 13, lineHeight: 18, color: color.quiet },
  }),
);
