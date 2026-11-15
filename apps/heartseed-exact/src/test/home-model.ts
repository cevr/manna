/* oxlint-disable effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noNewError -- a test model: generated cases as plain data, drawn by a seeded stream; a case the generator cannot draw is a defect thrown at once. */

/**
 * Home's model for its generated tests (spec A1 to A5). A case is what one
 * home call reads, drawn whole: a garden (0 to 3 lists of 3 to 20 verses,
 * lists sharing verses, 0 to 20 single verses apart from them, verses
 * planted at every stage, due and not, some planted in the evening, and
 * plants no list or single verse names, as a removed list leaves them),
 * the session's view in the current app's terms (no plan, or a plan with
 * open, done and held items, and a visit), and an instant and a zone. The
 * oracle is the current Heartseed's own rules over the case; the port is
 * home's source over the same garden and the session's wire of that view.
 */

import { review, type Card } from '@manna/heartseed/fsrs';
import type { GardenView, Plant } from '@manna/heartseed/garden';
import { versesIn } from '@manna/heartseed/lists';
import { verseReference, type PassagesView, type Range } from '@manna/heartseed/passages';
import type { Grade, Recall } from '@manna/heartseed/sayit';
import type { Item, Minutes } from '@manna/heartseed/session';
import type { SessionView, VisitVerse } from '@manna/heartseed/session/service';
import { Option } from 'effect';

import type { Held } from '../garden/program';
import type { At } from '../garden/view';
import { pieceOf } from '../home/session';
import type { Random } from './random';

/** Chapters lists are drawn from (book, chapter, verses), long enough for twenty verses. */
const CHAPTERS: ReadonlyArray<readonly [number, number, number]> = [
  [43, 3, 36],
  [45, 8, 39],
  [23, 41, 29],
  [19, 119, 176],
  [40, 5, 48],
];

/** Offsets a case's zone takes, minutes east of UTC, the half and quarter hours among them. */
const OFFSETS = [-600, -300, -240, 0, 60, 330, 345, 540, 765];

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The card a verse starts from before its first recall, as the current app's FSRS starts one. */
const NEW_CARD: Card = {
  due: 0,
  stability: 0,
  difficulty: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  state: 'new',
  lastReview: 0,
};

/** One case: what a home call reads, and the session's view the oracle reads. */
export interface HomeCase {
  readonly held: Held;
  readonly view: SessionView;
  readonly at: At;
}

/** A plant of `reference` with `count` recalls before `now`, some in the reader's evening, folded from a new card. */
const plantOf = (random: Random, reference: string, now: number, offset: number): Plant => {
  const count = 1 + random.below(8);
  let at = now - random.below(60) * DAY - random.below(DAY);
  const recalls: Recall[] = [];
  for (let n = 0; n < count; n++) {
    const evening = random.chance(0.3);
    const startedAt = evening
      ? Math.floor(at / DAY) * DAY + (20 * 60 - offset) * MINUTE + random.below(3) * 60 * MINUTE
      : at;
    recalls.push({
      reference,
      startedAt: Math.min(startedAt, now - MINUTE),
      offset,
      grade: random.pick<Grade>([1, 2, 3, 3, 3, 4, 4]),
      suggested: random.pick([1, 2, 3] as const),
      words: 10,
      missed: random.below(3),
      peeked: 0,
      extra: 0,
    });
    at += random.below(6) * DAY + random.below(DAY);
  }
  const kept = [...new Map(recalls.map((each) => [each.startedAt, each] as const)).values()].sort(
    (a, b) => a.startedAt - b.startedAt,
  );
  const head = kept[0];
  if (head === undefined) throw new TypeError('a plant needs a recall');
  return {
    reference,
    recalls: [head, ...kept.slice(1)],
    backs: [],
    card: kept.reduce((card, recall) => review(card, recall.grade, recall.startedAt), NEW_CARD),
  };
};

/** A range of `length` verses in a chapter, or overlapping `near` when given. */
const rangeOf = (random: Random, length: number, near?: Range): Range => {
  if (near !== undefined) {
    const chapter = CHAPTERS.find(([book, ch]) => book === near.book && ch === near.chapter);
    const verses = chapter?.[2] ?? near.last;
    const first = Math.max(1, Math.min(verses - length + 1, near.last - random.below(3)));
    return { book: near.book, chapter: near.chapter, first, last: first + length - 1 };
  }
  const [book, chapter, verses] = random.pick(CHAPTERS);
  const first = 1 + random.below(verses - length + 1);
  return { book, chapter, first, last: first + length - 1 };
};

/** Draws `count` lists of 3 to 20 verses, a later one now and then over an earlier one's verses. */
const listsOf = (random: Random, count: number, longest: number): Range[] => {
  const lists: Range[] = [];
  for (let n = 0; n < count; n++) {
    const length = 3 + random.below(longest - 2);
    const near = lists.length > 0 && random.chance(0.3) ? random.pick(lists) : undefined;
    lists.push(rangeOf(random, length, near));
  }
  return lists;
};

/** Draws `count` single verses no list holds, each once. */
const singlesOf = (random: Random, count: number, taken: ReadonlySet<string>): Range[] => {
  const singles: Range[] = [];
  const seen = new Set(taken);
  for (let tries = 0; singles.length < count && tries < count * 20; tries++) {
    const [book, chapter, verses] = random.pick(CHAPTERS);
    const verse = 1 + random.below(verses);
    const reference = verseReference(book, chapter, verse);
    if (seen.has(reference)) continue;
    seen.add(reference);
    singles.push({ book, chapter, first: verse, last: verse });
  }
  return singles;
};

/** An item on `reference`: done (its plant holds a recall more than when planned) with probability `done`, else open. */
const itemOf = (
  random: Random,
  garden: ReadonlyMap<string, Plant>,
  reference: string,
  done = 0.3,
): Item => {
  const plant = garden.get(reference);
  const recalls = plant?.recalls.length ?? 0;
  return {
    reference,
    fresh: plant === undefined,
    recalls: random.chance(done) && recalls > 0 ? recalls - 1 : recalls,
    seconds: 10 + random.below(30),
  };
};

/** The session's view over `verses`: no plan, or a plan of some of them, open or done, with a hold and a visit now and then. */
const viewOf = (
  random: Random,
  garden: ReadonlyMap<string, Plant>,
  verses: readonly string[],
): SessionView => {
  const minutes = random.pick<Minutes>([2, 5, 10, 20]);
  const pieces = verses.flatMap((verse) => Option.toArray(pieceOf(verse)));
  if (verses.length === 0 || random.chance(0.2))
    return {
      minutes,
      plan: Option.none(),
      pieces,
      held: Option.none(),
      heldPiece: Option.none(),
      visit: [],
    };
  const tended = random.chance(0.3);
  const planned = verses.filter((verse) => random.chance(0.4) && (!tended || garden.has(verse)));
  const items = planned.map((verse) => itemOf(random, garden, verse, tended ? 1 : 0.3));
  const held =
    items.length > 0 && random.chance(0.2) ? Option.some(random.pick(items)) : Option.none<Item>();
  const visit: VisitVerse[] = random.chance(0.2)
    ? Option.toArray(
        Option.map(pieceOf(random.pick(verses)), (piece) => ({
          item: itemOf(random, garden, piece.reference),
          piece,
        })),
      )
    : [];
  return {
    minutes,
    plan: Option.some({ items }),
    pieces,
    held,
    heldPiece: Option.flatMap(held, (item) => pieceOf(item.reference)),
    visit,
  };
};

/** The sizes a case draws: how many lists and single verses at most, and the longest list. */
export interface Sizes {
  readonly lists: number;
  readonly singles: number;
  readonly longest: number;
}

const ANY: Sizes = { lists: 3, singles: 20, longest: 20 };

/** One case, drawn whole; `exactly` fixes the sizes (3 lists of 20 and 20 singles for the weight). */
export const homeCaseOf = (random: Random, exactly?: Sizes): HomeCase => {
  const sizes = exactly ?? ANY;
  const now = Date.UTC(2026, 10, 15) + random.below(40) * DAY + random.below(DAY);
  const offset = random.pick(OFFSETS);
  const listCount = exactly === undefined ? random.below(sizes.lists + 1) : sizes.lists;
  const passages =
    exactly === undefined
      ? listsOf(random, listCount, sizes.longest)
      : Array.from({ length: listCount }, () => rangeOf(random, sizes.longest));
  const listed = new Set(passages.flatMap(versesIn));
  const singleCount =
    exactly === undefined
      ? random.chance(0.25)
        ? 0
        : random.below(sizes.singles + 1)
      : sizes.singles;
  const singles = singlesOf(random, singleCount, listed);
  const verses = [...listed, ...singles.flatMap(versesIn)];
  const orphanCount = exactly === undefined && random.chance(0.3) ? 1 + random.below(2) : 0;
  const orphans = singlesOf(random, orphanCount, new Set(verses)).flatMap(versesIn);
  const plants = new Map<string, Plant>();
  for (const verse of [...verses, ...orphans])
    if (orphans.includes(verse) || random.chance(0.6))
      plants.set(verse, plantOf(random, verse, now, offset));
  const garden: GardenView = { _tag: 'Read', plants };
  const read: PassagesView = { _tag: 'Read', passages, lists: [], singles };
  return {
    held: { garden, passages: read, singles: Option.some(singles) },
    view: viewOf(random, plants, [...verses, ...orphans]),
    at: { now, offset },
  };
};
