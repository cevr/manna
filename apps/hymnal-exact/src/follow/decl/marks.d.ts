/**
 * The current hymnal's marks (`src/follow/marks.ts`) as Exact's type check
 * reads them (the app's `tsconfig.json` maps `@manna/hymnal-app/follow/marks`
 * here): a line not sung is `OFF`, a sung line with no syllable times
 * `WHOLE`. `src/follow/follow.model.test.ts` holds them to the source.
 */

export declare const OFF: number;
export declare const WHOLE: number;
