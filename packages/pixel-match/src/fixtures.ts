/* oxlint-disable effect/noThrowStatement, effect/noNewError, effect/noGlobals, effect/noTernary, effect/noNullish -- a host tool: a fixture that does not land on the stage it names is a broken harness, said by a throw; the local day is the host's own `Date`; the stored pairs are JSON text as One's store keeps them. */

/**
 * The fixtures: named states of an app's stored data, as the key-value pairs
 * One's store keeps (`one_kv` on iOS, `localStorage` on the web), written
 * with the app stopped. Heartseed's are a function of the capture's local
 * day: each recall sits at 05:00 local a whole number of days back, so a
 * capture on any later day shows the same plan. Every plant is checked
 * against the app's own rules (`stageOf`, FSRS's `review`) as it is made:
 * a fixture that would not draw the stage or the due state it names throws.
 * Verses are named by reference; no fixture holds a word of one.
 */

import { formatBibleReference, Reference } from '@manna/core/bible';
import { stageOf, type Plant, type Stage } from '@manna/heartseed/garden';
import * as Fsrs from '@manna/heartseed/fsrs';
import { review, type Card, type Grade } from '@manna/heartseed/fsrs';
import type { Range } from '@manna/heartseed/passages';
import { Array as Arr } from 'effect';

/** A card never reviewed: the app's `NEW_CARD`, which its declarations (`exact/fsrs.d.ts`) do not name; checked against the app's own as this module loads. */
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
const own: unknown = Object.entries(Fsrs).find(([name]) => name === 'NEW_CARD')?.[1];
if (JSON.stringify(own) !== JSON.stringify(NEW_CARD))
  throw new Error(`the harness's new card is not the app's: ${JSON.stringify(own)}`);

/** A verse's reference as the app writes it (`Psalms 23:1`): the same call its `verseReference` makes, which this harness cannot import without the app's bundled corpus. */
const verseReference = (book: number, chapter: number, verse: number) =>
  formatBibleReference(Reference.verse(book, chapter, verse));

/** A store's pairs, or a store that cannot be opened at all. */
export type Store =
  | { readonly _tag: 'Pairs'; readonly pairs: ReadonlyArray<readonly [string, string]> }
  | { readonly _tag: 'Broken' };

/** 05:00 local, `daysAgo` days before `now`'s local date. */
const morning = (now: Date, daysAgo: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 5).getTime();

/** A recall's history: each entry days back and its grade, oldest first. */
type History = ReadonlyArray<readonly [number, Grade]>;

/** Today's one recall of a verse planted today, graded Easy so its card is days from due (a Good first recall comes due within minutes). */
const today: History = [[0, 4]];

/** The histories that land each stage, said with no help after a seed: due now, and due later. */
const STAGES: Readonly<Record<'due' | 'later', Readonly<Record<Stage, History>>>> = {
  due: {
    seed: [[6, 3]],
    blade: [
      [40, 3],
      [34, 3],
    ],
    ear: [
      [60, 3],
      [58, 3],
      [56, 3],
    ],
    'full corn': [
      [700, 3],
      [600, 4],
      [500, 4],
    ],
  },
  later: {
    seed: today,
    blade: [
      [12, 3],
      [6, 3],
    ],
    ear: [
      [4, 3],
      [2, 3],
      [0, 3],
    ],
    'full corn': [
      [300, 4],
      [250, 4],
      [150, 4],
      [40, 4],
    ],
  },
};

/** One verse's planting: its reference, its history, and the stage and due state it must land on. */
interface Planting {
  readonly reference: string;
  readonly history: History;
  readonly stage: Stage;
  readonly due: boolean;
}

const plant = (
  reference: string,
  stage: Stage,
  due: boolean,
  history: History = STAGES[due ? 'due' : 'later'][stage],
): Planting => ({ reference, history, stage, due });

/** The stored pairs of one planting at `now`, checked against the app's rules. */
const recallsOf = (planting: Planting, now: Date) => {
  const recalls = planting.history.map(([daysAgo, grade]) => {
    const startedAt = morning(now, daysAgo);
    return {
      reference: planting.reference,
      startedAt,
      offset: -new Date(startedAt).getTimezoneOffset(),
      grade,
      suggested: 3 as const,
      words: 12,
      missed: 0,
      peeked: 0,
      extra: 0,
    };
  });
  const card = recalls.reduce(
    (folded: Card, recall) => review(folded, recall.grade, recall.startedAt),
    NEW_CARD,
  );
  if (!Arr.isReadonlyArrayNonEmpty(recalls)) return [];
  const grown: Plant = { reference: planting.reference, recalls, backs: [], card };
  const stage = stageOf(grown);
  const due = card.due <= now.getTime();
  if (stage !== planting.stage || due !== planting.due)
    throw new Error(
      `fixture: ${planting.reference} lands ${stage}${due ? ', due' : ''}, not ${planting.stage}${planting.due ? ', due' : ''}`,
    );
  return recalls.map(
    (recall) =>
      [`heartseed/recall/${recall.reference}/${recall.startedAt}`, JSON.stringify(recall)] as const,
  );
};

const range = (book: number, chapter: number, first: number, last: number): Range => ({
  book,
  chapter,
  first,
  last,
});

/** Book numbers in the canon's order. */
const BOOK = { psalms: 19, isaiah: 23, matthew: 40, john: 43, romans: 45, philippians: 50 };

const OWN = verseReference(BOOK.isaiah, 41, 10);
const psalm = (verse: number) => verseReference(BOOK.psalms, 23, verse);
const romans = (verse: number) => verseReference(BOOK.romans, 8, verse);

/** A Heartseed store: its passages, single verses and plantings at `now`. */
const garden = (
  now: Date,
  passages: ReadonlyArray<Range>,
  singles: ReadonlyArray<Range>,
  plantings: ReadonlyArray<Planting>,
): Store => ({
  _tag: 'Pairs',
  pairs: [
    ...(passages.length > 0 ? [['heartseed/passages', JSON.stringify(passages)] as const] : []),
    ...(singles.length > 0 ? [['heartseed/singles', JSON.stringify(singles)] as const] : []),
    ...plantings.flatMap((planting) => recallsOf(planting, now)),
  ],
});

/** Two lists (5 and 12 verses) beside the single verses: three furrows, under the limit of 3 held. */
const LISTS = [range(BOOK.psalms, 23, 1, 5), range(BOOK.romans, 8, 28, 39)];
const SINGLES = [range(BOOK.philippians, 4, 13, 13), range(BOOK.john, 11, 35, 35)];

/** A plant at every stage in each list, some due, some not, and verses not planted. */
const LIST_PLANTS = [
  plant(OWN, 'ear', false),
  plant(psalm(1), 'seed', true),
  plant(psalm(2), 'blade', true),
  plant(psalm(3), 'ear', false),
  plant(psalm(4), 'full corn', false),
  plant(romans(28), 'seed', false),
  plant(romans(29), 'blade', true),
  plant(romans(30), 'ear', true),
  plant(romans(31), 'full corn', false),
  plant(verseReference(BOOK.philippians, 4, 13), 'blade', false),
  plant(verseReference(BOOK.john, 11, 35), 'seed', false),
];

/** Heartseed's fixtures at `now`, by name. */
const heartseedFixtures = (now: Date) => ({
  'hs-new': () => garden(now, [], [], []),
  'hs-fresh': () => garden(now, [], [], [plant(OWN, 'seed', false)]),
  'hs-due': () =>
    garden(
      now,
      [range(BOOK.psalms, 23, 1, 3)],
      [],
      [plant(OWN, 'seed', true), plant(psalm(1), 'seed', true), plant(psalm(2), 'blade', true)],
    ),
  'hs-tended': () =>
    garden(
      now,
      [range(BOOK.psalms, 23, 1, 3)],
      [],
      [
        plant(OWN, 'blade', false, [
          [6, 3],
          [0, 3],
        ]),
        plant(psalm(1), 'blade', false, [
          [6, 3],
          [0, 3],
        ]),
        plant(psalm(2), 'blade', false, [
          [5, 3],
          [0, 3],
        ]),
        plant(psalm(3), 'seed', false),
      ],
    ),
  'hs-lists': () => garden(now, LISTS, SINGLES, LIST_PLANTS),
  'hs-limit': () => garden(now, [...LISTS, range(BOOK.matthew, 5, 3, 9)], SINGLES, LIST_PLANTS),
  'hs-long': () =>
    garden(
      now,
      [],
      [range(BOOK.john, 3, 16, 16)],
      [plant(OWN, 'seed', false), plant(verseReference(BOOK.john, 3, 16), 'seed', true)],
    ),
  'hs-unread': (): Store => ({ _tag: 'Broken' }),
});

const fresh = [
  ['sound', 'false'],
  ['feel', 'false'],
] as const;

/** The hymnal's fixtures, by name: Sound and Sounds and haptics off in each, as the drives' rules ask. */
const hymnalFixtures = {
  'hy-fresh': (): Store => ({ _tag: 'Pairs', pairs: fresh }),
  'hy-used': (): Store => ({
    _tag: 'Pairs',
    pairs: [...fresh, ['lists.favourites', '[1,100,529]'], ['lists.recent', '[12,100,1]']],
  }),
  'hy-chords': (): Store => ({ _tag: 'Pairs', pairs: [...fresh, ['chords', 'true']] }),
  'hy-paused': (): Store => ({ _tag: 'Pairs', pairs: fresh }),
};

/** The store fixture `name` of `app` makes at `now`; none for a name it does not know. */
export const storeOf = (
  app: 'heartseed' | 'hymnal',
  name: string,
  now: Date,
): Store | undefined => {
  const table = app === 'heartseed' ? heartseedFixtures(now) : hymnalFixtures;
  return new Map<string, () => Store>(Object.entries(table)).get(name)?.();
};
