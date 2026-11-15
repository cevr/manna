/**
 * The declarations Exact's type check reads in place of the current app's
 * chords, shapes, Simple style and the hymnal's chord spelling
 * (`src/hymns/decl/{chords,shapes,simple}.d.ts`, `src/chords/decl/chord.d.ts`,
 * mapped by the app's `tsconfig.json`) stay true to them: each source
 * export the port reads is assigned to its declaration, so the repo's type
 * check of this file fails the day a source's signature drifts from what
 * the port was told; and each is there at run time.
 */

import { expect, test } from 'bun:test';

import * as chord from '@manna/hymnal/chord';
import * as chords from '@manna/hymnal-app/hymns/chords';
import * as fingerings from '@manna/hymnal-app/hymns/shapes';
import * as simpleStyle from '@manna/hymnal-app/hymns/simple';

import type * as ChordDecl from './decl/chord';
import type * as ChordsDecl from '../hymns/decl/chords';
import type * as FingeringsDecl from '../hymns/decl/shapes';
import type * as SimpleDecl from '../hymns/decl/simple';

/**
 * A module's declaration with each function's parameters compared both
 * ways (TypeScript's method bivariance): the declarations name a value's
 * fields in looser terms (a quality as a string, a hymn by the fields the
 * port reads), which the source's own values always meet, while what a
 * function answers must meet its declaration exactly.
 */
type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  chord: {
    Quality: chord.Quality,
    format: chord.format,
    keyFromSignature: chord.keyFromSignature,
  } satisfies Held<typeof ChordDecl>,
  chords: {
    /** Its answer alone: the reader's `text.d.ts` declares a hymn's sections mutable, the source readonly. */
    sectionsOf: (text: never, of: never) => chords.sectionsOf(text, of),
    hasChords: chords.hasChords,
    still: chords.still,
    transposed: chords.transposed,
    capoed: chords.capoed,
    soundingKey: chords.soundingKey,
    playedKey: chords.playedKey,
    keyName: chords.keyName,
    decodeHymn: chords.decodeHymn,
  } satisfies Held<typeof ChordsDecl>,
  fingerings: {
    FRETS_DRAWN: fingerings.FRETS_DRAWN,
    fingeringOf: fingerings.fingeringOf,
  } satisfies Held<typeof FingeringsDecl>,
  simple: { simple: simpleStyle.simple } satisfies Held<typeof SimpleDecl>,
};

test('every declared name the port reads is the current source’s, there at run time', () => {
  for (const module of Object.values(held))
    for (const value of Object.values(module)) expect(value).toBeDefined();
});
