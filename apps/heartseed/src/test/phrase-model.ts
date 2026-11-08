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
 *   and a verse piece with its phrases (`withPhrasesRule`);
 * - H4 the pieces a plan is made over (`expandRule`), whose plan is
 *   `src/test/session-model.ts`'s;
 * - H6 the cue of a join (`joinCueRule`);
 * - H7 the field, each phrase folded into its verse (`fieldFoldRule`).
 *
 * Words are found one code point at a time here, where the app uses
 * regular expressions over whitespace runs; nothing here reads
 * `src/phrase.ts`.
 */

import type { Recall } from '../sayit';
import { sownDate, type ModelField, type ModelPassage, type ModelPlantStage } from './field-model';
import { referenceCue, referenceStage, type ModelCue } from './garden-model';
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

/** A piece as the plan rule sees it, with the phrases H3 gave it. */
interface ModelPhrased {
  readonly reference: string;
  readonly phrases?: readonly ModelPhrased[];
}

/** H4: whether the plant of `recalls` is at an ear or full corn, by the stage rule over ts-fsrs. */
const ripeRule = (recalls: readonly Recall[] | undefined) => {
  if (recalls === undefined || recalls.length === 0) return false;
  const stage = referenceStage(recalls);
  return stage === 'ear' || stage === 'full corn';
};

/**
 * H4: the pieces the plan is made over, each reference at its first place
 * first, then in order: a piece planted, or with no phrases, is itself;
 * else its phrases, then the piece itself only when every phrase's plant
 * is at an ear or full corn.
 */
export const expandRule = <P extends ModelPhrased>(
  pieces: readonly P[],
  plants: ReadonlyMap<string, readonly Recall[]>,
): P[] => {
  const firsts: P[] = [];
  for (const piece of pieces)
    if (firsts.every((each) => each.reference !== piece.reference)) firsts.push(piece);
  const out: P[] = [];
  for (const piece of firsts) {
    const phrases = (piece.phrases ?? []) as readonly P[];
    if (plants.has(piece.reference) || phrases.length === 0) {
      out.push(piece);
      continue;
    }
    out.push(...phrases);
    let ripe = true;
    for (const phrase of phrases) if (!ripeRule(plants.get(phrase.reference))) ripe = false;
    if (ripe) out.push(piece);
  }
  return out;
};

/** The piece named `reference` among `pieces`, else among their phrases: a phrase item's piece is its phrase. */
export const pieceRule = <P extends ModelPhrased>(
  pieces: readonly P[],
  reference: string,
): P | undefined => {
  for (const piece of pieces) if (piece.reference === reference) return piece;
  for (const piece of pieces)
    for (const phrase of (piece.phrases ?? []) as readonly P[])
      if (phrase.reference === reference) return phrase;
  return undefined;
};

/** Every reference `pieces` name: each piece's, then its phrases'. */
export const referencesRule = (pieces: readonly ModelPhrased[]): string[] => {
  const out: string[] = [];
  for (const piece of pieces) {
    out.push(piece.reference);
    for (const phrase of piece.phrases ?? []) out.push(phrase.reference);
  }
  return out;
};

/** The verse a reference belongs to: a phrase's verse, else itself. */
export const verseOfRule = (reference: string) => phraseOfRule(reference)?.verse ?? reference;

/** H6: the cue `reference` is said under next: its own ladder once planted; else first letters when any plant is a phrase of it, else the full text. */
export const joinCueRule = (
  plants: ReadonlyMap<string, readonly Recall[]>,
  reference: string,
): ModelCue => {
  const own = plants.get(reference);
  if (own !== undefined && own.length > 0) return referenceCue(own);
  for (const key of plants.keys()) if (phraseOfRule(key)?.verse === reference) return 'initials';
  return 'full';
};

/**
 * H7: the field over `records` (one per recital) and the passages taught,
 * each phrase folded into its verse. A verse with a plant of its own shows
 * its stage; else `seed` when a phrase of it is planted, else `not planted`.
 * Every other verse a plant names (a phrase's verse for a phrase) is a row of
 * its own, by its earliest recall among its plants, then its reference in
 * code units. Days sown count every recall; the harvest counts verses' own
 * plants at full corn, never a phrase's.
 */
export const fieldFoldRule = (
  records: readonly Recall[],
  passages: readonly ModelPassage[],
): ModelField => {
  const held = new Map<string, Recall[]>();
  for (const recall of records) {
    const list = held.get(recall.reference) ?? [];
    list.push(recall);
    held.set(recall.reference, list);
  }
  const stage = (verse: string): ModelPlantStage => {
    const own = held.get(verse);
    if (own !== undefined) return referenceStage(own);
    for (const reference of held.keys())
      if (phraseOfRule(reference)?.verse === verse) return 'seed';
    return 'not planted';
  };
  const taught = passages.flatMap((passage) => passage.verses);
  const firsts = new Map<string, number>();
  for (const recall of records) {
    const verse = verseOfRule(recall.reference);
    if (taught.includes(verse)) continue;
    const first = firsts.get(verse);
    if (first === undefined || recall.startedAt < first) firsts.set(verse, recall.startedAt);
  }
  const others = [...firsts.entries()].toSorted((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    if (a[0] === b[0]) return 0;
    return a[0] < b[0] ? -1 : 1;
  });
  let harvest = 0;
  for (const [reference, recalls] of held)
    if (phraseOfRule(reference) === undefined && referenceStage(recalls) === 'full corn')
      harvest += 1;
  return {
    rows: [
      ...passages.map((passage) => ({
        title: passage.title,
        plants: passage.verses.map((reference) => ({ reference, stage: stage(reference) })),
      })),
      ...others.map(([verse]) => ({
        title: verse,
        plants: [{ reference: verse, stage: stage(verse) }],
      })),
    ],
    sown: new Set(records.map(sownDate)).size,
    harvest,
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
