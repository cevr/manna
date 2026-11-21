/**
 * `@manna/hymnal-app/hymns/chords` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): a hymn's chords over its syllables,
 * decoded from the string the build ships, and a hymn's move (a transpose
 * and a capo) with the keys it reaches. Each `Option` is named by the two
 * shapes it takes at run time (`Opt`), since `effect`'s declarations cannot
 * be staged here. `src/chords/held.test.ts` holds it to the source.
 */

import type { Chord, Key } from '@manna/hymnal/chord';

import type { HymnText } from './text';

export type Opt<A> = { _tag: 'None' } | { _tag: 'Some'; value: A };

/** A syllable as printed, with the chords changing on it in order; a word is its syllables. */
export type Word = ReadonlyArray<{ text: string; chords: ReadonlyArray<Chord> }>;

/** Some lines, each its words. */
type Lines = ReadonlyArray<ReadonlyArray<Word>>;

/** A stanza's or the refrain's chords: its words alone, or its lines at a level. */
export type PartChords = { _tag: 'Plain' } | { _tag: 'Sung'; level: string; lines: Lines };

/** A hymn's chords: the key they are degrees in, stanza n's at n - 1, and the refrain's. */
export interface HymnChords {
  number: number;
  key: Key;
  stanzas: ReadonlyArray<PartChords>;
  refrain: Opt<PartChords>;
}

/** A section of the page: its words alone, or its lines' syllables under their chords. */
export type SectionChords = { _tag: 'Words' } | { _tag: 'Syllables'; lines: Lines };

/** A hymn's move: semitones the sounding key is raised (-5..6) and the capo's fret (0..11). */
export type Move = { transpose: number; capo: number };

/** Each section of `text`, in page order, with its chords or as words alone. */
export declare const sectionsOf: (
  text: HymnText,
  chords: HymnChords,
) => ReadonlyArray<SectionChords>;

/** Whether any part of the hymn carries a chord. */
export declare const hasChords: (chords: HymnChords) => boolean;

/** No transpose and no capo: the hymn as printed. */
export declare const still: Move;

/** `move` with its sounding key raised `by` semitones, wrapped into its range. */
export declare const transposed: (move: Move, by: number) => Move;

/** `move` with its capo `by` frets higher, held to its range. */
export declare const capoed: (move: Move, by: number) => Move;

/** The key the hymn sounds in after `move`'s transpose. */
export declare const soundingKey: (key: Key, move: Move) => Key;

/** The key the chords are shown in: the sounding key, less the capo. */
export declare const playedKey: (key: Key, move: Move) => Key;

/** A key as a chord chart names it: "Db", "Dm". */
export declare const keyName: (key: Key) => string;

/** Where chords fall: on the beat (the default), folded simpler, or as the file plays. */
export type Placement = 'beat' | 'simpler' | 'file';

/** A hymn's chords from its shipped string at a placement; none for a string that does not decode. */
export declare const decodeHymn: (encoded: string, placement?: Placement) => Opt<HymnChords>;
