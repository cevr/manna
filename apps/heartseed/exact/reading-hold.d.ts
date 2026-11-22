import type { Option } from 'effect';

/** How long a finger rests still on the words before the hold takes it, in milliseconds; see `src/reading/hold.ts`. */
export declare const LONG_PRESS: 350;

/** What a moment of the hold asks of the voice. */
export type Ask =
  | { readonly _tag: 'Hold' }
  | { readonly _tag: 'Seek'; readonly word: number }
  | { readonly _tag: 'LetGo' };

/** One moment of the hold: the held word after it, whether the screen is told it, and the one ask, if any. */
export interface Moment {
  readonly held: Option.Option<number>;
  readonly told: boolean;
  readonly ask: Option.Option<Ask>;
}

/** The hold's activation with `word` under the finger. */
export declare const activate: (held: Option.Option<number>, word: Option.Option<number>) => Moment;

/** A move with `word` under the finger. */
export declare const update: (held: Option.Option<number>, word: Option.Option<number>) => Moment;

/** The hold's end, a release or a cancel. */
export declare const finalize: (held: Option.Option<number>, canceled: boolean) => Moment;

/** The view gone while held. */
export declare const drop: (held: Option.Option<number>) => Moment;
