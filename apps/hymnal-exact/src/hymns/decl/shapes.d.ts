/**
 * `@manna/hymnal-app/hymns/shapes` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): how a chord is held on a guitar in
 * standard tuning, as the current hymnal's chord box draws it. Each
 * `Option` is named by its two shapes (`Opt`). `src/chords/held.test.ts`
 * holds it to the source.
 */

import type { Chord, Key } from '@manna/hymnal/chord';

import type { Opt } from './chords';

/** A string muted, left open, or held at a fret by a finger, 1 (the index) to 4. */
type OnString =
  | { _tag: 'Muted' }
  | { _tag: 'Open' }
  | { _tag: 'Fretted'; fret: number; finger: number };

/** A chord as held: six strings from the low E, a barre (one finger across strings `from` to `to`), the fret its box starts at, and the chord played instead of a slash chord's. */
export interface Fingering {
  strings: ReadonlyArray<OnString>;
  barre: Opt<{ fret: number; finger: number; from: number; to: number }>;
  first: number;
  playedAs: Opt<Chord>;
}

/** How many frets a box draws. */
export declare const FRETS_DRAWN: number;

/** How to play `chord` in `key`, the key the page spells it in; none for a chord no fingering plays. */
export declare const fingeringOf: (chord: Chord, key: Key) => Opt<Fingering>;
