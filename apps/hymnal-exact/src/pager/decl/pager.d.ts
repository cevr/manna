/**
 * `@manna/hymnal-app/reader/pager` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): the current app's hymn pager rule.
 * An `Option` is named by its two cases, as `src/hymns/decl/chords.d.ts`
 * names them.
 */
export type Opt<A> = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: A };

/** The hymns a pager moves through, in order, and the place it opens at. */
export interface Pages {
  readonly list: ReadonlyArray<number>;
  readonly index: number;
}

/** The pages for hymn `number`: the source list when it holds the hymn, else every hymn (`all`). */
export declare const pageSource: (
  source: Opt<ReadonlyArray<number>>,
  number: number,
  all: ReadonlyArray<number>,
) => Pages;

/** The hymn a pager of pages `width` wide shows once settled at `offset`; none for an empty list. */
export declare const settledAt: (
  offset: number,
  width: number,
  list: ReadonlyArray<number>,
) => Opt<number>;

/** Whether `offset` rests on a page's edge, to half a point. */
export declare const onPage: (offset: number, width: number) => boolean;

/** The width of the strip at the left edge whose pans go back, not to the hymn before. */
export declare const backEdge: number;
