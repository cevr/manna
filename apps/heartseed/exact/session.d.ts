import type { ReadGarden } from './garden.d.ts';

/** The session lengths a reader chooses from, in minutes, shortest first; see `src/session.ts`. */
export declare const MINUTES: readonly [2, 5, 10, 20];
/** One of the session lengths. */
export type Minutes = (typeof MINUTES)[number];

/** A whole verse the app holds words for: its reference, how many words it has, and the passage or collection it is grouped under. */
export interface Piece {
  readonly reference: string;
  readonly words: number;
  readonly group: string;
}

/** A piece with the words Today shows. */
export interface TextPiece extends Piece {
  readonly text: string;
}

/** One verse a session offers: a review or the new piece (`fresh`), its plant's recalls when it was planned, and its estimate in seconds. */
export interface Item {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
  readonly seconds: number;
}

/** A session's items in the order offered. */
export interface Plan {
  readonly items: readonly Item[];
}

/** Whether `item` is done in `garden`: its plant holds more recalls than when it was planned. */
export declare const isDone: (garden: ReadGarden, item: Item) => boolean;

/** Today's counts line for `plan` over the garden now, of the items not done. */
export declare const countsOf: (plan: Plan, garden: ReadGarden) => string;
