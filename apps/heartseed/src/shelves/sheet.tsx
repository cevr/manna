/**
 * Home's Add a list sheet: React Native's own `Modal` as a page sheet over
 * home, as the Settings sheet is (`src/settings/sheet.tsx`). Its root
 * (`add-sheet`) holds a header fixed above the scroll view (the one heading
 * `Add a list` and `Done`), the scroll view with one head per shelf of
 * `SHELVES`, and a foot fixed under it, clear of the home indicator, for
 * the one line: the limit line or the plant's alert.
 *
 * `Any passage` hands the reader to the chooser (`onAny`). Every other
 * shelf opens in place under its head, one at a time, and lists its offers:
 * each list's title and count, and what `offerStateOf` says of it over
 * home's field: `Plant <title>`, `In your field`, or nothing. A tap of
 * `Plant` acts by the list's source: a passage adds its range
 * (`plantPassage`), a Handbook list plants its id whole (`plantList`). On
 * `Added` (or `Held`) home shows (`onAdded`); on `Full` the limit line
 * shows, and on any other answer the alert says the list was not planted,
 * the same shelf open, so a retry is one tap. The next tap clears the line,
 * the limit line excepted while 3 or more passages and lists are held
 * together. From a tap of `Plant` until its answer, no
 * tap in the sheet changes anything, even two in one turn, each control
 * shows as disabled, and neither Escape nor the swipe down closes it.
 * Nothing is stored but by a landed add.
 */

import { useAtomSet } from '@effect/atom-react';
import { Match, Option } from 'effect';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { plantList, plantPassage } from '../app';
import { LIMIT_LINE } from '../chooser';
import type { Field } from '../field';
import { Icon } from '../field/plot';
import type { List } from '../lists';
import {
  heldCount,
  MOST_PASSAGES,
  type AddAnswer,
  type PassagesView,
  type PlantAnswer,
  type Range,
} from '../passages';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import { offerStateOf, SHELVES, type Shelf } from '../shelves';

/** The sheet's line after a plant's answer: the limit line on `Full`, else the alert naming the list. */
type Line = { readonly _tag: 'Limit' } | { readonly _tag: 'Alert'; readonly title: string };

/** A list's count as an offer writes it, over its distinct verses. */
const countText = (list: List) => {
  if (list.verses.length === 1) return '1 verse';
  return `${list.verses.length} verses`;
};

/** What a shelf's list plants, by its source: its range on a `Passage` list, its id on a `Handbook` list, nothing on any other. */
type Planting =
  | { readonly _tag: 'Passage'; readonly range: Range }
  | { readonly _tag: 'Handbook'; readonly id: string };

/** The planting a shelf's list offers, if any. */
const plantingOf = (list: List): Option.Option<Planting> =>
  Match.value(list.source).pipe(
    Match.tagsExhaustive({
      Passage: ({ range }) => Option.some<Planting>({ _tag: 'Passage', range }),
      Handbook: ({ id }) => Option.some<Planting>({ _tag: 'Handbook', id }),
      Own: () => Option.none<Planting>(),
      Collection: () => Option.none<Planting>(),
      Loose: () => Option.none<Planting>(),
    }),
  );

/** Whether the passages are read and hold the most a reader may hold, passages and lists together. */
const atMost = (passages: PassagesView) =>
  passages._tag === 'Read' && heldCount(passages) >= MOST_PASSAGES;

/** The one line the foot shows: the limit line while the most are held or after `Full`, else the alert. */
const footLine = (passages: PassagesView, line: Option.Option<Line>): Option.Option<Line> => {
  if (atMost(passages)) return Option.some({ _tag: 'Limit' });
  return line;
};

/** One list of the open shelf: its reference, its count, and `Plant` or `In your field` as `offerStateOf` says. */
function Offer({
  list,
  field,
  passages,
  pending,
  onPlant,
}: {
  readonly list: List;
  readonly field: Field;
  readonly passages: PassagesView;
  readonly pending: boolean;
  readonly onPlant: (list: List, planting: Planting) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const state = Option.map(plantingOf(list), (planting) => ({
    planting,
    offer: offerStateOf(list, passages, field),
  }));
  return (
    <View testID="offer" style={styles.offer}>
      <View style={styles.offerWords}>
        <Text testID="offer-title" style={styles.offerTitle}>
          {list.title}
        </Text>
        <Text testID="offer-count" style={styles.note}>
          {countText(list)}
        </Text>
      </View>
      {Option.match(state, {
        onNone: () => false,
        onSome: ({ planting, offer }) => {
          if (offer === 'in field')
            return (
              <Text testID="offer-state" style={styles.note}>
                In your field
              </Text>
            );
          if (offer !== 'plant') return false;
          return (
            <Pressable
              role="button"
              aria-label={`Plant ${list.title}`}
              disabled={pending}
              onPress={() => onPlant(list, planting)}
              style={({ pressed }) => [
                styles.plant,
                pressed && look.pressed,
                pending && look.disabled,
              ]}
            >
              <Text style={styles.plantText}>Plant</Text>
            </Pressable>
          );
        },
      })}
    </View>
  );
}

/** A shelf's head: a button at least 56 pt tall, named by its title, with its icon, its title and its note; `expanded` is absent on `Any passage`. */
function Head({
  shelf,
  expanded,
  pending,
  onPress,
}: {
  readonly shelf: Shelf;
  readonly expanded: Option.Option<boolean>;
  readonly pending: boolean;
  readonly onPress: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID="shelf"
      role="button"
      aria-label={shelf.title}
      aria-expanded={Option.getOrUndefined(expanded)}
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [styles.head, pressed && look.pressed, pending && look.disabled]}
    >
      <Icon name={shelf.icon} size={28} />
      <View style={styles.headWords}>
        <Text style={styles.headTitle}>{shelf.title}</Text>
        <Text testID="shelf-note" style={styles.note}>
          {shelf.note}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The Add a list sheet, open while mounted, over home's `field` and the
 * reader's `passages`: `onDone` closes it (`Done`, the swipe down, Escape),
 * `onAny` shows the chooser, and `onAdded` shows home once a plant landed.
 */
export function AddSheet({
  field,
  passages,
  onDone,
  onAny,
  onAdded,
}: {
  readonly field: Field;
  readonly passages: PassagesView;
  readonly onDone: () => void;
  readonly onAny: () => void;
  readonly onAdded: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<Option.Option<string>>(Option.none());
  const [line, setLine] = useState<Option.Option<Line>>(Option.none());
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const plantRange = useAtomSet(plantPassage, { mode: 'promise' });
  const plantId = useAtomSet(plantList, { mode: 'promise' });
  const tapped = (then: () => void) => () => {
    if (busy.current) return;
    setLine(Option.none());
    then();
  };
  const onClose = tapped(onDone);
  const settle = (list: List, answer: AddAnswer | PlantAnswer) => {
    busy.current = false;
    setPending(false);
    if (answer === 'Added' || answer === 'Held') return onAdded();
    if (answer === 'Full') return setLine(Option.some({ _tag: 'Limit' }));
    setLine(Option.some({ _tag: 'Alert', title: list.title }));
  };
  const planted = (planting: Planting): Promise<AddAnswer | PlantAnswer> =>
    Match.value(planting).pipe(
      Match.tagsExhaustive({
        Passage: ({ range }) => plantRange(range),
        Handbook: ({ id }) => plantId(id),
      }),
    );
  const onPlant = (list: List, planting: Planting) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setLine(Option.none());
    void planted(planting).then(
      (answer) => settle(list, answer),
      () => settle(list, 'Failed'),
    );
  };
  const shown = footLine(passages, line);
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
      backdropColor={styles.root.backgroundColor}
    >
      <View testID="add-sheet" style={styles.root}>
        <View style={styles.header}>
          <Text role="heading" aria-level={1} style={styles.title}>
            Add a list
          </Text>
          <Pressable
            role="button"
            aria-label="Done"
            hitSlop={10}
            disabled={pending}
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              pressed && look.pressed,
              pending && look.disabled,
            ]}
          >
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={[look.content, styles.content]}>
          {SHELVES.map((shelf) =>
            Match.value(shelf.source).pipe(
              Match.tagsExhaustive({
                Bible: () => (
                  <Head
                    key={shelf.id}
                    shelf={shelf}
                    expanded={Option.none()}
                    pending={pending}
                    onPress={tapped(onAny)}
                  />
                ),
                Lists: ({ lists }) => {
                  const expanded = Option.contains(open, shelf.id);
                  return (
                    <View key={shelf.id} style={styles.shelf}>
                      <Head
                        shelf={shelf}
                        expanded={Option.some(expanded)}
                        pending={pending}
                        onPress={tapped(() => {
                          if (expanded) return setOpen(Option.none());
                          setOpen(Option.some(shelf.id));
                        })}
                      />
                      {expanded &&
                        lists.map((list) => (
                          <Offer
                            key={list.id}
                            list={list}
                            field={field}
                            passages={passages}
                            pending={pending}
                            onPlant={onPlant}
                          />
                        ))}
                    </View>
                  );
                },
              }),
            ),
          )}
        </ScrollView>
        <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
          {Option.match(shown, {
            onNone: () => false,
            onSome: (each) =>
              Match.value(each).pipe(
                Match.tagsExhaustive({
                  Limit: () => (
                    <Text role="alert" testID="limit" style={styles.line}>
                      {LIMIT_LINE}
                    </Text>
                  ),
                  Alert: ({ title }) => (
                    <Text role="alert" testID="plant-alert" style={styles.line}>
                      {`${title} was not planted. Try again.`}
                    </Text>
                  ),
                }),
              ),
          })}
        </View>
      </View>
    </Modal>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.ground },
    header: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 44,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 8,
    },
    title: { fontFamily: face, fontSize: 28, fontWeight: '700', color: color.ink },
    scroll: { flex: 1 },
    content: { paddingTop: 8, paddingBottom: 16, gap: 8 },
    shelf: { gap: 4 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 56,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: color.card,
    },
    headWords: { flex: 1, gap: 2 },
    headTitle: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    note: { fontFamily: face, fontSize: 15, color: color.ink },
    offer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 44,
      paddingVertical: 6,
      paddingLeft: 54,
      paddingRight: 12,
    },
    offerWords: { flexShrink: 1, gap: 2 },
    offerTitle: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    plant: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.ink,
    },
    plantText: { fontFamily: face, fontSize: 15, fontWeight: '700', color: color.onInk },
    foot: { paddingHorizontal: 24, paddingTop: 8 },
    line: { fontFamily: face, fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
    button: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: color.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
  }),
);
