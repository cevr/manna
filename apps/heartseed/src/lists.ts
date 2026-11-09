/**
 * Verses and lists, the one model every source of verses makes (owner,
 * 2026-11-09). A verse is its reference as the canon writes it, and its plant
 * is the garden's plant at that key: no list owns a plant, and no list is
 * stored beside one. A list is an ordered set of verses, each at most once,
 * that says where it came from: the app's own row, a passage (a chapter, a
 * promise, any picked range), a promise collection, or one verse that no
 * other list names. Lists differ only in their source, so one verse in many
 * lists is one plant in each of them.
 *
 * This is a read model over today's keys: nothing here reads or writes the
 * store, and the field's rows are the lists, in order.
 */

import { getBibleBookByName } from '@manna/core/bible';
import { Option } from 'effect';

import type { FieldPassage } from './field';
import { versesOf } from './kjv';
import { passageReference, verseReference, type PassagesView, type Range } from './passages';
import type { Collection } from './promises';

/** A verse's place in the canon: its book's number, its chapter and its verse. */
export interface Place {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** Where a list's verses come from. */
export type ListSource =
  | { readonly _tag: 'Own' }
  | { readonly _tag: 'Passage'; readonly range: Range }
  | { readonly _tag: 'Collection'; readonly id: string }
  | { readonly _tag: 'Loose' };

/** A list: a row of the field with an id unique among its lists, and its source; `range` is present exactly on a `Passage` list. */
export interface List extends FieldPassage {
  readonly id: string;
  readonly source: ListSource;
}

/** A verse reference as the canon writes one: a book name, a chapter and a verse. */
const VERSE = /^(.+) ([1-9]\d*):([1-9]\d*)$/u;

/** The place of `reference` when it is a canon verse that round-trips exactly (`verseReference` writes it back the same); none for any other text, a phrase's reference included. */
export const placeOf = (reference: string): Option.Option<Place> =>
  Option.fromNullishOr(VERSE.exec(reference)).pipe(
    Option.flatMap(([, name = '', chapter = '', verse = '']) =>
      Option.map(getBibleBookByName(name), (book) => ({
        book: book.number,
        chapter: Number(chapter),
        verse: Number(verse),
      })),
    ),
    Option.filter(
      (place) =>
        place.verse <= versesOf(place.book, place.chapter).length &&
        verseReference(place.book, place.chapter, place.verse) === reference,
    ),
  );

/** Each verse of `range`, by reference, in order. */
export const versesIn = (range: Range): readonly string[] =>
  Array.from({ length: range.last - range.first + 1 }, (_, index) =>
    verseReference(range.book, range.chapter, range.first + index),
  );

/** `<book>.<chapter>.<first>-<last>`, a range as an id writes it. */
const rangeId = (range: Range) => `${range.book}.${range.chapter}.${range.first}-${range.last}`;

/** One of the app's own rows as a list. */
const ownList = (row: FieldPassage): List => ({
  id: `own:${row.title}`,
  title: row.title,
  verses: row.verses,
  source: { _tag: 'Own' },
});

/** A range as a `Passage` list with id `<prefix><book>.<chapter>.<first>-<last>`: titled by its reference, each verse its own, carrying its range, so its row offers `Remove`. */
export const passageList = (prefix: string, range: Range): List => ({
  id: `${prefix}${rangeId(range)}`,
  title: passageReference(range),
  verses: versesIn(range),
  range,
  source: { _tag: 'Passage', range },
});

/** A collection as a list: titled by its title, its promises' verses in order, each once, with no range, so its row offers no `Remove`. */
export const collectionList = (collection: Collection): List => ({
  id: `collection:${collection.id}`,
  title: collection.title,
  verses: [...new Set(collection.promises.flatMap(versesIn))],
  source: { _tag: 'Collection', id: collection.id },
});

/** One verse no other list names, as a list of its own. */
export const looseList = (reference: string): List => ({
  id: `verse:${reference}`,
  title: reference,
  verses: [reference],
  source: { _tag: 'Loose' },
});

/** Each range held as a `Passage` list, its id naming its place in the stored list so two equal ranges differ; none while unread. */
const heldLists = (view: PassagesView): readonly List[] => {
  if (view._tag === 'Unread') return [];
  return view.passages.map((range, index) => passageList(`passage:${index}:`, range));
};

/** The lists the field holds: `own` as the app's own rows, then each range held in stored order (none while unread), then each taught collection. */
export const listsOf = (
  own: readonly FieldPassage[],
  view: PassagesView,
  collections: readonly Collection[],
): readonly List[] => [...own.map(ownList), ...heldLists(view), ...collections.map(collectionList)];
