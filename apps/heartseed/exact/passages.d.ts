import type { Context, Effect, Layer, Stream } from 'effect';
import type { KeyValueStore } from 'effect/persistence/KeyValueStore';

/** The key the reader's ranges are kept under. */
export declare const PASSAGES_KEY: 'heartseed/passages';

/** The key the Handbook lists planted are kept under. */
export declare const LISTS_KEY: 'heartseed/lists';

/** The key the single verses are kept under. */
export declare const SINGLES_KEY: 'heartseed/singles';

/** How many ranges and lists a reader may hold, single verses not counted. */
export declare const MOST_PASSAGES: 3;

/** How many single verses a reader may hold. */
export declare const MOST_SINGLES: 20;

/** The longest range a reader may add, in verses. */
export declare const MOST_VERSES: 20;

/** The fewest verses a list may hold. */
export declare const LEAST_VERSES: 3;

/** Verses `first` to `last` of one chapter, by canon numbers. */
export interface Range {
  readonly book: number;
  readonly chapter: number;
  readonly first: number;
  readonly last: number;
}

/** Whether `range` lies in one chapter of the canon. */
export declare const inChapter: (range: Range) => boolean;

/** How many verses `range` spans. */
export declare const verseCount: (range: Range) => number;

/** Whether a reader may add `range`: in one chapter and short enough. */
export declare const choosable: (range: Range) => boolean;

/** Whether `range` holds fewer verses than a list may. */
export declare const isShort: (range: Range) => boolean;

/** The title home gives the single verses. */
export declare const SINGLES_TITLE: 'Single verses';

/** One verse's reference as the canon writes it. */
export declare const verseReference: (book: number, chapter: number, verse: number) => string;

/** A range's reference as the canon writes it. */
export declare const passageReference: (range: Range) => string;

/** The ranges, lists and single verses held, or `Unread`. */
export type PassagesView =
  | {
      readonly _tag: 'Read';
      readonly passages: ReadonlyArray<Range>;
      readonly lists: ReadonlyArray<string>;
      readonly singles: ReadonlyArray<Range>;
    }
  | { readonly _tag: 'Unread' };

/** How many passages and lists `view` holds together; none when unread. */
export declare const heldCount: (view: PassagesView) => number;

/** What an add answers; `Short` for a range under the fewest a list holds. */
export type AddAnswer = 'Added' | 'Full' | 'Invalid' | 'Short' | 'Unread' | 'Failed';

/** What a remove, a part or an uproot answers. */
export type RemoveAnswer = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** What a plant of a Handbook list answers. */
export type PlantAnswer = 'Added' | 'Held' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

/** What a join of single verses answers. */
export type JoinAnswer = PlantAnswer;

declare const PassagesTag: Context.ServiceClass<
  Passages,
  'heartseed/passages/Passages',
  {
    readonly view: Effect.Effect<PassagesView>;
    readonly changes: Stream.Stream<PassagesView>;
    readonly add: (range: Range) => Effect.Effect<AddAnswer>;
    readonly join: (range: Range) => Effect.Effect<JoinAnswer>;
    readonly part: (range: Range) => Effect.Effect<RemoveAnswer>;
    readonly remove: (range: Range) => Effect.Effect<RemoveAnswer>;
    readonly plant: (id: string) => Effect.Effect<PlantAnswer>;
    readonly uproot: (id: string) => Effect.Effect<RemoveAnswer>;
  }
>;

/** The reader's ranges, lists and single verses over a store. */
export declare class Passages extends PassagesTag {}

/** The passages over a store, read (and one-verse passages moved to the single verses) at its build. */
export declare const layer: Layer.Layer<Passages, never, KeyValueStore>;
