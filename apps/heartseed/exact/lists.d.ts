import type { Option } from 'effect';

import type { PassagesView, Range } from './passages.d.ts';

/** A verse's book, chapter and verse numbers. */
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
  | { readonly _tag: 'Handbook'; readonly id: string };

/** A row of the app's own: a title and its verses, with a range when it is one. */
export interface Row {
  readonly title: string;
  readonly verses: ReadonlyArray<string>;
  readonly range?: Range;
}

/** A list: a row with an id and a source. */
export interface List extends Row {
  readonly id: string;
  readonly source: ListSource;
}

/** A promise collection or Handbook list: an id, a title and its ranges. */
export interface Collection {
  readonly id: string;
  readonly title: string;
  readonly promises: readonly Range[];
}

/** The place of a canon verse reference that writes back the same; none for any other text. */
export declare const placeOf: (reference: string) => Option.Option<Place>;

/** Each verse of `range`, by reference. */
export declare const versesIn: (range: Range) => readonly string[];

/** The lists a field holds over `view`, after the app's own rows and before the collections. */
export declare const listsOf: (
  own: readonly Row[],
  view: PassagesView,
  collections: readonly Collection[],
) => readonly List[];
