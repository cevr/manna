/**
 * Home's single verses (owner, 2026-11-14: a list holds at least three
 * verses, and a single verse is "a different type that shows itself
 * differently"): under the lists, the label `Single verses`, then one
 * compact row per verse (`singlesOf`), no list's chevron and no page of its
 * own. A row is one button, a plant of the field (`field-plant`), named as
 * a plant is (`<reference>, <stage>`, then `, ready today`), whose tap
 * starts its verse as a plant's tap does; inside it, hidden (the name says
 * them), the gold dot when ready and its dash (ink once sown, soil
 * before); then its reference (`single-reference`), the one part left
 * exposed, so a simulator drive finds the verse by its reference on home
 * as it did by a list's title (verify-heartseed's ready target). A verse the reader planted alone carries
 * a `Remove` beside its row, named `Remove <reference>`: its tap puts the
 * ask under the row, `Remove <reference>? Its plant stays in your field.`
 * with `Remove` and `Keep`. From a tap of the ask's `Remove` until its
 * answer, no control here changes anything, even two in one turn. A
 * landed remove drops the ask; any other answer leaves the alert
 * `<reference> was not removed. Try again.` under the row until the next
 * tap. The ask, the alert and the pending state are the section's own.
 */

import { Option } from 'effect';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SinglePlant } from '../home';
import { themed, useThemed } from '../look';
import { SINGLES_TITLE, type Range } from '../passages';
import { useLook } from '../sayit/draw';
import { Control } from './plot';

/** The section's remove state: the verse whose ask shows, the verse and words of a remove that did not land, and whether a remove is pending. */
interface Bar {
  readonly asking: Option.Option<string>;
  readonly alert: Option.Option<{ readonly verse: string; readonly words: string }>;
  readonly pending: boolean;
}

const IDLE: Bar = { asking: Option.none(), alert: Option.none(), pending: false };

/** A single verse's drawing, hidden from the screen reader, as a plant of a list's row is drawn: the gold dot when ready, then an ink dash once sown or a soil dash before. */
function Drawing({ plant }: { readonly plant: SinglePlant }) {
  const styles = useThemed(sheets);
  const planted = plant.stage !== 'not planted';
  return (
    <View aria-hidden style={styles.drawing}>
      {plant.ready && <View testID="dot" style={[styles.dot, styles.ready]} />}
      {!plant.ready && <View style={styles.dot} />}
      {planted && <View testID="plant-sown" style={[styles.dash, styles.sown]} />}
      {!planted && <View testID="plant-soil" style={[styles.dash, styles.bare]} />}
    </View>
  );
}

/** One single verse: its button, its `Remove` when the reader planted it alone, then its ask or alert. */
function Single({
  plant,
  bar,
  onPlant,
  onAsk,
  onConfirm,
  onKeep,
}: {
  readonly plant: SinglePlant;
  readonly bar: Bar;
  readonly onPlant: (reference: string) => void;
  readonly onAsk: (reference: string) => void;
  readonly onConfirm: (reference: string, range: Range) => void;
  readonly onKeep: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const asking = Option.contains(bar.asking, plant.reference);
  const alert = Option.filter(bar.alert, (each) => each.verse === plant.reference);
  return (
    <View testID="single" style={styles.single}>
      <View style={styles.line}>
        <Pressable
          testID="field-plant"
          role="button"
          aria-label={plant.label}
          disabled={bar.pending}
          onPress={() => onPlant(plant.reference)}
          style={({ pressed }) => [styles.verse, pressed && styles.pressed]}
        >
          <Drawing plant={plant} />
          <Text testID="single-reference" style={styles.reference}>
            {plant.reference}
          </Text>
        </Pressable>
        {Option.isSome(plant.removal) && !asking && (
          <Pressable
            role="button"
            aria-label={`Remove ${plant.reference}`}
            disabled={bar.pending}
            onPress={() => onAsk(plant.reference)}
            style={({ pressed }) => [styles.remove, pressed && look.pressed]}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        )}
      </View>
      {Option.match(
        Option.filter(plant.removal, () => asking),
        {
          onNone: () => false,
          onSome: (range) => (
            <View style={styles.ask}>
              <Text testID="single-ask" style={styles.words}>
                {`Remove ${plant.reference}? Its plant stays in your field.`}
              </Text>
              <View style={styles.answers}>
                <Control
                  label="Remove"
                  shown="Remove"
                  pending={bar.pending}
                  onPress={() => onConfirm(plant.reference, range)}
                />
                <Control label="Keep" shown="Keep" pending={bar.pending} onPress={onKeep} />
              </View>
            </View>
          ),
        },
      )}
      {Option.match(alert, {
        onNone: () => false,
        onSome: (each) => (
          <Text role="alert" testID="single-alert" style={styles.words}>
            {each.words}
          </Text>
        ),
      })}
    </View>
  );
}

/** The single verses `singles` under their label; none drawn when there are none. `onPlant` is a row's tap, which starts its verse; `onUproot` removes a single verse, answering as the passages answer; `onPending` hears a remove start and settle, so home holds its other controls meanwhile. */
export function Singles({
  singles,
  onPlant,
  onUproot,
  onPending,
}: {
  readonly singles: readonly SinglePlant[];
  readonly onPlant: (reference: string) => void;
  readonly onUproot: (range: Range) => Promise<string>;
  readonly onPending: (pending: boolean) => void;
}) {
  const styles = useThemed(sheets);
  const [bar, setBar] = useState<Bar>(IDLE);
  const busy = useRef(false);
  /** A tap of a control here: nothing while a remove is pending, else the alert clears and `then` runs. */
  const tapped = (then: () => void) => {
    if (busy.current) return;
    setBar((now) => ({ ...now, alert: Option.none() }));
    then();
  };
  const onConfirm = (verse: string, range: Range) => {
    if (busy.current) return;
    busy.current = true;
    setBar((now) => ({ ...now, pending: true }));
    onPending(true);
    const settle = (answer: string) => {
      busy.current = false;
      onPending(false);
      if (answer === 'Removed') return setBar(IDLE);
      setBar({
        asking: Option.none(),
        alert: Option.some({ verse, words: `${verse} was not removed. Try again.` }),
        pending: false,
      });
    };
    void onUproot(range).then(settle, () => settle('Failed'));
  };
  if (singles.length === 0) return false;
  return (
    <View testID="singles" style={styles.section}>
      <Text style={styles.label}>{SINGLES_TITLE}</Text>
      {singles.map((plant) => (
        <Single
          key={plant.reference}
          plant={plant}
          bar={bar}
          onPlant={(reference) => tapped(() => onPlant(reference))}
          onAsk={(reference) => tapped(() => setBar({ ...IDLE, asking: Option.some(reference) }))}
          onConfirm={onConfirm}
          onKeep={() => tapped(() => setBar(IDLE))}
        />
      ))}
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    section: { gap: 4 },
    label: { fontFamily: face, fontSize: 13, fontWeight: '600', color: color.ink },
    single: { gap: 6 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    verse: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      paddingHorizontal: 4,
      borderRadius: 12,
    },
    drawing: { width: 32, alignItems: 'center', gap: 2 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    ready: { backgroundColor: color.sun },
    dash: { width: 24, height: 3, marginVertical: 14, borderRadius: 1.5 },
    sown: { backgroundColor: color.ink },
    bare: { backgroundColor: color.soil },
    pressed: { backgroundColor: color.hearing },
    reference: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    remove: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12 },
    removeText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.miss },
    ask: { gap: 8, paddingLeft: 46 },
    answers: { flexDirection: 'row', gap: 8 },
    words: { fontFamily: face, fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
  }),
);
