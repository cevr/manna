/**
 * The count-in's bar, as the player's silent clock reads the current app's:
 * `beats` beats of `beatMs` ms of the hymn each, one bar in all. This file
 * is `@manna/hymnal-app/player/countin` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): that check stages a package's
 * declarations, never its source, and the source reaches `effect` through
 * the tempo's rules. `src/tempo/tempo.test.ts` assigns the export the port
 * reads to its declaration here.
 */
export interface CountIn {
  readonly beats: number;
  readonly beatMs: number;
}

export declare const countInOf: (tempo: {
  readonly microsPerQuarter: number;
  readonly numerator: number;
  readonly denominator: number;
}) => CountIn;
