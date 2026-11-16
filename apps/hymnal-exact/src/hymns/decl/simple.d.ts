/**
 * `@manna/hymnal-app/hymns/simple` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): the current hymnal's Simple chords,
 * its default style. `src/chords/held.test.ts` holds it to the source.
 */

import type { HymnChords } from './chords';

/** A hymn's Simple chords: the same parts, lines, words and boxes, at most one plain chord over each. */
export declare const simple: (chords: HymnChords) => HymnChords;
