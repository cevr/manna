/**
 * The Download all size estimate, as the current app's
 * `offline/estimate.ts` makes it from each hymn's timing. This file is
 * `@manna/hymnal-app/offline/estimate` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): that check stages a package's
 * declarations, never its source, and the source reaches `effect`.
 * `src/offline/sources.test.ts` assigns the export the port reads to its
 * declaration here.
 */
export declare const estimateMegabytes: (
  bundled: ReadonlyArray<readonly [number, string]>,
) => number;
