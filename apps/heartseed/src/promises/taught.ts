/**
 * The collections the session teaches, as one part of the app's layer: the
 * session plans over their verses after the reader's passages, and the field
 * shows each as a row of its own. A layer built without the part teaches
 * none, so every screen and plan reads as it did before the collections. The
 * part is ids; an id no collection has teaches nothing, and the collections
 * keep the order of the ids given.
 */

import { Context, Layer } from 'effect';

import type { FieldPassage } from '../field';
import { type PassagesView, passageReference, type Range, verseReference } from '../passages';
import { COLLECTIONS, type Collection } from '../promises';

/** The collections taught, in the order the app's layer gave their ids. */
export class Taught extends Context.Service<
  Taught,
  { readonly collections: readonly Collection[] }
>()('heartseed/promises/Taught') {}

/** The collections the ids `ids` name, in their order; an id no collection has gives none. */
export const collectionsOf = (ids: readonly string[]): readonly Collection[] =>
  ids.flatMap((id) => COLLECTIONS.filter((collection) => collection.id === id));

/** The taught collections of `ids` (`collectionsOf`). */
export const layer = (ids: readonly string[]): Layer.Layer<Taught> =>
  Layer.succeed(Taught, Taught.of({ collections: collectionsOf(ids) }));

/** Each verse of `range`, by reference, in order. */
const versesIn = (range: Range): readonly string[] =>
  Array.from({ length: range.last - range.first + 1 }, (_, index) =>
    verseReference(range.book, range.chapter, range.first + index),
  );

/** A passage the reader holds as the field shows it: titled by its reference, each verse its own, carrying its range, so its row offers `Remove`. */
const heldPassage = (range: Range): FieldPassage => ({
  title: passageReference(range),
  verses: versesIn(range),
  range,
});

/** A taught collection as the field shows it: titled by its title, its verses in order, each once, with no range, so its row offers no `Remove`. */
const taughtPassage = (collection: Collection): FieldPassage => ({
  title: collection.title,
  verses: [...new Set(collection.promises.flatMap(versesIn))],
});

/** The passages the field shows: `own`, then each the reader holds in the order chosen (none while unread), then each taught collection. */
export const fieldPassagesOf = (
  own: readonly FieldPassage[],
  view: PassagesView,
  collections: readonly Collection[],
): readonly FieldPassage[] => {
  const taught = collections.map(taughtPassage);
  if (view._tag === 'Unread') return [...own, ...taught];
  return [...own, ...view.passages.map(heldPassage), ...taught];
};
