/* oxlint-disable effect/noTernary, effect/noNullish -- the model writes the spec's rules out as plain branches over undefined, one character at a time, apart from the app's regular expressions and Option code, so the two cannot share a mistake. */

/**
 * The independent model of a long verse's phrases, written plainly from
 * hsphrase's rules for the tests to judge `src/phrase.ts` by:
 * - H1 the cut: a verse of more than 12 words is cut into consecutive
 *   phrases of 4-12 words, choosing in order the fewest cuts at a plain gap,
 *   the fewest phrases, the fewest cuts at a comma gap, the least sum of
 *   squared sizes, then the earliest cuts; and a brute force over every
 *   partition, for short verses;
 * - H2 the reference form `<verse> [<first>-<last>]` and its strict reader;
 * - H3 a phrase's text, from its first word's run to the next phrase's,
 *   and a verse piece with its phrases (`withPhrasesRule`).
 *
 * Words are found one code point at a time here, where the app uses
 * regular expressions over whitespace runs; nothing here reads
 * `src/phrase.ts`.
 */

import type { ModelTextPiece } from './passages-model';

const SPLIT_WORD = /\s/u;
const WORDY = /[\p{L}\p{N}]/u;
const STRONG_MARKS = new Set(['.', ';', ':', '?', '!']);

/** One word of a text: its whitespace run's span (UTF-16), and where its first and last letters or numbers sit. */
export interface ModelWord {
  readonly start: number;
  readonly end: number;
  /** The index just past the run's last letter or number. */
  readonly wordyEnd: number;
  /** The index of the run's first letter or number. */
  readonly wordyStart: number;
}

/** The text's words: each whitespace run holding a letter or number, found code point by code point. */
export const wordsOf = (text: string): ModelWord[] => {
  const words: ModelWord[] = [];
  let at = 0;
  while (at < text.length) {
    const char = String.fromCodePoint(text.codePointAt(at)!);
    if (SPLIT_WORD.test(char)) {
      at += char.length;
      continue;
    }
    const start = at;
    let wordyStart = -1;
    let wordyEnd = -1;
    while (at < text.length) {
      const inner = String.fromCodePoint(text.codePointAt(at)!);
      if (SPLIT_WORD.test(inner)) break;
      if (WORDY.test(inner)) {
        if (wordyStart < 0) wordyStart = at;
        wordyEnd = at + inner.length;
      }
      at += inner.length;
    }
    if (wordyStart >= 0) words.push({ start, end: at, wordyStart, wordyEnd });
  }
  return words;
};

export type ModelGap = 'plain' | 'comma' | 'strong';

/** H1: the gap after each word but the last, by the text between its last letter or number and the next word's first. */
export const gapsOf = (text: string, words: readonly ModelWord[]): ModelGap[] => {
  const gaps: ModelGap[] = [];
  for (let i = 0; i + 1 < words.length; i += 1) {
    const between = [...text.slice(words[i]!.wordyEnd, words[i + 1]!.wordyStart)];
    if (between.some((char) => STRONG_MARKS.has(char))) gaps.push('strong');
    else if (between.includes(',')) gaps.push('comma');
    else gaps.push('plain');
  }
  return gaps;
};

/** H1's price of a cut: [cuts at a plain gap, phrases, cuts at a comma gap, squared sizes]. */
type Price = [number, number, number, number];

const priceOf = (sizes: readonly number[], gaps: readonly ModelGap[]): Price => {
  const price: Price = [0, sizes.length, 0, 0];
  let end = 0;
  sizes.forEach((size, index) => {
    end += size;
    price[3] += size * size;
    if (index === sizes.length - 1) return;
    if (gaps[end - 1] === 'plain') price[0] += 1;
    if (gaps[end - 1] === 'comma') price[2] += 1;
  });
  return price;
};

/** Whether sizes `a` come before sizes `b`: a lower price, or the same price and an earlier first cut that differs. */
const before = (a: readonly number[], b: readonly number[], gaps: readonly ModelGap[]): boolean => {
  const pa = priceOf(a, gaps);
  const pb = priceOf(b, gaps);
  for (let i = 0; i < 4; i += 1) if (pa[i] !== pb[i]) return pa[i]! < pb[i]!;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
};

/** H1's phrase sizes for `count` words with `gaps`, by search over each suffix: the best sizes of the words from `at` on. */
export const sizesRule = (count: number, gaps: readonly ModelGap[]): number[] => {
  if (count <= 12) return [];
  const memo = new Map<number, number[] | null>();
  const bestFrom = (at: number): number[] | null => {
    if (at === count) return [];
    if (memo.has(at)) return memo.get(at)!;
    let best: number[] | null = null;
    for (let size = 4; size <= 12; size += 1) {
      if (at + size > count) break;
      const rest = bestFrom(at + size);
      if (rest === null) continue;
      const sizes = [size, ...rest];
      const suffixGaps = gaps.slice(at);
      if (best === null || before(sizes, best, suffixGaps)) best = sizes;
    }
    memo.set(at, best);
    return best;
  };
  return bestFrom(0) ?? [];
};

/** H1 by brute force: every partition of `count` words into parts of 4-12, the first in H1's order. */
export const bruteSizes = (count: number, gaps: readonly ModelGap[]): number[] => {
  if (count <= 12) return [];
  const all: number[][] = [];
  const walk = (left: number, sizes: number[]) => {
    if (left === 0) all.push(sizes);
    for (let size = 4; size <= Math.min(12, left); size += 1) walk(left - size, [...sizes, size]);
  };
  walk(count, []);
  return all.reduce((best, sizes) => (before(sizes, best, gaps) ? sizes : best));
};

/** One phrase in the model: its word numbers from 1, and its text. */
export interface ModelPhrase {
  readonly first: number;
  readonly last: number;
  readonly text: string;
}

/** H3: the phrases of a text cut into `sizes`: each from its first word's run (the text's start for the first) to the next phrase's first run (the end for the last), trimmed. */
export const phrasesBySizes = (
  text: string,
  words: readonly ModelWord[],
  sizes: readonly number[],
): ModelPhrase[] => {
  const phrases: ModelPhrase[] = [];
  let first = 1;
  for (const [index, size] of sizes.entries()) {
    const last = first + size - 1;
    const from = index === 0 ? 0 : words[first - 1]!.start;
    const to = index === sizes.length - 1 ? text.length : words[last]!.start;
    phrases.push({ first, last, text: text.slice(from, to).trim() });
    first = last + 1;
  }
  return phrases;
};

/** H1 and H3: a text's phrases, none for 12 words or fewer. */
export const cutRule = (text: string): ModelPhrase[] => {
  const words = wordsOf(text);
  return phrasesBySizes(text, words, sizesRule(words.length, gapsOf(text, words)));
};

/** H2: a phrase's reference. */
export const phraseRefRule = (verse: string, first: number, last: number): string =>
  `${verse} [${first}-${last}]`;

/** H3: `piece` with its phrases when its text is long, each its reference, text, word count and the piece's group, with none of its own; else `piece` as it is. */
export const withPhrasesRule = (piece: ModelTextPiece): ModelTextPiece => {
  const phrases: ModelTextPiece[] = cutRule(piece.text).map((phrase) => ({
    reference: phraseRefRule(piece.reference, phrase.first, phrase.last),
    text: phrase.text,
    words: phrase.last - phrase.first + 1,
    group: piece.group,
  }));
  if (phrases.length === 0) return piece;
  return {
    reference: piece.reference,
    text: piece.text,
    words: piece.words,
    group: piece.group,
    phrases,
  };
};

const DIGITS = '0123456789';

/** A whole number written with digits only, no sign, no leading zero, from 1, within the safe integers; else undefined. */
const wholeOf = (written: string): number | undefined => {
  if (written.length === 0 || written[0] === '0') return undefined;
  for (const char of written) if (!DIGITS.includes(char)) return undefined;
  const value = Number(written);
  return Number.isSafeInteger(value) ? value : undefined;
};

/** H2's reader: the verse and word numbers of a phrase's reference, read from the end; undefined for any other text. */
export const phraseOfRule = (
  reference: string,
): { verse: string; first: number; last: number } | undefined => {
  if (!reference.endsWith(']')) return undefined;
  const open = reference.lastIndexOf('[');
  if (open < 2 || reference[open - 1] !== ' ') return undefined;
  const verse = reference.slice(0, open - 1);
  if (verse.includes('[') || verse.includes(']')) return undefined;
  const range = reference.slice(open + 1, -1).split('-');
  if (range.length !== 2) return undefined;
  const first = wholeOf(range[0]!);
  const last = wholeOf(range[1]!);
  if (first === undefined || last === undefined || first > last) return undefined;
  return { verse, first, last };
};
