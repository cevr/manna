/**
 * `src/home/opening.ts` as Exact's type check reads it: how a hymn chosen
 * from a search or the drums opens, by the path of the screen it was chosen
 * on: pushed over the screen, in place of the hymn page, or not moved at
 * all. `test/exact-home-declarations.ts` holds it to the source.
 */
export type Opening = 'push' | 'replace' | 'stay';

/** How hymn `number`, chosen on the screen at `path`, opens. */
export declare const openingAt: (path: string, number: number) => Opening;
