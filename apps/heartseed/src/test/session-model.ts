/* oxlint-disable effect/noNullish, effect/noTernary -- the model writes the hsdaily spec's rules out as plain branches over undefined, apart from `src/session.ts`'s Option code, so the two cannot share a mistake. */

/**
 * The daily session's rules written plainly from the hsdaily spec, apart
 * from `src/session.ts` and `src/day.ts`: a plant's due date comes from
 * ts-fsrs 5.4.2 (`referenceCard`), its evening and its morning from the
 * record's own wall clock, and a day from the 04:00 rollover counted here.
 *
 * - S1 due: ts-fsrs's due; while a plant holds one recall with an offset
 *   whose wall clock reads 18:00 to 03:59:59.999, no earlier than the 04:00
 *   after it on that wall clock.
 * - S2 the new piece: the first piece with no plant, unless a plant's first
 *   recall falls on today.
 * - S3 plants no piece names are never offered; a reference in two pieces
 *   counts as its first.
 * - S4-S5 a recital is 10 s and 0.5 s a word; the new piece's time is
 *   reserved; the due reviews, earliest first and ties by reference, are
 *   taken while the next fits, the first always.
 * - S7 the next review is the earliest of another group than the last.
 * - S12-S13 the counts line over the items not done.
 */

import type { Recall } from '../sayit';
import { referenceCard } from './garden-model';

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const ROLLOVER = 4 * HOUR;
const EVENING = 18 * HOUR;

/** A verse the app holds text for. */
export interface ModelPiece {
  readonly reference: string;
  readonly words: number;
  readonly group: string;
}

/** One item of the model's plan, with its due instant for a review. */
export interface ModelItem {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
  readonly seconds: number;
  readonly group: string;
  readonly due: number;
}

/** What the model's plan is, and the facts a generator's coverage reads from it. */
export interface ModelPlan {
  readonly items: readonly ModelItem[];
  /** The due reviews of pieces, in due order, taken or not. */
  readonly due: readonly ModelItem[];
  readonly taken: number;
  readonly fresh: 'offered' | 'planted today' | 'all planted';
  readonly budget: number;
  /** Whether a due review after the first misfit would have fitted what was left (S5 stops, never skips). */
  readonly shorterAfterMisfit: boolean;
  /** Plants no piece names that are due. */
  readonly strayDue: number;
}

export const estimate = (words: number) => 10 + 0.5 * words;

/** The local day `startedAt` counts for: by its offset from 04:00, else its UTC date. */
export const localDay = (startedAt: number, offset: number | undefined) => {
  if (offset === undefined) return Math.floor(startedAt / DAY);
  const shifted = startedAt + offset * MINUTE - ROLLOVER;
  return (shifted - (((shifted % DAY) + DAY) % DAY)) / DAY;
};

/** The wall clock's time of day at a recall, by its own offset. */
const timeOfDay = (recall: Recall & { readonly offset: number }) => {
  const wall = recall.startedAt + recall.offset * MINUTE;
  return ((wall % DAY) + DAY) % DAY;
};

/** The instant of the 04:00 after an evening recall on its own wall clock: the same date's after midnight, the next date's before. */
export const morningOf = (recall: Recall & { readonly offset: number }) => {
  const wall = recall.startedAt + recall.offset * MINUTE;
  const clock = timeOfDay(recall);
  const midnight = wall - clock;
  const morning = clock < ROLLOVER ? midnight + ROLLOVER : midnight + DAY + ROLLOVER;
  return morning - recall.offset * MINUTE;
};

/** Whether a recall started in the evening by its own wall clock; an old record without an offset never does. */
export const isEvening = (recall: Recall): recall is Recall & { readonly offset: number } => {
  if (recall.offset === undefined) return false;
  const clock = timeOfDay(recall as Recall & { readonly offset: number });
  return clock >= EVENING || clock < ROLLOVER;
};

const sorted = (recalls: readonly Recall[]) =>
  recalls.toSorted((a, b) => a.startedAt - b.startedAt);

/** S1 over a plant's recalls (any order). */
export const dueModel = (recalls: readonly Recall[]) => {
  const ordered = sorted(recalls);
  const fsrsDue = referenceCard(ordered).due;
  const first = ordered[0];
  if (ordered.length !== 1 || first === undefined || !isEvening(first)) return fsrsDue;
  return Math.max(fsrsDue, morningOf(first));
};

const before = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** S2: whether any plant's first recall falls on `today`. */
const plantedToday = (plants: ReadonlyMap<string, readonly Recall[]>, today: number) => {
  for (const recalls of plants.values()) {
    const first = sorted(recalls)[0];
    if (first !== undefined && localDay(first.startedAt, first.offset) === today) return true;
  }
  return false;
};

/** S1, S3: the due reviews of the pieces, earliest first, ties by reference. */
const dueReviews = (
  plants: ReadonlyMap<string, readonly Recall[]>,
  pieces: readonly ModelPiece[],
  at: number,
) => {
  const due: ModelItem[] = [];
  for (const piece of pieces) {
    const recalls = plants.get(piece.reference);
    if (recalls === undefined || dueModel(recalls) > at) continue;
    due.push({
      reference: piece.reference,
      fresh: false,
      recalls: recalls.length,
      seconds: estimate(piece.words),
      group: piece.group,
      due: dueModel(recalls),
    });
  }
  return due.toSorted((a, b) => a.due - b.due || before(a.reference, b.reference));
};

/** S5: how many of `due` are taken after `reserved` seconds, and whether a later one would have fitted after the stop. */
const cap = (due: readonly ModelItem[], reserved: number, budget: number) => {
  let spent = reserved;
  for (const [index, review] of due.entries()) {
    if (index > 0 && spent + review.seconds > budget)
      return {
        taken: index,
        shorterAfterMisfit: due.slice(index + 1).some((later) => spent + later.seconds <= budget),
      };
    spent += review.seconds;
  }
  return { taken: due.length, shorterAfterMisfit: false };
};

/** S7: each next the earliest of another group than the last placed, else the earliest. */
const mix = (taken: readonly ModelItem[]) => {
  const left = [...taken];
  const placed: ModelItem[] = [];
  while (left.length > 0) {
    const last = placed[placed.length - 1];
    let index = 0;
    if (last !== undefined) {
      const other = left.findIndex((each) => each.group !== last.group);
      if (other >= 0) index = other;
    }
    placed.push(...left.splice(index, 1));
  }
  return placed;
};

/** S1-S7: the plan over `plants` (recalls by reference) at `at`, the device `offset` minutes east of UTC. */
export const planModel = (input: {
  readonly plants: ReadonlyMap<string, readonly Recall[]>;
  readonly pieces: readonly ModelPiece[];
  readonly at: number;
  readonly offset: number;
  readonly minutes: number;
}): ModelPlan => {
  const { plants, at } = input;
  const pieces: ModelPiece[] = [];
  for (const piece of input.pieces)
    if (pieces.every((each) => each.reference !== piece.reference)) pieces.push(piece);
  const unplanted = pieces.find((piece) => !plants.has(piece.reference));
  const fresh = plantedToday(plants, localDay(at, input.offset)) ? undefined : unplanted;
  const due = dueReviews(plants, pieces, at);
  let strayDue = 0;
  for (const [reference, recalls] of plants)
    if (pieces.every((piece) => piece.reference !== reference) && dueModel(recalls) <= at)
      strayDue += 1;
  const budget = input.minutes * 60;
  const { taken, shorterAfterMisfit } = cap(
    due,
    fresh === undefined ? 0 : estimate(fresh.words),
    budget,
  );
  const placed = mix(due.slice(0, taken));
  const items =
    fresh === undefined
      ? placed
      : [
          ...placed,
          {
            reference: fresh.reference,
            fresh: true,
            recalls: 0,
            seconds: estimate(fresh.words),
            group: fresh.group,
            due: at,
          },
        ];
  return {
    items,
    due,
    taken,
    fresh:
      fresh !== undefined ? 'offered' : unplanted === undefined ? 'all planted' : 'planted today',
    budget,
    shorterAfterMisfit,
    strayDue,
  };
};

/** S12-S13: the counts line for `items` over the recall counts now, by reference. */
export const countsModel = (
  items: readonly Pick<ModelItem, 'reference' | 'fresh' | 'recalls' | 'seconds'>[],
  recallsNow: (reference: string) => number,
) => {
  const left = items.filter((item) => recallsNow(item.reference) <= item.recalls);
  if (left.length === 0) return 'Nothing to tend now';
  const parts: string[] = [];
  const tend = left.filter((item) => !item.fresh).length;
  if (tend > 0) parts.push(`${tend} to tend`);
  if (left.some((item) => item.fresh)) parts.push('1 new');
  let seconds = 0;
  for (const item of left) seconds += item.seconds;
  const whole = Math.floor(seconds / 60);
  parts.push(`about ${whole * 60 === seconds ? whole : whole + 1} min`);
  return parts.join(' · ');
};
