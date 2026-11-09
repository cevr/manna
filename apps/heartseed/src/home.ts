/**
 * The home's rules over the field, as pure code no screen draws yet
 * (hshomefield onward): the furrows (one per row of the field, each its
 * list's kind and icon, how many of its plants are ripe, and each plant's
 * stage and ready mark), the verses today's plan still holds open, and the
 * greeting by the reader's local hour.
 *
 * A verse is one plant wherever it shows: a verse in two lists has one
 * stage and one ready mark in both furrows, as the field derives one stage
 * per reference and the ready set holds verses.
 */

import { Array as Arr, Match, Option } from 'effect';

import { offsetAt } from './day';
import { fieldOf, type PlantStage } from './field';
import type { ReadGarden } from './garden';
import { looseList, type List, type ListSource } from './lists';
import type { Range } from './passages';
import { phraseOf } from './phrase';
import { isDone, type Plan } from './session';

/** The names of the home's icons; hshomeicons draws one image per name and colour scheme. */
export const HOME_ICONS = [
  'add',
  'blade',
  'bow',
  'corn',
  'ear',
  'harp',
  'lamp',
  'scroll',
  'seed',
  'sun',
  'moon',
] as const;

export type HomeIcon = (typeof HOME_ICONS)[number];

/** What a furrow's list is to the reader: the app's own, a passage held, a collection taught, or a verse no list names. */
export type FurrowKind = 'own' | 'held' | 'taught' | 'other';

/** The kind of a list from its source. */
export const kindOf: (source: ListSource) => FurrowKind = Match.type<ListSource>().pipe(
  Match.tagsExhaustive({
    Own: (): FurrowKind => 'own',
    Passage: (): FurrowKind => 'held',
    Collection: (): FurrowKind => 'taught',
    Loose: (): FurrowKind => 'other',
  }),
);

/** The book of the Psalms and of the Proverbs, by their numbers in the canon. */
const PSALMS = 19;
const PROVERBS = 20;

/** The icon of a held passage of `book`: a harp for a psalm, a lamp for a proverb, else a scroll. */
const bookIcon = (book: number): HomeIcon => {
  if (book === PSALMS) return 'harp';
  if (book === PROVERBS) return 'lamp';
  return 'scroll';
};

/** The icon of a list from its source: a bow for the app's own row and a collection, a passage's by its book, and a scroll for a verse no list names. */
export const iconOf: (source: ListSource) => HomeIcon = Match.type<ListSource>().pipe(
  Match.tagsExhaustive({
    Own: (): HomeIcon => 'bow',
    Passage: ({ range }): HomeIcon => bookIcon(range.book),
    Collection: (): HomeIcon => 'bow',
    Loose: (): HomeIcon => 'scroll',
  }),
);

/** One plant of a furrow: its verse, its stage on the field, whether today's plan holds it open, and the words a screen reader says for it. */
export interface FurrowPlant {
  readonly reference: string;
  readonly stage: PlantStage;
  readonly ready: boolean;
  readonly label: string;
}

/** One row of the field as the home draws it. */
export interface Furrow {
  readonly id: string;
  readonly title: string;
  readonly range?: Range;
  readonly source: ListSource;
  readonly kind: FurrowKind;
  readonly icon: HomeIcon;
  /** `<k> of <n> ripe`: its plants at full corn, of all its plants. */
  readonly ripe: string;
  readonly plants: readonly FurrowPlant[];
}

/** A plant's label: `<reference>, <stage>`, then `, ready today` when the plan holds it open. */
const labelOf = (reference: string, stage: PlantStage, ready: boolean) => {
  if (ready) return `${reference}, ${stage}, ready today`;
  return `${reference}, ${stage}`;
};

/**
 * The furrows of `garden` over `lists`: one per row of `fieldOf(garden,
 * lists)`, in row order. The first rows are the lists'; each later row is
 * a verse no list names, as a `Loose` list. A plant is ready when its verse
 * is in `ready`.
 */
export const furrowsOf = (
  garden: ReadGarden,
  lists: readonly List[],
  ready: ReadonlySet<string>,
): readonly Furrow[] =>
  fieldOf(garden, lists).rows.map((row, index) => {
    const list = Option.getOrElse(Arr.get(lists, index), () => looseList(row.title));
    const plants = row.plants.map((plant): FurrowPlant => {
      const isReady = ready.has(plant.reference);
      return {
        reference: plant.reference,
        stage: plant.stage,
        ready: isReady,
        label: labelOf(plant.reference, plant.stage, isReady),
      };
    });
    const ripe = plants.filter((plant) => plant.stage === 'full corn').length;
    return {
      id: list.id,
      title: list.title,
      range: list.range,
      source: list.source,
      kind: kindOf(list.source),
      icon: iconOf(list.source),
      ripe: `${ripe} of ${plants.length} ripe`,
      plants,
    };
  });

/** The verse a plant's reference belongs to: a phrase's verse, else the reference itself. */
export const verseOf = (reference: string) =>
  Option.match(phraseOf(reference), {
    onNone: () => reference,
    onSome: (phrase) => phrase.verse,
  });

/** The verses today's plan holds open: each verse (a phrase's folded into it) of an item not yet done; none before a plan is made. */
export const readyOf = (plan: Option.Option<Plan>, garden: ReadGarden): ReadonlySet<string> =>
  new Set(
    Option.match(plan, {
      onNone: () => [],
      onSome: ({ items }) =>
        items.filter((item) => !isDone(garden, item)).map((item) => verseOf(item.reference)),
    }),
  );

const MINUTE_MS = 60_000;

const MINUTES_A_DAY = 1440;

/** The local minute of the day, 0-1439, at the instant `at` in a zone `offset` minutes east of UTC. */
export const minuteOf = (at: number, offset: number) =>
  (((Math.floor(at / MINUTE_MS) + offset) % MINUTES_A_DAY) + MINUTES_A_DAY) % MINUTES_A_DAY;

/** The home's greeting: its words and the icon beside them. */
export interface Greeting {
  readonly words: 'Good morning' | 'Good afternoon' | 'Good evening';
  readonly icon: 'sun' | 'moon';
}

/** Morning runs from 04:00, afternoon from 12:00 and evening from 18:00 to the next 04:00, by the local minute. */
const MORNING = 240;
const AFTERNOON = 720;
const EVENING = 1080;

/** The greeting at the local minute `minute` of the day. */
export const greetingOf = (minute: number): Greeting => {
  if (minute >= MORNING && minute < AFTERNOON) return { words: 'Good morning', icon: 'sun' };
  if (minute >= AFTERNOON && minute < EVENING) return { words: 'Good afternoon', icon: 'sun' };
  return { words: 'Good evening', icon: 'moon' };
};

/** The greeting at the instant `at`, by the device zone's offset then. */
export const greetingAt = (at: number) => greetingOf(minuteOf(at, offsetAt(at)));
