/**
 * PROTOTYPE, throwaway (branch hymnapp/hshome-proto): the home prototype's
 * in-memory garden and library, references only, and the one reducer every
 * variant drives. Nothing is stored; a reload starts the morning again.
 */

import { Match, Option } from 'effect';

import { versesOf } from '../../kjv';
import { passageReference, verseReference, type Range } from '../../passages';
import { COLLECTIONS } from '../../promises';

/** A plant's stage, `new` for the piece today plants. */
export type Stage = 'new' | 'seed' | 'blade' | 'ear' | 'full corn';

/** What a list is, which picks its icon. */
export type Kind = 'psalms' | 'proverbs' | 'promises' | 'gospel' | 'own';

/** One verse in the reader's garden. */
export interface Plant {
  readonly key: string;
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly stage: Stage;
  readonly due: boolean;
}

/** One list of the reader's garden: a furrow of plants. */
export interface Group {
  readonly id: string;
  readonly title: string;
  readonly kind: Kind;
  readonly plants: readonly Plant[];
}

/** A passage the library offers. */
export interface Offer {
  readonly id: string;
  readonly range: Range;
}

/** A shelf of the library: Psalms, Proverbs, a promise collection, John. */
export interface Shelf {
  readonly id: string;
  readonly title: string;
  readonly kind: Kind;
  readonly note: string;
  readonly offers: readonly Offer[];
}

export const VOICES = ['off', 'her', 'him'] as const;
export type VoiceChoice = (typeof VOICES)[number];
export const MINUTES = [2, 5, 10, 20] as const;
export type Minutes = (typeof MINUTES)[number];

/** The home's whole state. */
export interface Home {
  readonly groups: readonly Group[];
  readonly order: readonly string[];
  readonly tended: readonly string[];
  readonly grown: readonly string[];
  readonly planted: readonly string[];
  readonly voice: VoiceChoice;
  readonly minutes: Minutes;
  readonly run: Option.Option<number>;
}

export type Action =
  | { readonly _tag: 'Moved'; readonly key: string; readonly by: -1 | 1 }
  | { readonly _tag: 'Skipped'; readonly key: string }
  | { readonly _tag: 'Begun'; readonly key: Option.Option<string> }
  | { readonly _tag: 'Said'; readonly key: string }
  | { readonly _tag: 'Passed'; readonly key: string }
  | { readonly _tag: 'Ended' }
  | { readonly _tag: 'Added'; readonly shelf: Shelf; readonly offer: Offer }
  | { readonly _tag: 'VoiceCycled' }
  | { readonly _tag: 'MinutesChosen'; readonly minutes: Minutes };

const plant = (
  book: number,
  chapter: number,
  verse: number,
  stage: Stage,
  due: boolean,
): Plant => ({ key: `${book}.${chapter}.${verse}`, book, chapter, verse, stage, due });

const fear = COLLECTIONS.filter((each) => each.id === 'protection').flatMap((each) =>
  each.promises.slice(0, 4),
);

const FEAR_STAGES: readonly Stage[] = ['full corn', 'ear', 'blade', 'seed'];

/** The garden the prototype opens on: 15 plants over 4 lists, 7 of them ready today. */
const GARDEN: readonly Group[] = [
  {
    id: 'psalm-23',
    title: 'Psalm 23',
    kind: 'psalms',
    plants: [
      plant(19, 23, 1, 'full corn', false),
      plant(19, 23, 2, 'full corn', false),
      plant(19, 23, 3, 'ear', true),
      plant(19, 23, 4, 'blade', true),
      plant(19, 23, 5, 'seed', true),
      plant(19, 23, 6, 'new', true),
    ],
  },
  {
    id: 'protection',
    title: 'Protection & Fear',
    kind: 'promises',
    plants: fear.map((range, index) =>
      plant(range.book, range.chapter, range.first, FEAR_STAGES[index] ?? 'seed', index > 1),
    ),
  },
  {
    id: 'proverbs-3',
    title: 'Proverbs 3:5–7',
    kind: 'proverbs',
    plants: [
      plant(20, 3, 5, 'ear', false),
      plant(20, 3, 6, 'blade', false),
      plant(20, 3, 7, 'new', false),
    ],
  },
  {
    id: 'john-15',
    title: 'John 15:4–5',
    kind: 'own',
    plants: [plant(43, 15, 4, 'blade', false), plant(43, 15, 5, 'seed', true)],
  },
];

const offer = (book: number, chapter: number, first: number, last: number): Offer => ({
  id: `${book}.${chapter}.${first}-${last}`,
  range: { book, chapter, first, last },
});

/** The library: the lists a reader browses and adds from. */
export const SHELVES: readonly Shelf[] = [
  {
    id: 'psalms',
    title: 'Psalms',
    kind: 'psalms',
    note: 'Songs to carry through the day',
    offers: [
      offer(19, 1, 1, 3),
      offer(19, 46, 1, 3),
      offer(19, 91, 1, 4),
      offer(19, 103, 1, 5),
      offer(19, 121, 1, 8),
      offer(19, 139, 1, 6),
    ],
  },
  {
    id: 'proverbs',
    title: 'Proverbs',
    kind: 'proverbs',
    note: 'A lamp for the path',
    offers: [
      offer(20, 4, 23, 23),
      offer(20, 15, 1, 1),
      offer(20, 16, 3, 3),
      offer(20, 18, 10, 10),
      offer(20, 22, 6, 6),
    ],
  },
  ...COLLECTIONS.filter((each) => each.id !== 'protection').map((each): Shelf => ({
    id: each.id,
    title: each.title,
    kind: 'promises',
    note: `${each.promises.length} promises`,
    offers: each.promises.map((range) => offer(range.book, range.chapter, range.first, range.last)),
  })),
  {
    id: 'john',
    title: 'The Gospel of John',
    kind: 'gospel',
    note: 'The words of Christ',
    offers: [
      offer(43, 1, 1, 5),
      offer(43, 3, 16, 17),
      offer(43, 14, 1, 3),
      offer(43, 14, 27, 27),
      offer(43, 15, 1, 3),
    ],
  },
];

/** The promise shelves alone, and the rest. */
export const promiseShelves = SHELVES.filter((each) => each.kind === 'promises');
export const otherShelves = SHELVES.filter((each) => each.kind !== 'promises');

export const referenceOf = (each: Plant) => verseReference(each.book, each.chapter, each.verse);
export const offerReference = (each: Offer) => passageReference(each.range);

/** A verse's KJV text, read from the corpus the bundle carries; empty when the canon lacks it. */
export const textOf = (each: Plant) => versesOf(each.book, each.chapter)[each.verse - 1] ?? '';

/** About how long one verse of the day takes, in seconds. */
const SECONDS_EACH = 40;

const allPlants = (groups: readonly Group[]) => groups.flatMap((group) => group.plants);

/** Every ready plant, the new pieces among them, in garden order; one new piece a day. */
const readyKeys = (groups: readonly Group[]) => {
  const plants = allPlants(groups);
  const reviews = plants.filter((each) => each.due && each.stage !== 'new');
  const fresh = plants.filter((each) => each.due && each.stage === 'new').slice(0, 1);
  return [...reviews, ...fresh].map((each) => each.key);
};

export const START: Home = {
  groups: GARDEN,
  order: readyKeys(GARDEN),
  tended: [],
  grown: [],
  planted: [],
  voice: 'her',
  minutes: 5,
  run: Option.none(),
};

export const plantOf = (home: Home, key: string): Option.Option<Plant> =>
  Option.fromUndefinedOr(allPlants(home.groups).find((each) => each.key === key));

export const groupOf = (home: Home, key: string): Option.Option<Group> =>
  Option.fromUndefinedOr(
    home.groups.find((group) => group.plants.some((each) => each.key === key)),
  );

/** Today's queue in the reader's order: what fits the minutes chosen, never fewer than 1, the first new piece always keeping a place (the last one, when it would not fit). */
export const todayOf = (home: Home): readonly Plant[] => {
  const fits = Math.max(1, Math.floor((home.minutes * 60) / SECONDS_EACH));
  const queue = home.order.flatMap((key) => Option.toArray(plantOf(home, key)));
  const shown = queue.slice(0, fits);
  const isFresh = (each: Plant) => each.stage === 'new' || home.planted.includes(each.key);
  return Option.match(Option.fromUndefinedOr(queue.find(isFresh)), {
    onNone: () => shown,
    onSome: (fresh) => {
      if (shown.includes(fresh)) return shown;
      return [...shown.slice(0, fits - 1), fresh];
    },
  });
};

/** The queue still to tend. */
export const leftOf = (home: Home) =>
  todayOf(home).filter((each) => !home.tended.includes(each.key));

/** The day's summary line: what is left, the new piece, and about how long. */
export const summaryOf = (home: Home) => {
  const left = leftOf(home);
  if (left.length === 0) return 'All tended. The field rests until tomorrow.';
  const fresh = left.filter((each) => each.stage === 'new').length;
  const reviews = left.length - fresh;
  const minutes = Math.max(1, Math.round((left.length * SECONDS_EACH) / 60));
  const parts = [`${reviews} to tend`, `${fresh} new`].filter((part) => !part.startsWith('0 '));
  return `${parts.join(' · ')} · about ${minutes} min`;
};

export const STAGE_WORDS: Readonly<Record<Stage, string>> = {
  new: 'not planted yet',
  seed: 'a seed',
  blade: 'a blade',
  ear: 'an ear',
  'full corn': 'full corn',
};

const NEXT_STAGE: Readonly<Record<Stage, Stage>> = {
  new: 'seed',
  seed: 'blade',
  blade: 'ear',
  ear: 'full corn',
  'full corn': 'full corn',
};

export const VOICE_WORDS: Readonly<Record<VoiceChoice, string>> = {
  off: 'Off',
  her: 'Her',
  him: 'Him',
};

const grow = (groups: readonly Group[], key: string) =>
  groups.map((group) => ({
    ...group,
    plants: group.plants.map((each) => {
      if (each.key !== key) return each;
      return { ...each, stage: NEXT_STAGE[each.stage], due: false };
    }),
  }));

const moved = (order: readonly string[], key: string, by: -1 | 1) => {
  const at = order.indexOf(key);
  const to = at + by;
  if (at < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  next[at] = order[to] ?? key;
  next[to] = key;
  return next;
};

/** Plants a library passage as a new list of seeds-to-be, its first verse ready today. */
const added = (home: Home, shelf: Shelf, each: Offer): Home => {
  if (held(home, each) || home.groups.some((group) => group.id === each.id)) return home;
  const { book, chapter, first, last } = each.range;
  const growing = new Set(allPlants(home.groups).map((one) => one.key));
  const plants = Array.from({ length: last - first + 1 }, (_, index) =>
    plant(book, chapter, first + index, 'new', false),
  )
    .filter((one) => !growing.has(one.key))
    .map((one, index) => ({ ...one, due: index === 0 }));
  const group: Group = { id: each.id, title: offerReference(each), kind: shelf.kind, plants };
  const firstKey = plants[0]?.key ?? '';
  return {
    ...home,
    groups: [...home.groups, group],
    order: [...home.order, firstKey],
  };
};

const nextIndex = (home: Home, after: string) => {
  const left = leftOf(home).filter((each) => each.key !== after);
  return Option.match(home.run, {
    onNone: () => Option.none<number>(),
    onSome: (at) => Option.some(Math.min(at, left.length)),
  });
};

/** Begins the run at `key`, which moves to the front of the queue, or at the queue's head. */
const begun = (home: Home, key: Option.Option<string>): Home =>
  Option.match(key, {
    onNone: () => ({ ...home, run: Option.some(0) }),
    onSome: (first) => ({
      ...home,
      order: [first, ...home.order.filter((each) => each !== first)],
      run: Option.some(0),
    }),
  });

const toEnd = (order: readonly string[], key: string) => [
  ...order.filter((each) => each !== key),
  key,
];

export const reduce = (home: Home, action: Action): Home =>
  Match.type<Action>().pipe(
    Match.tagsExhaustive({
      Moved: (each): Home => ({ ...home, order: moved(home.order, each.key, each.by) }),
      Skipped: (each): Home => ({ ...home, order: toEnd(home.order, each.key) }),
      Begun: (each): Home => begun(home, each.key),
      Said: (each): Home => ({
        ...home,
        groups: grow(home.groups, each.key),
        tended: [...home.tended, each.key],
        grown: [...home.grown, each.key],
        planted: [
          ...home.planted,
          ...Option.toArray(plantOf(home, each.key))
            .filter((one) => one.stage === 'new')
            .map((one) => one.key),
        ],
        run: nextIndex(home, each.key),
      }),
      Passed: (each): Home => ({ ...home, order: toEnd(home.order, each.key) }),
      Ended: (): Home => ({ ...home, run: Option.none() }),
      Added: (each): Home => added(home, each.shelf, each.offer),
      VoiceCycled: (): Home => ({
        ...home,
        voice: VOICES[(VOICES.indexOf(home.voice) + 1) % VOICES.length] ?? 'off',
      }),
      MinutesChosen: (each): Home => ({ ...home, minutes: each.minutes }),
    }),
  )(action);

/** How many of a group's plants are full corn. */
export const ripeIn = (group: Group) =>
  group.plants.filter((each) => each.stage === 'full corn').length;

/** Whether every verse of `each` grows in the garden already, in any list. */
export const held = (home: Home, each: Offer) => {
  const keys = new Set(allPlants(home.groups).map((one) => one.key));
  const { book, chapter, first, last } = each.range;
  return Array.from({ length: last - first + 1 }, (_, index) => first + index).every((verse) =>
    keys.has(`${book}.${chapter}.${verse}`),
  );
};
