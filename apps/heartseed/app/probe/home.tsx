import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Array as Arr, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import passage from 'virtual:heartseed-passage';

import { gardenView, passagesView, sessionView, startHere, taughtView } from '../../src/app';
import type { FieldPassage } from '../../src/field';
import type { GardenView, ReadGarden } from '../../src/garden';
import { furrowsOf, greetingAt, readyOf, type Furrow, type Greeting } from '../../src/home';
import { startOf } from '../../src/home/start';
import { fieldPassagesOf } from '../../src/promises/taught';
import { countsOf } from '../../src/session';
import { shownOf, type Shown } from '../../src/session/run';
import type { SessionView } from '../../src/session/service';
import { useSessionBegunWhenShown } from '../../src/session/shown';
import { SHELVES, type Shelf } from '../../src/shelves';
import { themed, useThemed } from '../../src/look';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

/** The app's own row, as Today's field shows it: the promise alone. */
const OWN: readonly FieldPassage[] = [{ title: passage.reference, verses: [passage.reference] }];

/** The garden once a read of it completed. */
const readOf = (garden: Option.Option<GardenView>): Option.Option<ReadGarden> =>
  Option.filter(garden, (view): view is ReadGarden => view._tag === 'Read');

/** A shelf's line: its title, icon and note, then how many lists it holds, or `chooser` for the whole Bible. */
const shelfLine = (shelf: Shelf) => {
  const offers = Match.value(shelf.source).pipe(
    Match.tagsExhaustive({
      Bible: () => 'chooser',
      Lists: ({ lists }) => `${lists.length} lists`,
    }),
  );
  return `shelf ${shelf.title} · ${shelf.icon} · ${shelf.note} · ${offers}`;
};

/** What Today would show now, by `shownOf`. */
const todayLine = (shown: Shown) =>
  Match.value(shown).pipe(
    Match.tagsExhaustive({
      Unplanned: () => 'today shows Unplanned',
      Item: ({ piece }) => `today shows ${piece.reference}`,
      Done: () => 'today shows Done',
    }),
  );

/** A furrow's lines: its own, then one per plant. */
const furrowLines = (furrow: Furrow) => [
  `furrow ${furrow.title} · ${furrow.kind} · ${furrow.icon} · ${furrow.ripe}`,
  ...furrow.plants.map((plant) => `plant ${plant.label}`),
];

/** The probe's lines over the garden read, the session and the furrows. */
const linesOf = (
  session: SessionView,
  garden: ReadGarden,
  furrows: readonly Furrow[],
  lists: number,
  greeting: Greeting,
) => [
  'Home probe',
  `greeting ${greeting.words} ${greeting.icon}`,
  `counts ${Option.match(session.plan, {
    onNone: () => 'none',
    onSome: (plan) => countsOf(plan, garden),
  })}`,
  ...furrows.flatMap(furrowLines),
  `lists ${lists}`,
  `shelves ${SHELVES.length}`,
  ...SHELVES.map(shelfLine),
  Option.match(Arr.head(session.visit), {
    onNone: () => 'visit none',
    onSome: ({ item }) => `visit ${item.reference} fresh ${item.fresh}`,
  }),
  todayLine(shownOf(session, Option.some(garden))),
];

/**
 * A development probe for the live check of the home's rules
 * (verify-heartseed, `home-probe`): the greeting, the plan's counts, each
 * furrow of the field with its kind, icon and ripe count and each of its
 * plants' labels, the lists the field holds, the shelves Add verses
 * offers, the session's visit and what Today would show, one line each,
 * over the live garden, passages and session. It begins the session once
 * the garden is read, as Today does, and its one button starts the first
 * plant `startOf` offers (`startHere`). It writes nothing. A release build
 * renders nothing.
 */
export default function HomeProbe() {
  const styles = useThemed(sheets);
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const session = AsyncResult.value(useAtomValue(sessionView));
  const passages = AsyncResult.value(useAtomValue(passagesView));
  const taught = AsyncResult.value(useAtomValue(taughtView));
  const onStart = useAtomSet(startHere);
  useSessionBegunWhenShown(Option.isSome(garden));
  if (!dev) return;
  const known = Option.all({ garden, session, passages, taught });
  if (Option.isNone(known)) return;
  const { garden: read, session: view } = known.value;
  const lists = fieldPassagesOf(OWN, known.value.passages, known.value.taught);
  const furrows = furrowsOf(read, lists, readyOf(view.plan, read));
  // oxlint-disable-next-line effect/noGlobals -- the probe is a host adapter: it reads the host's clock at each render, as the home's screen will.
  const greeting = greetingAt(Date.now());
  const start = Arr.findFirst(
    furrows.flatMap((furrow) => furrow.plants),
    (plant) => Option.isSome(startOf(view, read, plant.reference)),
  );
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {linesOf(view, read, furrows, lists.length, greeting).map((line, index) => (
        <Text key={index} style={styles.line}>
          {line}
        </Text>
      ))}
      {Option.match(start, {
        onNone: () => <Text style={styles.line}>start none</Text>,
        onSome: (plant) => (
          <Pressable
            role="button"
            aria-label={`Start with ${plant.reference}`}
            onPress={() => onStart(plant.reference)}
            style={styles.button}
          >
            <Text style={styles.line}>{`Start with ${plant.reference}`}</Text>
          </Pressable>
        ),
      })}
    </ScrollView>
  );
}

const sheets = themed((roles, each) =>
  StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingTop: 80,
      paddingHorizontal: 24,
      paddingBottom: 80,
      gap: 8,
      backgroundColor: roles.ground,
    },
    line: { fontSize: 17, fontFamily: each, color: roles.ink },
    button: {
      minHeight: 44,
      paddingHorizontal: 20,
      borderRadius: 22,
      justifyContent: 'center',
      backgroundColor: roles.card,
    },
  }),
);
