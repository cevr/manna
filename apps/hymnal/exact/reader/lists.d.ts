/**
 * `src/reader/lists.ts` as Exact's type check reads it: the reader's two
 * lists of hymn numbers, Favourites and Recent, and how a star and an
 * opened hymn change them. `test/exact-home-declarations.ts` holds it to
 * the source. This is how many hymns Recent keeps.
 */
export declare const RECENT: number;

/** How many of Recent's hymns the home list's shelf shows. */
export declare const RECENT_SHOWN: number;

/** Favourites with hymn `n` added in number order, or taken out when it was there. */
export declare const toggleFavourite: (
  list: ReadonlyArray<number>,
  n: number,
) => ReadonlyArray<number>;

/** Recent once hymn `n` is opened: it first, each hymn once, at most `RECENT`. */
export declare const visited: (recent: ReadonlyArray<number>, n: number) => ReadonlyArray<number>;
