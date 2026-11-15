/**
 * `src/player/stanzas.ts` as Exact's type check reads it (it stages a
 * package's declarations, never its source): the rules of a stanza choice
 * and of the cut it makes of a hymn's timeline, in the port's terms. A
 * choice is its stanza numbers, ascending; `[]` is every stanza.
 * `test/exact-declarations.ts` holds it to the source. A section is a
 * stanza by its number, or a refrain with the stanza it is sung with (0
 * for the hymn's own).
 */
export type Section =
  | { readonly kind: 'stanza'; readonly n: number; readonly lines: ReadonlyArray<string> }
  | { readonly kind: 'refrain'; readonly stanza: number; readonly lines: ReadonlyArray<string> };

/** One sung line's times, in milliseconds. */
export interface TimedLine {
  readonly start: number;
  readonly until: number;
  readonly played: boolean;
  readonly even: boolean;
  readonly syllables: ReadonlyArray<number>;
  readonly words: ReadonlyArray<number>;
}

/** A hymn's sung lines in time, its first tempo, its first line's start and its end. */
export interface Timeline {
  readonly tempo: {
    readonly microsPerQuarter: number;
    readonly numerator: number;
    readonly denominator: number;
  };
  readonly lines: ReadonlyArray<TimedLine>;
  readonly first: number;
  readonly end: number;
}

/** A timeline cut to a choice, and its maps between sung time and the recording's, in ms. */
export interface Cut {
  readonly timeline: Timeline;
  readonly recordingAt: (sung: number) => number;
  readonly sungAt: (recording: number) => number;
  readonly skips: ReadonlyArray<{ readonly from: number; readonly to: number }>;
}

/** How many stanza chips `sections` make. */
export declare const countOf: (sections: ReadonlyArray<Section>) => number;

/** Whether each sung line of `sections`, in order, is sung under `choice`. */
export declare const keptOf: (
  sections: ReadonlyArray<Section>,
  choice: ReadonlyArray<number>,
) => ReadonlyArray<boolean>;

/** `timeline` with only the lines `kept` marks sung. */
export declare const cutOf: (timeline: Timeline, kept: ReadonlyArray<boolean>) => Cut;

/** The choice after a tap on stanza `stanza` of a hymn of `count` stanzas. */
export declare const toggle: (
  choice: ReadonlyArray<number>,
  stanza: number,
  count: number,
) => ReadonlyArray<number>;

/** The stanzas `choice` sings of a hymn of `count`. */
export declare const chosenOf: (
  choice: ReadonlyArray<number>,
  count: number,
) => ReadonlyArray<number>;
