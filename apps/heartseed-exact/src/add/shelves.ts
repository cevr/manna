/**
 * Add verses as the port draws it: the current Heartseed's shelves
 * (`SHELVES`), in its order, each row a list with what it offers now
 * (`offerStateOf` over the reader's passages and the field the garden
 * read makes), and the one line the current sheet's foot shows: the lists'
 * limit line while the most are held, else the single verses' while they
 * are at theirs. Any passage opens the chooser; every other shelf (the
 * picks, the promises, each section of the Handbook) is a head that opens
 * in place, one at a time, as the current sheet's shelves do, so only the
 * open shelf's rows are answered and drawn. A row opens its list, which
 * shows its verses with their words before it is planted. Every answer
 * names lists by their titles and references alone; only a list's own
 * page carries words.
 */

import { LIMIT_LINE, SINGLES_LIMIT_LINE } from '@manna/heartseed/chooser';
import { fieldOf, type Field } from '@manna/heartseed/field';
import { fieldPassagesWith } from '@manna/heartseed/home';
import { versesOf } from '@manna/heartseed/kjv';
import { listsOf, placeOf, singleVersesOf, type List } from '@manna/heartseed/lists';
import {
  heldCount,
  MOST_PASSAGES,
  MOST_SINGLES,
  type PassagesView,
} from '@manna/heartseed/passages';
import { offerStateOf, plantsSingly, SHELVES, type Shelf } from '@manna/heartseed/shelves';
import { Option } from 'effect';

import type { Held } from '../garden/program';
import { slugOf } from '../garden/view';

/** What a row offers now, as `offerStateOf` says it. */
export type AddOffer = 'unread' | 'in field' | 'full' | 'plant';

/** One list of a shelf: its id, its node name, title, count of verses, what it offers and the words the row shows of it. */
export interface AddRow {
  id: string;
  slug: string;
  title: string;
  count: string;
  offer: string;
  offerText: string;
  singly: boolean;
}

/** One shelf: `kind` is `bible` (the chooser), `lists` (the picks and the promises) or `handbook` (a section of the Handbook); `open` while its rows show, which they hold only then. */
export interface AddShelf {
  id: string;
  slug: string;
  title: string;
  note: string;
  kind: string;
  open: boolean;
  rows: AddRow[];
}

/** Add verses: whether the garden is read, the foot's line and its node name, and every shelf. */
export interface AddShown {
  read: boolean;
  line: string;
  lineId: string;
  shelves: AddShelf[];
}

/** One verse of a list's page and its words. */
export interface AddVerse {
  reference: string;
  slug: string;
  text: string;
}

/** A list's page before it is planted: its row and its verses with their words. */
export interface AddList {
  found: boolean;
  row: AddRow;
  shelf: string;
  line: string;
  lineId: string;
  verses: AddVerse[];
}

/** The shelf prefix of every Handbook section. */
const HANDBOOK = 'handbook:';

const kindOf = (shelf: Shelf) => {
  if (shelf.source._tag === 'Bible') return 'bible';
  if (shelf.id.startsWith(HANDBOOK)) return 'handbook';
  return 'lists';
};

const listsIn = (shelf: Shelf): readonly List[] => {
  if (shelf.source._tag === 'Bible') return [];
  return shelf.source.lists;
};

/** Every shelf row, by its slug, with its shelf. */
const ROWS: ReadonlyMap<string, { readonly list: List; readonly shelf: Shelf }> = new Map(
  SHELVES.flatMap((shelf) =>
    listsIn(shelf).map((list) => [slugOf(list.id), { list, shelf }] as const),
  ),
);

/** The shelf row named `slug`, if any. */
export const rowNamed = (slug: string) => Option.fromUndefinedOr(ROWS.get(slug));

/** The field the current home shows over a read: the lists, then the single verses, then each other verse planted. */
export const fieldFor = (held: Held): Option.Option<Field> => {
  const { garden, passages } = held;
  if (garden._tag === 'Unread' || passages._tag === 'Unread') return Option.none();
  return Option.some(
    fieldOf(garden, fieldPassagesWith(listsOf([], passages, []), singleVersesOf([], passages))),
  );
};

/** A read's passages and the field drawn of it once, which every row's offer reads. */
interface Seen {
  readonly passages: PassagesView;
  readonly field: Option.Option<Field>;
}

const seenOf = (held: Held): Seen => ({ passages: held.passages, field: fieldFor(held) });

/** A row's offer over a read: `unread` while the garden or the lists are. */
const offerOf = (list: List, seen: Seen): AddOffer =>
  Option.match(seen.field, {
    onNone: () => 'unread',
    onSome: (field) => offerStateOf(list, seen.passages, field),
  });

/** What a row writes of its offer: `Plant`, `In your field`, or nothing. */
const offerTextOf = (offer: AddOffer) => {
  if (offer === 'plant') return 'Plant';
  if (offer === 'in field') return 'In your field';
  return '';
};

/** A list's count as an offer writes it, over its distinct verses. */
const countOf = (list: List) => {
  if (list.verses.length === 1) return '1 verse';
  return `${list.verses.length} verses`;
};

/** A list as a row over a read. */
const rowOf = (list: List, seen: Seen): AddRow => {
  const offer = offerOf(list, seen);
  return {
    id: list.id,
    slug: slugOf(list.id),
    title: list.title,
    count: countOf(list),
    offer,
    offerText: offerTextOf(offer),
    singly: plantsSingly(list),
  };
};

const rowsOf = (lists: readonly List[], seen: Seen) => lists.map((list) => rowOf(list, seen));

/** The foot's line over the reader's passages: the lists' limit while the most are held, else the single verses' while they are at theirs. */
export const footOf = (passages: PassagesView) => {
  if (passages._tag === 'Read' && heldCount(passages) >= MOST_PASSAGES)
    return { line: LIMIT_LINE, lineId: 'limit' };
  if (passages._tag === 'Read' && passages.singles.length >= MOST_SINGLES)
    return { line: SINGLES_LIMIT_LINE, lineId: 'singles-limit' };
  return { line: '', lineId: '' };
};

/** Whether `held` is read whole. */
const readOf = (held: Held) => held.garden._tag === 'Read' && held.passages._tag === 'Read';

/** Add verses over a read, the shelf whose slug is `open` open (none for any other text). */
export const addShownOf = (held: Held, open: string): AddShown => {
  const seen = seenOf(held);
  return {
    read: readOf(held),
    ...footOf(held.passages),
    shelves: SHELVES.map((shelf) => {
      const slug = slugOf(shelf.id);
      const opened = slug === open && shelf.source._tag === 'Lists';
      return {
        id: shelf.id,
        slug,
        title: shelf.title,
        note: shelf.note,
        kind: kindOf(shelf),
        open: opened,
        rows: rowsOf(
          listsIn(shelf).filter(() => opened),
          seen,
        ),
      };
    }),
  };
};

/** The words of `reference`, a canon verse, from the corpus. */
const wordsOf = (reference: string) =>
  Option.match(placeOf(reference), {
    onNone: () => '',
    onSome: (place) => versesOf(place.book, place.chapter)[place.verse - 1] ?? '',
  });

/** The line a plant's answer leaves on a list's page: none for none and for a plant that landed, the limit its planting met on `Full`, else the alert naming the list, as the current sheet writes them. */
export const plantLineOf = (answer: string, row: AddRow) => {
  if (answer === '' || answer === 'Planted' || answer === 'Already')
    return { line: '', lineId: '' };
  if (answer === 'Full' && row.singly) return { line: SINGLES_LIMIT_LINE, lineId: 'singles-limit' };
  if (answer === 'Full') return { line: LIMIT_LINE, lineId: 'limit' };
  return { line: `${row.title} was not planted. Try again.`, lineId: 'plant-alert' };
};

/** A list's page's line: the last plant's, else the limit its planting meets while its row is full. */
const listLineOf = (answer: string, row: AddRow) => {
  const after = plantLineOf(answer, row);
  if (after.line === '' && row.offer === 'full') return plantLineOf('Full', row);
  return after;
};

const NO_ROW: AddRow = {
  id: '',
  slug: '',
  title: '',
  count: '',
  offer: 'unread',
  offerText: '',
  singly: false,
};

/** The list named `slug` over a read, its verses with their words, and the line the last plant's answer leaves (`answer`, empty for none). */
export const addListOf = (slug: string, held: Held, answer: string): AddList =>
  Option.match(rowNamed(slug), {
    onNone: () => ({ found: false, row: NO_ROW, shelf: '', line: '', lineId: '', verses: [] }),
    onSome: ({ list, shelf }) => {
      const row = rowOf(list, seenOf(held));
      return {
        found: true,
        row,
        shelf: slugOf(shelf.id),
        ...listLineOf(answer, row),
        verses: list.verses.map((reference) => ({
          reference,
          slug: slugOf(reference),
          text: wordsOf(reference),
        })),
      };
    },
  });
