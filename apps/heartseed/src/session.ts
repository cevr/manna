/**
 * The daily session's plan: which verses a session offers and in what order,
 * a pure function of the garden, the verses the app holds text for, the
 * instant, the zone's offset at it and the minutes the reader chose. Nothing
 * is rescheduled, written or stored: a verse left out waits for a later plan,
 * the oldest first, so the reader never meets a pile.
 *
 * - A plant is due at FSRS's due, except a verse planted in the evening
 *   (18:00 to 03:59:59.999 by its one recall's own offset), which is due no
 *   earlier than the 04:00 that ends the day it was planted in.
 * - The new piece is the first piece with no plant, offered unless a plant
 *   was first recalled today (one new verse a day).
 * - A recital is estimated at 10 s and half a second a word. The new piece's
 *   time is reserved, then the due reviews are taken, the earliest due first,
 *   while they fit the minutes; the first is always taken.
 * - The reviews are mixed across groups, and the new piece comes last.
 */

import { Array as Arr, Option, Order } from 'effect';

import { dayOf } from './day';
import type { Plant, ReadGarden } from './garden';

/** The lengths a reader can choose for a session, in minutes. */
export const MINUTES = [2, 5, 10, 20] as const;

export type Minutes = (typeof MINUTES)[number];

/** A verse the app holds text for: its reference, its word count, and the passage or promise collection it belongs to. */
export interface Piece {
  readonly reference: string;
  readonly words: number;
  readonly group: string;
}

/** A piece with its text, which Today shows and a recital of it is said against. */
export interface TextPiece extends Piece {
  readonly text: string;
}

/** One verse of a session: a review, or the new piece (`fresh`), with the recalls its plant held when the plan was made and its estimate in seconds. */
export interface Item {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
  readonly seconds: number;
}

/** A session: its items in the order they are offered. */
export interface Plan {
  readonly items: readonly Item[];
}

const MINUTE_MS = 60_000;

const HOUR_MS = 3_600_000;

const DAY_MS = 86_400_000;

/** When the reader's day starts on the local clock, as `day.ts` counts days: 04:00. */
const DAY_STARTS_MS = 4 * HOUR_MS;

/** When the evening starts on the local clock: a verse planted from then until the day ends is first recalled the next morning. */
const EVENING_STARTS_MS = 18 * HOUR_MS;

/** The estimate of one recital of `words` words, in seconds. */
const secondsOf = (words: number) => 10 + words / 2;

/**
 * The 04:00 that ends the day of a plant's one recall when that recall
 * started in the evening by its own offset; none for a plant of more
 * recalls, a day planting, or a record kept before recalls carried an
 * offset, whose local hour is unknown.
 */
const morningAfter = (plant: Plant): Option.Option<number> => {
  if (plant.recalls.length !== 1) return Option.none();
  const first = Arr.headNonEmpty(plant.recalls);
  return Option.flatMap(Option.fromNullishOr(first.offset), (offset) => {
    const dayStarted = dayOf(first) * DAY_MS + DAY_STARTS_MS - offset * MINUTE_MS;
    if (first.startedAt - dayStarted < EVENING_STARTS_MS - DAY_STARTS_MS) return Option.none();
    return Option.some(dayStarted + DAY_MS);
  });
};

/** When a plant is due: FSRS's due, held to the next morning for a verse planted in the evening. */
const dueOf = (plant: Plant) =>
  Option.match(morningAfter(plant), {
    onNone: () => plant.card.due,
    onSome: (morning) => Math.max(plant.card.due, morning),
  });

interface Due {
  readonly piece: Piece;
  readonly plant: Plant;
  readonly due: number;
}

const byDue = Order.combine(
  Order.mapInput(Order.Number, (each: Due) => each.due),
  Order.mapInput(Order.String, (each: Due) => each.piece.reference),
);

/** The due reviews taken, in due order: while the next fits what is left of `budget`, the first always. */
const capped = (due: readonly Due[], budget: number) => {
  const taken: Due[] = [];
  let left = budget;
  for (const each of due) {
    const seconds = secondsOf(each.piece.words);
    if (taken.length > 0 && seconds > left) break;
    taken.push(each);
    left -= seconds;
  }
  return taken;
};

/** The reviews mixed: each next the earliest due of another group than the last placed, else the earliest due. */
const mixed = (taken: readonly Due[]) => {
  const left = [...taken];
  const placed: Due[] = [];
  while (Arr.isArrayNonEmpty(left)) {
    const index = Option.match(Arr.last(placed), {
      onNone: () => 0,
      onSome: (last) =>
        Math.max(
          0,
          left.findIndex((each) => each.piece.group !== last.piece.group),
        ),
    });
    placed.push(...left.splice(index, 1));
  }
  return placed;
};

/** The session for `garden` at the instant `at`, the device `offset` minutes east of UTC, in `minutes`. */
export const planOf = (input: {
  readonly garden: ReadGarden;
  readonly pieces: readonly Piece[];
  readonly at: number;
  readonly offset: number;
  readonly minutes: Minutes;
}): Plan => {
  const { garden, at } = input;
  const pieces = Arr.dedupeWith(input.pieces, (a, b) => a.reference === b.reference);
  const today = dayOf({ startedAt: at, offset: input.offset });
  const plantedToday = Arr.some(
    [...garden.plants.values()],
    (plant) => dayOf(Arr.headNonEmpty(plant.recalls)) === today,
  );
  const fresh = Option.filter(
    Arr.findFirst(pieces, (piece) => !garden.plants.has(piece.reference)),
    () => !plantedToday,
  );
  const due = Arr.sort(
    Arr.getSomes(
      pieces.map((piece) =>
        Option.filter(
          Option.map(Option.fromNullishOr(garden.plants.get(piece.reference)), (plant): Due => ({
            piece,
            plant,
            due: dueOf(plant),
          })),
          (each) => each.due <= at,
        ),
      ),
    ),
    byDue,
  );
  const reserved = Option.match(fresh, {
    onNone: () => 0,
    onSome: (piece) => secondsOf(piece.words),
  });
  const reviews = mixed(capped(due, input.minutes * 60 - reserved)).map(
    ({ piece, plant }): Item => ({
      reference: piece.reference,
      fresh: false,
      recalls: plant.recalls.length,
      seconds: secondsOf(piece.words),
    }),
  );
  return {
    items: Option.match(fresh, {
      onNone: () => reviews,
      onSome: (piece) => [
        ...reviews,
        { reference: piece.reference, fresh: true, recalls: 0, seconds: secondsOf(piece.words) },
      ],
    }),
  };
};

/** Whether `item` is done in `garden`: its plant holds more recalls than when the plan was made (the new piece, once it is planted). */
const isDone = (garden: ReadGarden, item: Item) =>
  Option.exists(
    Option.fromNullishOr(garden.plants.get(item.reference)),
    (plant) => plant.recalls.length > item.recalls,
  );

/**
 * Today's counts line for `plan` over the garden now, of the items not done:
 * `<n> to tend`, `1 new` and `about <k> min` (their estimates, rounded up to
 * whole minutes) joined by ` · `, or `Nothing to tend now`.
 */
export const countsOf = (plan: Plan, garden: ReadGarden): string => {
  const left = plan.items.filter((item) => !isDone(garden, item));
  if (!Arr.isArrayNonEmpty(left)) return 'Nothing to tend now';
  const tend = left.filter((item) => !item.fresh).length;
  const seconds = left.reduce((sum, item) => sum + item.seconds, 0);
  return [
    ...Arr.filter([`${tend} to tend`], () => tend > 0),
    ...Arr.filter(['1 new'], () => left.some((item) => item.fresh)),
    `about ${Math.ceil(seconds / 60)} min`,
  ].join(' · ');
};
