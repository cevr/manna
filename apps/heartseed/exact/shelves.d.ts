import type { Field } from './field.d.ts';
import type { HomeIcon } from './home.d.ts';
import type { List } from './lists.d.ts';
import type { PassagesView } from './passages.d.ts';

/** Where a shelf's lists come from: the chooser over the whole Bible, or lists of its own. */
export type ShelfSource =
  | { readonly _tag: 'Bible' }
  | { readonly _tag: 'Lists'; readonly lists: readonly List[] };

/** A shelf of Add verses: its id, title, icon, the line under its title, and its lists. */
export interface Shelf {
  readonly id: string;
  readonly title: string;
  readonly icon: HomeIcon;
  readonly note: string;
  readonly source: ShelfSource;
}

/** Every shelf of Add verses, in its order: any passage, the picks, the collections not taught, then each section of the Handbook. */
export declare const SHELVES: readonly Shelf[];

/** Whether `list` plants as single verses: a passage under the fewest a list holds. */
export declare const plantsSingly: (list: List) => boolean;

/** What a shelf's row offers for `list` over the reader's passages and the field. */
export declare const offerStateOf: (
  list: List,
  passages: PassagesView,
  field: Field,
) => 'unread' | 'in field' | 'full' | 'plant';
