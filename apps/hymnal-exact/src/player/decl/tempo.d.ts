/**
 * The tempo's rules, as the player and its dial read the current app's.
 * This file is `@manna/hymnal-app/player/tempo` as Exact's type check reads
 * it (the app's `tsconfig.json` maps it here): that check stages a
 * package's declarations, never its source, and the source imports
 * `effect` for its `Tempo` schema and its tap's `Option`. Here a tap's stop
 * is an option by its tag alone. The repo's typecheck reads the source
 * itself, and `src/tempo/tempo.test.ts` assigns each export the port reads
 * to its declaration here, so a source that renames or retypes one fails it.
 */

type Meter = { readonly numerator: number; readonly denominator: number };
type FirstTempo = { readonly microsPerQuarter: number } & Meter;

/** A hymn's beat: its length in quarters, its name, its note's denominator, dotted or not. */
export type Beat = { readonly quarters: number; readonly name: string } & {
  readonly note: number;
  readonly dotted: boolean;
};

export declare const DEFAULT_TEMPO: number;
export declare const STOPS: ReadonlyArray<number>;
export declare const saidOf: (tempo: number) => string;
export declare const stopIndexOf: (tempo: number) => number;
export declare const stopAt: (n: number) => number;
export declare const rateOf: (tempo: number) => number;
export declare const beatOf: (meter: Meter) => Beat;
export declare const bpmOf: (tempo: FirstTempo) => number;
export declare const bpmAt: (hymnBpm: number, tempo: number) => number;

/** What one tap leaves: its run, and the stop it sets, none while the run is short. */
export type Tapped = { readonly run: ReadonlyArray<number>; readonly tempo: Stop };

/** A tap's stop, an option by its tag. */
type Stop = { readonly _tag: 'Some'; readonly value: number } | { readonly _tag: 'None' };

export declare const tap: (run: ReadonlyArray<number>, at: number, hymnBpm: number) => Tapped;
