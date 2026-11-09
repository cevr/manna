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
import { listsOf, type List } from '../lists';
import type { PassagesView } from '../passages';
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

/** The passages the field shows, as lists (`listsOf`): `own`, then each the reader holds in the order chosen (none while unread), then each taught collection. */
export const fieldPassagesOf = (
  own: readonly FieldPassage[],
  view: PassagesView,
  collections: readonly Collection[],
): readonly List[] => listsOf(own, view, collections);
