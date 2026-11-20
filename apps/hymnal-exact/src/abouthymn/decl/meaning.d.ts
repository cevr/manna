/**
 * The hymns most like hymn `number`, `count` at most, the nearest first, by
 * the shipped meaning table: `@manna/hymnal-app/hymns/meaning` as Exact's
 * type check reads it (the app's `tsconfig.json` maps it here).
 */
export declare const moreLike: (number: number, count?: number) => ReadonlyArray<number>;
