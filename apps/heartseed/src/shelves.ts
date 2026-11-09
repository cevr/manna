/**
 * The shelves Add verses offers, as data the Add verses sheet draws
 * (`src/shelves/sheet.tsx`): the whole Bible through the chooser, a few picks from the
 * Psalms, the Proverbs and the Gospel of John, and each promise collection
 * the session does not teach, then each section of Haskell's Bible Handbook.
 * Every pick and every promise is a `Passage` list, held as canon numbers,
 * and every Handbook list a `Handbook` list read from its data, so no source
 * here names a verse (`src/today.test.tsx`). Planting a passage is
 * `addPassage`, and a Handbook list `addList`; `offerStateOf` says what a
 * shelf's row offers before that.
 */

import { Option } from 'effect';

import type { Field } from './field';
import { HANDBOOK, HANDBOOK_SOURCE } from './handbook';
import type { HomeIcon } from './home';
import { passageList, plantedListOf, type List } from './lists';
import { heldCount, MOST_PASSAGES, type PassagesView, type Range } from './passages';
import { COLLECTIONS, TAUGHT } from './promises';

/** Where a shelf's lists come from: the chooser over the whole Bible, or lists of its own. */
export type ShelfSource =
  | { readonly _tag: 'Bible' }
  | { readonly _tag: 'Lists'; readonly lists: readonly List[] };

/** A shelf of Add verses: its id, its title, its icon, a line under its title, and its lists. */
export interface Shelf {
  readonly id: string;
  readonly title: string;
  readonly icon: HomeIcon;
  readonly note: string;
  readonly source: ShelfSource;
}

/** One pick as the shelf writes it: the book by its canon number, the chapter, the first and the last verse. */
type Pick = readonly [book: number, chapter: number, first: number, last: number];

/** A shelf of picks: each a `Passage` list with id `pick:<shelf>:<book>.<chapter>.<first>-<last>`. */
const picked = (
  id: string,
  title: string,
  icon: HomeIcon,
  note: string,
  ranges: readonly Range[],
): Shelf => ({
  id,
  title,
  icon,
  note,
  source: { _tag: 'Lists', lists: ranges.map((range) => passageList(`pick:${id}:`, range)) },
});

/** Picks as ranges. */
const rangesOf = (picks: readonly Pick[]): readonly Range[] =>
  picks.map(([book, chapter, first, last]) => ({ book, chapter, first, last }));

/** The book of the Psalms, of the Proverbs and of John, by their numbers in the canon. */
const PSALMS = 19;
const PROVERBS = 20;
const JOHN = 43;

/** The first shelves, in the order Add verses shows them: any passage, the Psalms, the Proverbs, John, then each collection the session does not teach, in the list's order. */
const BASE_SHELVES: readonly Shelf[] = [
  {
    id: 'any',
    title: 'Any passage',
    icon: 'add',
    note: 'Every book, chapter and verse',
    source: { _tag: 'Bible' },
  },
  picked(
    'psalms',
    'Psalms',
    'harp',
    'Songs to carry through the day',
    rangesOf([
      [PSALMS, 1, 1, 3],
      [PSALMS, 46, 1, 3],
      [PSALMS, 91, 1, 4],
      [PSALMS, 103, 1, 5],
      [PSALMS, 121, 1, 8],
      [PSALMS, 139, 1, 6],
    ]),
  ),
  picked(
    'proverbs',
    'Proverbs',
    'lamp',
    'A lamp for the path',
    rangesOf([
      [PROVERBS, 4, 23, 23],
      [PROVERBS, 15, 1, 1],
      [PROVERBS, 16, 3, 3],
      [PROVERBS, 18, 10, 10],
      [PROVERBS, 22, 6, 6],
    ]),
  ),
  picked(
    'john',
    'The Gospel of John',
    'scroll',
    'The words of Christ',
    rangesOf([
      [JOHN, 1, 1, 5],
      [JOHN, 3, 16, 17],
      [JOHN, 14, 1, 3],
      [JOHN, 14, 27, 27],
      [JOHN, 15, 1, 3],
    ]),
  ),
  ...COLLECTIONS.filter((collection) => !TAUGHT.includes(collection.id)).map((collection) =>
    picked(
      collection.id,
      collection.title,
      'bow',
      `${collection.promises.length} promises`,
      collection.promises,
    ),
  ),
];

/** The note under every Handbook shelf's title. */
const HANDBOOK_NOTE = `S. N. Haskell, ${HANDBOOK_SOURCE.title} (${HANDBOOK_SOURCE.year})`;

/** Each section of the Handbook as a shelf of its own, in the book's order: its title, the scroll, the book as its note, and its lists, each planted whole. */
const HANDBOOK_SHELVES: readonly Shelf[] = HANDBOOK.map((section) => ({
  id: `handbook:${section.id}`,
  title: section.title,
  icon: 'scroll',
  note: HANDBOOK_NOTE,
  source: {
    _tag: 'Lists',
    lists: section.lists.flatMap((list) => Option.toArray(plantedListOf(list.id))),
  },
}));

/** Every shelf of Add verses: the 17 above, then each section of the Handbook. */
export const SHELVES: readonly Shelf[] = [...BASE_SHELVES, ...HANDBOOK_SHELVES];

/** What a shelf's row offers for `list`: nothing while the passages are unread, `in field` when the field already shows each of its verses, `full` at the most passages and lists held together, else `plant`. */
export const offerStateOf = (
  list: List,
  passages: PassagesView,
  field: Field,
): 'unread' | 'in field' | 'full' | 'plant' => {
  if (passages._tag === 'Unread') return 'unread';
  const shown = new Set(field.rows.flatMap((row) => row.plants.map((plant) => plant.reference)));
  if (list.verses.every((verse) => shown.has(verse))) return 'in field';
  if (heldCount(passages) >= MOST_PASSAGES) return 'full';
  return 'plant';
};
