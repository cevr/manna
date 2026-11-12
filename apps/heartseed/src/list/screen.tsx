/**
 * A list's own page (hslist L3, L4), opened by its title on home. Fixed
 * above the scroll view: the one way back, `‹ Your field`; the list's icon
 * and title as the screen's one heading; its caption (`listCaptionOf`);
 * and, when `Practice this list` starts something (`listStartOf`), that
 * filled, full-width button with the line under it saying what it starts.
 *
 * In the scroll view: one row per plant of the list, in the list's order,
 * each its drawing (its stage's icon, or bare soil; the gold dot when ready
 * today), its full reference, its stage in words and, when a tap starts its
 * verse, a chevron: then the row is one button named as home's plant is
 * (`<reference>, <stage>`, then `, ready today`); else it is text alone,
 * so every button does something. Then, for a passage or a Handbook list
 * the reader holds, with the passages read, `Remove this list` (named
 * `Remove <name>`) with `Its plants stay in your field.` under it.
 *
 * A tap of `Remove this list` puts the ask in its place, `Remove <name>?
 * Its plants stay in your field.` with `Remove` and `Keep`. From a tap of
 * the ask's `Remove` until its answer, no tap of any control here changes
 * anything, even two in one turn, and each shows as disabled. `Removed`
 * hands the reader back to home (`onRemoved`); any other answer drops the
 * ask and leaves the alert `<name> was not removed. Try again.` where it
 * was, until the next tap. The ask, the alert and the pending state are the
 * screen's own, dropped when it is left. No verse's words show here.
 */

import { useAtomSet } from '@effect/atom-react';
import { Match, Option } from 'effect';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { uprootList, uprootPassage } from '../app';
import type { PlantStage } from '../field';
import { Control, DRAWN, Icon, type Removal } from '../field/plot';
import type { Furrow, FurrowPlant } from '../home';
import { listCaptionOf, listLineOf, type ListStart } from '../list';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';

/** Each stage as a list row says it. */
const STAGE_SHOWN: Readonly<Record<PlantStage, string>> = {
  seed: 'A seed',
  blade: 'A blade',
  ear: 'An ear',
  'full corn': 'Full corn',
  'not planted': 'Not planted yet',
};

/** A row's stage in words, then ` · ready today` when the plan holds its verse open. */
const stageWords = (plant: FurrowPlant) => {
  if (plant.ready) return `${STAGE_SHOWN[plant.stage]} · ready today`;
  return STAGE_SHOWN[plant.stage];
};

/** The screen's remove state: whether the ask shows, the alert of a remove that did not land, and whether a remove is pending. */
interface Bar {
  readonly asking: boolean;
  readonly alert: Option.Option<string>;
  readonly pending: boolean;
}

const IDLE: Bar = { asking: false, alert: Option.none(), pending: false };

/** The way back to home, fixed above the scroll view. */
function Back({ pending, onPress }: { readonly pending: boolean; readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      role="button"
      aria-label="Your field"
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && look.pressed, pending && look.disabled]}
    >
      <Text style={styles.backText}>‹ Your field</Text>
    </Pressable>
  );
}

/** A plant's drawing, hidden from the screen reader: the gold dot when ready, and its stage's icon or bare soil. */
function Drawing({ plant }: { readonly plant: FurrowPlant }) {
  const styles = useThemed(sheets);
  return (
    <View aria-hidden style={styles.drawing}>
      {plant.ready && <View testID="dot" style={[styles.dot, styles.ready]} />}
      {!plant.ready && <View style={styles.dot} />}
      {plant.stage === 'not planted' && <View testID="plant-soil" style={styles.bare} />}
      {plant.stage !== 'not planted' && (
        <Icon testID="plant-image" name={DRAWN[plant.stage]} size={32} />
      )}
    </View>
  );
}

/** One plant's row: its drawing, reference and stage in words; a button named as home's plant is, with a chevron, when a tap starts its verse. */
function Row({
  plant,
  starts,
  pending,
  onStart,
}: {
  readonly plant: FurrowPlant;
  readonly starts: boolean;
  readonly pending: boolean;
  readonly onStart: (verse: string) => void;
}) {
  const styles = useThemed(sheets);
  const words = (
    <>
      <Drawing plant={plant} />
      <View style={styles.names}>
        <Text testID="list-reference" style={styles.reference}>
          {plant.reference}
        </Text>
        <Text testID="list-stage" style={styles.stage}>
          {stageWords(plant)}
        </Text>
      </View>
    </>
  );
  if (!starts)
    return (
      <View testID="list-row" style={styles.row}>
        {words}
      </View>
    );
  return (
    <Pressable
      testID="list-row"
      role="button"
      aria-label={plant.label}
      disabled={pending}
      onPress={() => onStart(plant.reference)}
      style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}
    >
      {words}
      <Text aria-hidden style={styles.chevron}>
        ›
      </Text>
    </Pressable>
  );
}

/** `Remove this list` and the line under it, or the ask in its place, then the alert of a remove that did not land. */
function RemoveArea({
  removal,
  bar,
  onRemove,
  onConfirm,
  onKeep,
}: {
  readonly removal: Removal;
  readonly bar: Bar;
  readonly onRemove: () => void;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
}) {
  const styles = useThemed(sheets);
  return (
    <View style={styles.remove}>
      {bar.asking && (
        <View style={styles.ask}>
          <Text testID="ask" style={styles.line}>
            {`Remove ${removal.name}? Its plants stay in your field.`}
          </Text>
          <View style={styles.answers}>
            <Control label="Remove" shown="Remove" pending={bar.pending} onPress={onConfirm} />
            <Control label="Keep" shown="Keep" pending={bar.pending} onPress={onKeep} />
          </View>
        </View>
      )}
      {!bar.asking && (
        <>
          <Pressable
            role="button"
            aria-label={`Remove ${removal.name}`}
            disabled={bar.pending}
            onPress={onRemove}
            style={({ pressed }) => [styles.removeRow, pressed && styles.pressedRow]}
          >
            <Text style={styles.removeText}>Remove this list</Text>
          </Pressable>
          <Text style={styles.stays}>Its plants stay in your field.</Text>
        </>
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
  );
}

/**
 * The list view over `furrow`: `start` is what `Practice this list` starts
 * and `starts` whether a tap starts a verse; `removal` is the list's remove
 * (none for a list the reader does not hold, or with the passages unread).
 * `onField` is the way back, `onPractice` runs `Practice this list`,
 * `onStart` a row's tap, and `onRemoved` hands the reader home once a
 * remove lands.
 */
export function ListScreen({
  furrow,
  start,
  starts,
  removal,
  onField,
  onPractice,
  onStart,
  onRemoved,
}: {
  readonly furrow: Furrow;
  readonly start: ListStart;
  readonly starts: (verse: string) => boolean;
  readonly removal: Option.Option<Removal>;
  readonly onField: () => void;
  readonly onPractice: () => void;
  readonly onStart: (verse: string) => void;
  readonly onRemoved: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const [bar, setBar] = useState<Bar>(IDLE);
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
  /** A tap of a control here: nothing while a remove is pending, else the alert clears and `then` runs. */
  const tapped = (then: () => void) => {
    if (busy.current) return;
    setBar((now) => ({ ...now, alert: Option.none() }));
    then();
  };
  const onConfirm = (each: Removal) => {
    if (busy.current) return;
    busy.current = true;
    setBar((now) => ({ ...now, pending: true }));
    const settle = (answer: string) => {
      busy.current = false;
      if (answer === 'Removed') return onRemoved();
      setBar({
        asking: false,
        alert: Option.some(`${each.name} was not removed. Try again.`),
        pending: false,
      });
    };
    void removeOf(each).then(settle, () => settle('Failed'));
  };
  const line = listLineOf(start);
  return (
    <View testID="list-screen" style={look.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View style={styles.backRow}>
          <Back pending={bar.pending} onPress={() => tapped(onField)} />
        </View>
        <View style={styles.titleRow}>
          <Icon name={furrow.icon} size={32} />
          <Text role="heading" aria-level={1} style={[look.title, styles.title]}>
            {furrow.title}
          </Text>
        </View>
        <Text testID="list-caption" style={styles.caption}>
          {listCaptionOf(furrow.plants)}
        </Text>
        {Option.match(line, {
          onNone: () => false,
          onSome: (words) => (
            <View style={styles.practice}>
              <Control
                label="Practice this list"
                shown="Practice this list"
                strong
                wide
                pending={bar.pending}
                onPress={() => tapped(onPractice)}
              />
              <Text testID="list-line" style={styles.caption}>
                {words}
              </Text>
            </View>
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
        {furrow.plants.map((plant, index) => (
          <Row
            key={index}
            plant={plant}
            starts={starts(plant.reference)}
            pending={bar.pending}
            onStart={(verse) => tapped(() => onStart(verse))}
          />
        ))}
        {Option.match(removal, {
          onNone: () => false,
          onSome: (each) => (
            <RemoveArea
              removal={each}
              bar={bar}
              onRemove={() => tapped(() => setBar({ ...IDLE, asking: true }))}
              onConfirm={() => onConfirm(each)}
              onKeep={() => tapped(() => setBar(IDLE))}
            />
          ),
        })}
      </ScrollView>
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    top: { paddingHorizontal: 24, paddingBottom: 8, gap: 10 },
    backRow: { flexDirection: 'row' },
    back: {
      minHeight: 44,
      paddingHorizontal: 20,
      borderRadius: 22,
      justifyContent: 'center',
      backgroundColor: color.card,
    },
    backText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { flexShrink: 1 },
    caption: { fontFamily: face, fontSize: 15, color: color.quiet },
    practice: { gap: 6, marginTop: 4 },
    scroll: { flex: 1 },
    content: { gap: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 56,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 16,
    },
    drawing: { width: 40, alignItems: 'center', gap: 2 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    ready: { backgroundColor: color.sun },
    bare: {
      width: 24,
      height: 3,
      marginVertical: 14,
      borderRadius: 1.5,
      backgroundColor: color.soil,
    },
    pressedRow: { backgroundColor: color.card },
    names: { flex: 1, gap: 2 },
    reference: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    stage: { fontFamily: face, fontSize: 15, color: color.quiet },
    chevron: { fontFamily: face, fontSize: 22, fontWeight: '600', color: color.quiet },
    remove: { gap: 6, marginTop: 20 },
    removeRow: {
      minHeight: 44,
      justifyContent: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    removeText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.miss },
    stays: { fontFamily: face, fontSize: 15, color: color.quiet },
    ask: { gap: 8 },
    answers: { flexDirection: 'row', gap: 8 },
    line: { fontFamily: face, fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
  }),
);
