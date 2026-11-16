/**
 * Milliseconds each way the tiles of `All at once` move: in, out, and the
 * still cross-fade. This file is `@manna/hymnal-app/home/tile-times` as
 * Exact's type check reads it (the app's `tsconfig.json` maps it here),
 * since that check stages a package's declarations, never its source;
 * `src/look/motion.test.ts` holds it to the source, which the repo's
 * typecheck reads.
 */
export declare const tileTimes: {
  readonly in: number;
  readonly out: number;
  readonly fade: number;
};
