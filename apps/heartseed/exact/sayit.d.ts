import type { Context, Effect, Option } from 'effect';

import type { Grade } from './fsrs.d.ts';

export type { Grade };

/** The matcher's own grade for a recital: Again, Hard or Good. */
export type SuggestedGrade = 1 | 2 | 3;

/** One recital as the garden keeps it; `offset` is absent only in a record from before offsets were kept. */
export interface Recall {
  readonly reference: string;
  readonly startedAt: number;
  readonly offset?: number;
  readonly grade: Grade;
  readonly suggested: SuggestedGrade;
  readonly words: number;
  readonly missed: number;
  readonly peeked: number;
  readonly extra: number;
}

/** The help taken before a try: words peeked at rest by index, when Show all showed the verse (null for never), and the best grade the try may take. */
export interface Help {
  readonly reference: string;
  readonly peeked: readonly number[];
  // oxlint-disable-next-line effect/noNullish -- the current app's Help gives an absent Show all as null.
  readonly shownAt: number | null;
  readonly cap: Grade;
}

declare const RecallsTag: Context.ServiceClass<
  Recalls,
  'heartseed/sayit/Recalls',
  { readonly keep: (recall: Recall) => Effect.Effect<void> }
>;

/** Where a recital's recall is handed: the garden's layer provides it. */
export declare class Recalls extends RecallsTag {}

/** The best grade after a peek at rest: Hard. */
export declare const PEEK_CAP: Grade;

/** `grade` held to the help's cap. */
export declare const cappedBy: (grade: Grade, help: Option.Option<Help>) => Grade;
