/**
 * A verse's fingerprint, so a contract test can hold the words the built app
 * reads to the current app's without any verse's text in the repo: its
 * length, and FNV-1a's 32-bit hash of its UTF-16 code units.
 */

import { textOf, type TextPassage } from './text';
import type { Range } from '@manna/heartseed/passages';

/** A verse's number and its text's fingerprint. */
export interface TextVerseSum {
  verse: number;
  length: number;
  sum: number;
}

/** A range's reference and each verse's fingerprint. */
export interface TextSums {
  reference: string;
  verses: Array<TextVerseSum>;
}

/** FNV-1a's 32-bit hash of `text`'s UTF-16 code units, unsigned. */
export const sumOf = (text: string): number => {
  let hash = 0x81_1c_9d_c5;
  for (let at = 0; at < text.length; at++)
    hash = Math.imul(hash ^ text.charCodeAt(at), 0x01_00_01_93);
  return hash >>> 0;
};

/** `passage`'s verses as fingerprints. */
export const sumsIn = (passage: TextPassage): TextSums => ({
  reference: passage.reference,
  verses: passage.verses.map(({ verse, text }) => ({
    verse,
    length: text.length,
    sum: sumOf(text),
  })),
});

/** The fingerprints of what `textOf` reads for `range`. */
export const textSums = (range: Range): TextSums => sumsIn(textOf(range));
