/* oxlint-disable effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md): a pack's body is written with `JSON.stringify`, as the server sends it. */

/**
 * Made-up commentary packs for the tests and the fixture server: notes of
 * invented syllables under invented references, linked to verses at
 * random, with the count, sum and version a good pack carries. No
 * commentary's text is in them.
 */

import {
  PACK_FORMAT,
  packSum,
  versionOf,
  type CommentaryNote,
  type CommentaryPack,
  type CommentaryVerseNotes,
} from '../commentary/pack';
import type { Random } from './random';

const SYLLABLES = ['ka', 'lo', 'mi', 'ten', 'sar', 'vu', 'pel', 'dro', 'né', 'ö', 'ʃa'] as const;

/** An invented word of one to four syllables. */
const wordOf = (random: Random) =>
  Array.from({ length: 1 + random.below(4) }, () => random.pick(SYLLABLES)).join('');

/** An invented paragraph of `words` words. */
const paragraphOf = (random: Random, words: number) =>
  Array.from({ length: words }, () => wordOf(random)).join(' ');

/** The pack `notes` and `verses` make, with the count, sum and version a good pack carries. */
export const packOf = (
  notes: ReadonlyArray<CommentaryNote>,
  verses: Readonly<Record<string, ReadonlyArray<CommentaryVerseNotes>>>,
): CommentaryPack => {
  const sum = packSum(notes, verses);
  return {
    format: PACK_FORMAT,
    version: versionOf(notes.length, sum),
    count: notes.length,
    sum,
    notes,
    verses,
  };
};

/** A pack of up to `most` made-up notes, linked to verses of a few chapters (verse 0 for a whole chapter), each verse's notes ascending. */
export const madePack = (random: Random, most = 40): CommentaryPack => {
  const count = random.below(most + 1);
  const notes = Array.from({ length: count }, (_, index): CommentaryNote => [
    `${1 + random.below(7)}BC ${index + 1}.${1 + random.below(9)}`,
    paragraphOf(random, 1 + random.below(30)),
  ]);
  const verses: Record<string, Array<CommentaryVerseNotes>> = {};
  if (count === 0) return packOf(notes, verses);
  for (let chapters = random.below(6); chapters > 0; chapters--) {
    const key = `${1 + random.below(66)}.${1 + random.below(30)}`;
    const numbers = [
      ...new Set(Array.from({ length: 1 + random.below(8) }, () => random.below(40))),
    ];
    verses[key] = numbers
      .sort((a, b) => a - b)
      .map((verse): CommentaryVerseNotes => {
        const indexes = new Set(
          Array.from({ length: 1 + random.below(4) }, () => random.below(count)),
        );
        return [verse, [...indexes].sort((a, b) => a - b)];
      });
  }
  return packOf(notes, verses);
};

/** `pack` as the server sends it. */
export const bodyOf = (pack: CommentaryPack): string => JSON.stringify(pack);
