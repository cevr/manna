/** A found line, or none. */
export type Line = { readonly _tag: 'Some'; readonly value: string } | { readonly _tag: 'None' };

/** A row: a header's (a section's name) or a hymn's, with the line a search found it by. */
export type Row<H> =
  | { readonly kind: 'topic' | 'shelf'; readonly name: string }
  | { readonly kind: 'hymn'; readonly hymn: H; readonly line: Line };

/** The rows in the order the list draws them. */
export interface Rows<H> {
  readonly rows: ReadonlyArray<Row<H>>;
}

/** A list with no headers: a row per hymn, each with the line `lineOf` gives it. */
export declare const plainRowsOf: <H extends { readonly number: number }>(
  each: ReadonlyArray<H>,
  starred?: ReadonlySet<number>,
  lineOf?: ReadonlyMap<number, string>,
) => Rows<H>;

/** How many of a search's strongest matches stand above `Hymns about this`. */
export declare const STRONG: number;

/** A search's results with the hymns `near` it: the strongest matches, `Hymns about this`, then `More matches`. */
export declare const resultRowsOf: <H extends { readonly number: number }>(
  matches: ReadonlyArray<H>,
  near: ReadonlyArray<H>,
  starred?: ReadonlySet<number>,
  lineOf?: ReadonlyMap<number, string>,
) => Rows<H>;
