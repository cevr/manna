/** The rail's gutter at the list's right edge, in points. */
export declare const GUTTER: number;

/** A label's type size and line height at a text size of 1, in points. */
export declare const LABEL_SIZE: number;
export declare const LABEL_LINE: number;

/** The most a label's type grows with the reader's text size. */
export declare const LABEL_SCALE: number;

/** The top of label `index` of `count`, as a percent of the rail's height. */
export declare const labelAt: (index: number, count: number) => number;

/** The band under a touch at `y` on a rail `length` tall, cut into `count` bands. */
export declare const markAt: (y: number, length: number, count: number) => number;

/** The topics a drag passes going from topic place `before` to `now`. */
export declare const crossings: (before: number, now: number) => number;

/** A row of the current app's list, as `marksOf` reads it: a topic's, a shelf's or a hymn's. */
export interface RailRow {
  readonly kind: 'topic' | 'shelf' | 'hymn';
  readonly hymn?: { readonly number: number };
}

/** A hymn on the current app's rail: its number, its topic's place and the offset that shows it. */
export interface RailMark {
  readonly number: number;
  readonly section: number;
  readonly offset: number;
}

/** Each hymn after the first topic row, in the list's order. */
export declare const marksOf: (
  rows: ReadonlyArray<RailRow>,
  top: number,
  heightOf: (kind: RailRow['kind']) => number,
) => ReadonlyArray<RailMark>;

/** `shown` places spread evenly from the first to the last of `count`. */
export declare const labelsOf: (count: number, shown: number) => ReadonlyArray<number>;
