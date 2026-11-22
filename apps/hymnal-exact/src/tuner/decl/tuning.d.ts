/**
 * `@manna/hymnal-app/tuner/tuning` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here; the workspace's typecheck reads the
 * source): standard tuning and a pitch's reading against it.
 * `src/tuner/held.test.ts` holds it to the source. The six strings, by
 * their notes:
 */
export type StringId = 'E4' | 'B3' | 'G3' | 'D3' | 'A2' | 'E2';

/** A string and its pitch. */
export type GuitarString = Readonly<{ id: StringId; hz: number }>;

/** A pitch read: its note and cents, and the string it is read against. */
export type Reading = Readonly<{
  note: string;
  octave: number;
  cents: number;
  string: StringId;
  stringCents: number;
  inTune: boolean;
}>;

/** The strings of standard tuning, from the lowest. */
export declare const STRINGS: ReadonlyArray<GuitarString>;

/** How many cents off a string may be, either way, and still be in tune. */
export declare const IN_TUNE_CENTS: number;

/** The Auto reading of a pitch: against the nearest of the six strings. */
export declare const reading: (hz: number) => Reading;

/** The reading of a pitch on a picked string, however far off. */
export declare const readingOn: (hz: number, string: StringId) => Reading;
