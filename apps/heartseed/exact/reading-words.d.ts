import type { Option } from 'effect';

/** A word's box in the reading view's own coordinates; see `src/reading/words.ts`. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What each word of the reading view shows. */
export declare const shownWordsOf: (text: string) => ReadonlyArray<string>;

/** The word under a finger at `(x, y)`, over each laid-out word's box by word number. */
export declare const wordAt: (
  x: number,
  y: number,
  boxes: ReadonlyMap<number, Box>,
) => Option.Option<number>;
