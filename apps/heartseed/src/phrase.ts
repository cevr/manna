/**
 * A long verse's phrases: the cut that turns a verse of more than 12 words
 * into consecutive runs of 4-12 words, and the reference each run is kept
 * under. The words are the matcher's (whitespace runs that hold a letter or
 * number), so a phrase's count is the count Say it compares against.
 */

import { Option } from 'effect';

/** The most words a verse is learned whole in. */
const LONGEST_WHOLE = 12;
/** The fewest and the most words a phrase holds. */
const FEWEST = 4;
const MOST = 12;

/**
 * A word's whitespace run: the marks before its first letter or number, the
 * span from that to its last letter or number, then the marks after. A run
 * with no letter or number never matches, and no match starts inside a run.
 */
const WORD_RUN = /(\S*?)([\p{L}\p{N}](?:\S*[\p{L}\p{N}])?)\S*/gu;
const STRONG = /[.;:?!]/u;
const REFERENCE = /^([^[\]]+) \[([1-9]\d*)-([1-9]\d*)\]$/u;

/** One phrase of a verse: its first and last word numbers (from 1) and its text. */
export interface Phrase {
  readonly first: number;
  readonly last: number;
  readonly text: string;
}

/** What a phrase's reference names: its verse's reference and its word numbers. */
export interface PhraseRef {
  readonly verse: string;
  readonly first: number;
  readonly last: number;
}

/** A gap's price as a cut: [at a plain gap, at a comma gap]. */
type GapCost = readonly [number, number];

const STRONG_GAP: GapCost = [0, 0];
const COMMA_GAP: GapCost = [0, 1];
const PLAIN_GAP: GapCost = [1, 0];

/** One word of a text (UTF-16): where its whitespace run starts, where its first letter or number sits, and the index just past its last. */
interface Word {
  readonly start: number;
  readonly wordyStart: number;
  readonly wordyEnd: number;
}

/** The text's words: each whitespace run that holds a letter or a number. */
const wordsOf = (text: string): ReadonlyArray<Word> =>
  Array.from(text.matchAll(WORD_RUN), (match) => {
    const [, lead = '', wordy = ''] = match;
    const wordyStart = match.index + lead.length;
    return { start: match.index, wordyStart, wordyEnd: wordyStart + wordy.length };
  });

/**
 * The price of a cut between the words `before` and `after`: the text after
 * the first's last letter or number and before the second's first,
 * punctuation-only runs between them included.
 */
const gapCostOf = (text: string, before: Word, after: Word): GapCost => {
  const between = text.slice(before.wordyEnd, after.wordyStart);
  if (STRONG.test(between)) return STRONG_GAP;
  if (between.includes(',')) return COMMA_GAP;
  return PLAIN_GAP;
};

/**
 * The cheapest cuts of every suffix of the words, one array per part of a
 * cut's price, compared in order: cuts at a plain gap, phrases, cuts at a
 * comma gap, the sum of the squared sizes; and each suffix's first phrase
 * size (0 where no cut of 4-12 reaches the end).
 */
interface Table {
  readonly plain: Float64Array;
  readonly phrases: Float64Array;
  readonly comma: Float64Array;
  readonly squares: Float64Array;
  readonly size: Uint8Array;
}

const tableOf = (count: number): Table => {
  const table: Table = {
    plain: new Float64Array(count + 1).fill(Infinity),
    phrases: new Float64Array(count + 1),
    comma: new Float64Array(count + 1),
    squares: new Float64Array(count + 1),
    size: new Uint8Array(count + 1),
  };
  table.plain[count] = 0;
  return table;
};

/** Whether a cut of the words from `start` whose first phrase ends at `end` is cheaper than the table's best for `start` so far. */
const cheaperAt = (table: Table, start: number, end: number, gap: GapCost): boolean => {
  const plain = (table.plain[end] ?? Infinity) + gap[0];
  const best = table.plain[start] ?? Infinity;
  if (plain !== best) return plain < best;
  const phrases = (table.phrases[end] ?? 0) + 1;
  const bestPhrases = table.phrases[start] ?? 0;
  if (phrases !== bestPhrases) return phrases < bestPhrases;
  const comma = (table.comma[end] ?? 0) + gap[1];
  const bestComma = table.comma[start] ?? 0;
  if (comma !== bestComma) return comma < bestComma;
  const size = end - start;
  return (table.squares[end] ?? 0) + size * size < (table.squares[start] ?? 0);
};

/** Fills the table's entry for the words from `start` on, from the entries after it. */
const fill = (table: Table, gaps: ReadonlyArray<GapCost>, start: number, count: number) => {
  for (let size = FEWEST; size <= MOST && start + size <= count; size += 1) {
    const end = start + size;
    const gap = gaps[end - 1] ?? STRONG_GAP;
    if (!cheaperAt(table, start, end, gap)) continue;
    table.plain[start] = (table.plain[end] ?? Infinity) + gap[0];
    table.phrases[start] = (table.phrases[end] ?? 0) + 1;
    table.comma[start] = (table.comma[end] ?? 0) + gap[1];
    table.squares[start] = (table.squares[end] ?? 0) + size * size;
    table.size[start] = size;
  }
};

/**
 * The phrase sizes of the words whose cut prices are `gaps`, suffix by
 * suffix: the cheapest cut of each suffix, the smallest first phrase among
 * equals, so the whole cut's ties go to the earliest cuts.
 */
const sizesOf = (gaps: ReadonlyArray<GapCost>): ReadonlyArray<number> => {
  const count = gaps.length + 1;
  const table = tableOf(count);
  for (let start = count - 1; start >= 0; start -= 1) fill(table, gaps, start, count);
  const sizes: Array<number> = [];
  for (let at = 0, size = table.size[0] ?? 0; size > 0; size = table.size[at] ?? 0) {
    sizes.push(size);
    at += size;
  }
  return sizes;
};

/**
 * A verse's phrases, none for a verse of 12 words or fewer. A longer verse
 * is cut where its punctuation lets runs of 4-12 words stand, choosing in
 * order: the fewest cuts at a plain gap, the fewest phrases, the fewest cuts
 * at a comma gap (a strong gap holds one of `.;:?!`), the most even sizes,
 * then the earliest cuts. A phrase's text runs from its first word's run
 * (the text's start, for the first) to the next phrase's first run (the
 * text's end, for the last), trimmed, so punctuation stays before the cut.
 */
export const cutOf = (text: string): ReadonlyArray<Phrase> => {
  const words = wordsOf(text);
  if (words.length <= LONGEST_WHOLE) return [];
  const gaps = words.slice(1).map((word, index) => gapCostOf(text, words[index] ?? word, word));
  const phrases: Array<Phrase> = [];
  let first = 1;
  let from = 0;
  for (const size of sizesOf(gaps)) {
    const last = first + size - 1;
    const to = words[last]?.start ?? text.length;
    phrases.push({ first, last, text: text.slice(from, to).trim() });
    first = last + 1;
    from = to;
  }
  return phrases;
};

/** A phrase's reference: its verse's, a space, then its word numbers in brackets (`John 3:16 [1-6]`). */
export const phraseReference = (verse: string, phrase: Pick<Phrase, 'first' | 'last'>): string =>
  `${verse} [${phrase.first}-${phrase.last}]`;

/**
 * The verse and word numbers a phrase's reference names, read only from
 * `phraseReference`'s exact form: a verse part with no bracket, two safe
 * whole numbers from 1 with no leading zero, the first no later than the
 * last. Any other reference, a verse's among them, names no phrase.
 */
export const phraseOf = (reference: string): Option.Option<PhraseRef> =>
  Option.fromNullishOr(REFERENCE.exec(reference)).pipe(
    Option.map(([, verse = '', first = '', last = '']) => ({
      verse,
      first: Number(first),
      last: Number(last),
    })),
    Option.filter(
      (phrase) =>
        Number.isSafeInteger(phrase.first) &&
        Number.isSafeInteger(phrase.last) &&
        phrase.first <= phrase.last,
    ),
  );
