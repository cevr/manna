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

const WORDLIKE = /[\p{L}\p{N}]/u;
const UP_TO_LAST_WORDLIKE = /^[\s\S]*[\p{L}\p{N}]/u;
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

/** A cut's price, compared in order: cuts at a plain gap, phrases, cuts at a comma gap, the sum of the squared sizes. */
type Cost = readonly [number, number, number, number];

/** The cheapest way to cut the words from some word to the end: its cost and its first phrase's size. */
interface Step {
  readonly cost: Cost;
  readonly size: number;
}

/** A gap's price as a cut: [at a plain gap, at a comma gap]. */
type GapCost = readonly [number, number];

const STRONG_GAP: GapCost = [0, 0];
const COMMA_GAP: GapCost = [0, 1];
const PLAIN_GAP: GapCost = [1, 0];

const UNREACHED: Step = { cost: [Infinity, Infinity, Infinity, Infinity], size: 0 };

/** Where each word's whitespace run starts in the text (UTF-16). */
const startsOf = (text: string): ReadonlyArray<number> =>
  Array.from(text.matchAll(/\S+/gu))
    .filter((match) => WORDLIKE.test(match[0]))
    .map((match) => match.index);

/**
 * The price of a cut between the words that start at `before` and `after`:
 * the text after the first's last letter or number and before the second's
 * first, punctuation-only runs between them included.
 */
const gapCostOf = (text: string, before: number, after: number): GapCost => {
  const lead = text.slice(after).search(WORDLIKE);
  const between = text.slice(before, after + lead).replace(UP_TO_LAST_WORDLIKE, '');
  if (STRONG.test(between)) return STRONG_GAP;
  if (between.includes(',')) return COMMA_GAP;
  return PLAIN_GAP;
};

const cheaper = (a: Cost, b: Cost): boolean => {
  for (const [index, value] of a.entries()) {
    const other = b[index] ?? Infinity;
    if (value !== other) return value < other;
  }
  return false;
};

/**
 * The phrase sizes of the words whose cut prices are `gaps`, suffix by
 * suffix: the cheapest cut of each suffix, the smallest first phrase among
 * equals, so the whole cut's ties go to the earliest cuts.
 */
const sizesOf = (gaps: ReadonlyArray<GapCost>): ReadonlyArray<number> => {
  const count = gaps.length + 1;
  const best: Array<Step> = Array.from({ length: count + 1 }, () => UNREACHED);
  best[count] = { cost: [0, 0, 0, 0], size: 0 };
  for (let start = count - 1; start >= 0; start -= 1) {
    for (let size = FEWEST; size <= MOST && start + size <= count; size += 1) {
      const end = start + size;
      const rest = (best[end] ?? UNREACHED).cost;
      const [plain, comma] = gaps[end - 1] ?? STRONG_GAP;
      const cost: Cost = [rest[0] + plain, rest[1] + 1, rest[2] + comma, rest[3] + size * size];
      if (cheaper(cost, (best[start] ?? UNREACHED).cost)) best[start] = { cost, size };
    }
  }
  const sizes: Array<number> = [];
  for (let at = 0, size = best[0]?.size ?? 0; size > 0; size = best[at]?.size ?? 0) {
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
  const starts = startsOf(text);
  if (starts.length <= LONGEST_WHOLE) return [];
  const gaps = starts.slice(1).map((start, index) => gapCostOf(text, starts[index] ?? 0, start));
  const phrases: Array<Phrase> = [];
  let first = 1;
  let from = 0;
  for (const size of sizesOf(gaps)) {
    const last = first + size - 1;
    const to = starts[last] ?? text.length;
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
