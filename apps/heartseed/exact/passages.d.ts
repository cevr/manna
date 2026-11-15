import type { Context, Effect, Layer, Stream } from 'effect';
import type { KeyValueStore } from 'effect/persistence/KeyValueStore';

/** The key the reader's ranges are kept under. */
export declare const PASSAGES_KEY: 'heartseed/passages';

/** The key the Handbook lists planted are kept under. */
export declare const LISTS_KEY: 'heartseed/lists';

/** How many ranges and lists a reader may hold. */
export declare const MOST_PASSAGES: 3;

/** The longest range a reader may add, in verses. */
export declare const MOST_VERSES: 20;

/** Verses `first` to `last` of one chapter, by canon numbers. */
export interface Range {
  readonly book: number;
  readonly chapter: number;
  readonly first: number;
  readonly last: number;
}

/** Whether `range` lies in one chapter of the canon. */
export declare const inChapter: (range: Range) => boolean;

/** Whether a reader may add `range`: in one chapter and short enough. */
export declare const choosable: (range: Range) => boolean;

/** One verse's reference as the canon writes it. */
export declare const verseReference: (book: number, chapter: number, verse: number) => string;

/** A range's reference as the canon writes it. */
export declare const passageReference: (range: Range) => string;

/** The ranges and lists held, or `Unread`. */
export type PassagesView =
  | {
      readonly _tag: 'Read';
      readonly passages: ReadonlyArray<Range>;
      readonly lists: ReadonlyArray<string>;
    }
  | { readonly _tag: 'Unread' };

/** What an add answers. */
export type AddAnswer = 'Added' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

/** What a remove or an uproot answers. */
export type RemoveAnswer = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** What a plant of a Handbook list answers. */
export type PlantAnswer = 'Added' | 'Held' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

declare const PassagesTag: Context.ServiceClass<
  Passages,
  'heartseed/passages/Passages',
  {
    readonly view: Effect.Effect<PassagesView>;
    readonly changes: Stream.Stream<PassagesView>;
    readonly add: (range: Range) => Effect.Effect<AddAnswer>;
    readonly remove: (range: Range) => Effect.Effect<RemoveAnswer>;
    readonly plant: (id: string) => Effect.Effect<PlantAnswer>;
    readonly uproot: (id: string) => Effect.Effect<RemoveAnswer>;
  }
>;

/** The reader's ranges and lists over a store. */
export declare class Passages extends PassagesTag {}

/** The passages over a store, read at its build. */
export declare const layer: Layer.Layer<Passages, never, KeyValueStore>;
