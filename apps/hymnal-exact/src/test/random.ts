/* oxlint-disable effect/noTernary, effect/noNullish, effect/noThrowStatement, effect/noNewError -- the property tests' generators import no effect, and so not its FastCheck: Exact's type check would stage its declarations, which this repo cannot (docs/exact.md); a pick from no items is the test's own defect. */

/**
 * A source of numbers in [0, 1), the same for the same seed (mulberry32):
 * the app's property tests draw their generated inputs from it, so a
 * failure names the seed that reproduces it.
 */
export const seeded = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type Random = ReturnType<typeof seeded>;

/** A whole number in [0, below). */
export const below = (random: Random, bound: number): number => Math.floor(random() * bound);

/** One of `items`. */
export const pick = <T>(random: Random, items: ReadonlyArray<T>): T => {
  const item = items[below(random, items.length)];
  if (item === undefined) throw new Error('pick from no items');
  return item;
};

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** `word` with one edit a reader makes: a letter dropped, doubled, swapped with the next, or mistyped. */
const edited = (random: Random, word: string): string => {
  if (word.length < 2) return word;
  const at = below(random, word.length - 1);
  const edit = below(random, 4);
  if (edit === 0) return word.slice(0, at) + word.slice(at + 1);
  if (edit === 1) return word.slice(0, at + 1) + word.slice(at);
  if (edit === 2)
    return word.slice(0, at) + word.charAt(at + 1) + word.charAt(at) + word.slice(at + 2);
  return word.slice(0, at) + pick(random, [...LETTERS]) + word.slice(at + 1);
};

/** `text` with its case and punctuation changed as a reader types it. */
const retyped = (random: Random, text: string): string => {
  const cased = pick(random, [text, text.toLowerCase(), text.toUpperCase()]);
  const bare = below(random, 2) === 0 ? cased.replace(/[^\p{L}\p{N}\s]/gu, '') : cased;
  return pick(random, [bare, ` ${bare}`, `${bare} `, `${bare}?`, `“${bare}”`]);
};

/** Some of `text`'s words, from a place in it, each edited now and then. */
const wordsOf = (random: Random, text: string): string => {
  const words = text.split(/\s+/).filter(Boolean);
  const from = below(random, Math.max(1, words.length));
  const taken = words.slice(from, from + 1 + below(random, 5));
  return taken.map((word) => (below(random, 4) === 0 ? edited(random, word) : word)).join(' ');
};

const ARBITRARY = 'abcdefghijklmnopqrstuvwxyz0123456789 #.,;:!?\'’"-éüñ\u00a0\t';

/** A string of any of the characters a field takes. */
const arbitrary = (random: Random): string =>
  Array.from({ length: below(random, 12) }, () => pick(random, [...ARBITRARY])).join('');

/** What a reader types into the search field: a number, words of a title or a first line, or anything. */
export const query = (
  random: Random,
  hymns: ReadonlyArray<{
    readonly number: number;
    readonly title: string;
    readonly firstLine: string;
  }>,
): string => {
  const hymn = pick(random, hymns);
  const kind = below(random, 5);
  if (kind === 0)
    return pick(random, [
      `${hymn.number}`,
      `#${hymn.number}`,
      `no. ${hymn.number}`,
      `${below(random, 10)}`,
    ]);
  if (kind === 1) return retyped(random, wordsOf(random, hymn.title));
  if (kind === 2) return retyped(random, wordsOf(random, hymn.firstLine));
  if (kind === 3) return arbitrary(random);
  return pick(random, ['', ' ', 'thee', 'you', 'John 3:16', 'Ps 23', 'Sabbath', 'zzqx']);
};
