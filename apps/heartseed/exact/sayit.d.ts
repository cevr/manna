import type { Context, Effect, Option } from 'effect';

import type { MatcherView, SuggestedGrade } from './matcher.d.ts';

/** A grade of FSRS's four, 1 (Again) to 4 (Easy). */
export type Grade = 1 | 2 | 3 | 4;

/** Every grade, Again first. */
export declare const GRADES: readonly Grade[];

/** What the reader is shown for each grade. */
export declare const GRADE_NAMES: Readonly<Record<Grade, string>>;

/** One finished try as the garden keeps it; `src/sayit.ts` says what each count holds. */
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

/** Help taken at rest on one verse before its try: the words peeked, when Show all showed it (null before), and the try's best grade. */
export interface Help {
  readonly reference: string;
  readonly peeked: readonly number[];
  // oxlint-disable-next-line effect/noNullish -- the current Heartseed's help gives no Show all as null (`src/sayit.ts`).
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

/** A peek's cap on its try. */
export declare const PEEK_CAP: Grade;

/** A grade held to the help's cap; see `src/sayit.ts`. */
export declare const cappedBy: (grade: Grade, help: Option.Option<Help>) => Grade;

/** A finished try's recall from the matcher's view; see `src/sayit.ts`. */
export declare const recallOf: (
  reference: string,
  startedAt: number,
  offset: number,
  grade: Grade,
  suggested: SuggestedGrade,
  view: MatcherView,
) => Recall;

/** How many words peeked at rest the try itself left unpeeked; see `src/sayit.ts`. */
export declare const restPeeks: (help: Option.Option<Help>, matcher: MatcherView) => number;
