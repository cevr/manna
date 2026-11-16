import type { Option } from 'effect';

/** The line while a reader holds the most passages and lists. */
export declare const LIMIT_LINE: '3 passages or lists, the most for now. Remove one to add another.';

/** The line while a reader holds the most single verses. */
export declare const SINGLES_LIMIT_LINE: '20 single verses, the most for now. Remove one to add another.';

/** The line when a range is too short to be a list. */
export declare const SHORT_LINE: 'A list holds at least 3 verses.';

/** The verses chosen in one chapter, first to last. */
export interface Verses {
  readonly first: number;
  readonly last: number;
}

/** The range after a tap on `verse` of a chapter of `count` verses. */
export declare const tapVerse: (
  chosen: Option.Option<Verses>,
  verse: number,
  count: number,
) => Option.Option<Verses>;
