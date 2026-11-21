/** A found line, or none. */
export type Line = { readonly _tag: 'Some'; readonly value: string } | { readonly _tag: 'None' };

/** A row: a topic's (a section's name) or a hymn's, with the line a search found it by. */
export type Row<Hymn> =
  | { readonly kind: 'topic'; readonly key: string; readonly name: string }
  | { readonly kind: 'shelf'; readonly key: string; readonly name: string; readonly href: string }
  | {
      readonly kind: 'hymn';
      readonly key: string;
      readonly hymn: Hymn;
      readonly source: ReadonlyArray<number>;
      readonly favourite: boolean;
      readonly line: Line;
    };

export interface Rows<Hymn> {
  readonly rows: ReadonlyArray<Row<Hymn>>;
  readonly sticky: ReadonlyArray<number>;
}

/** A list with no topic rows: a row per hymn, each with the line `lines` gives it. */
export declare const plainRowsOf: <Hymn extends { readonly number: number }>(
  hymns: ReadonlyArray<Hymn>,
  favourites?: ReadonlySet<number>,
  lines?: ReadonlyMap<number, string>,
) => Rows<Hymn>;

/** How many of a search's strongest matches stand above `Hymns about this`. */
export declare const STRONG: number;

/** A search's results with the hymns `about` it: the strongest matches, `Hymns about this`, then `More matches`. */
export declare const resultRowsOf: <Hymn extends { readonly number: number }>(
  found: ReadonlyArray<Hymn>,
  about: ReadonlyArray<Hymn>,
  favourites?: ReadonlySet<number>,
  lines?: ReadonlyMap<number, string>,
) => Rows<Hymn>;
