/**
 * Cardinal numbers, read from normalized words (lowercase letters and
 * numbers only) over the whole nonnegative safe-integer domain. A phrase
 * is a canonical decimal numeral alone, `zero` alone, `eleven`–`nineteen
 * hundred` with an optional remainder, or descending groups of one to
 * nine hundred and ninety-nine under thousand to quadrillion. A group is
 * an optional hundreds term (`one`–`nine` or `a`/`an`, then `hundred`),
 * then a tail: one to nineteen, a tens word with an optional unit (`forty
 * two`, `forty and two`, `fortytwo` from `forty-two`), the inverted `two
 * and forty`, or a score (`threescore`) with an optional `and` and a
 * remainder of one to nineteen. A group before a scale may also be a bare
 * `a`/`an`, in any place (`one thousand and a hundred`, `one million a
 * thousand`). An optional `and` may join any two additive terms, but never
 * opens the phrase. Everything else, adjacent units included, is not a
 * number, so `one two` is never twelve.
 */

import { Option } from 'effect';

const SMALL = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;

const TENS = [
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const;

const SCALES: ReadonlyMap<string, bigint> = new Map([
  ['thousand', 1_000n],
  ['million', 1_000_000n],
  ['billion', 1_000_000_000n],
  ['trillion', 1_000_000_000_000n],
  ['quadrillion', 1_000_000_000_000_000n],
]);

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

/** One to nineteen, by word. */
const SMALL_VALUES: ReadonlyMap<string, number> = new Map(
  SMALL.slice(1).map((word, index) => [word, index + 1]),
);

/** Twenty to ninety, by word. */
const TENS_VALUES: ReadonlyMap<string, number> = new Map(
  TENS.map((word, index) => [word, (index + 2) * 10]),
);

/** A tens word joined to its unit, as a hyphenated `forty-two` normalizes: `fortytwo`. */
const JOINED_VALUES: ReadonlyMap<string, number> = new Map(
  TENS.flatMap((tens, index) =>
    SMALL.slice(1, 10).map((unit, offset) => [`${tens}${unit}`, (index + 2) * 10 + offset + 1]),
  ),
);

/** The KJV score words, `onescore` to `nineteenscore`: twenty times their count. */
const SCORE_VALUES: ReadonlyMap<string, number> = new Map(
  SMALL.slice(1).map((word, index) => [`${word}score`, (index + 1) * 20]),
);

/** Every word a numeric phrase can hold, apart from decimal numerals. */
const VOCABULARY: ReadonlySet<string> = new Set([
  'zero',
  'and',
  'a',
  'an',
  'hundred',
  ...SMALL_VALUES.keys(),
  ...TENS_VALUES.keys(),
  ...JOINED_VALUES.keys(),
  ...SCORE_VALUES.keys(),
  ...SCALES.keys(),
]);

const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;

const lookup =
  <A>(table: ReadonlyMap<string, A>) =>
  (word: string): Option.Option<A> =>
    Option.fromUndefinedOr(table.get(word));

/** One to nineteen, the remainder a score takes. */
const small = lookup(SMALL_VALUES);

const tens = lookup(TENS_VALUES);

const joined = lookup(JOINED_VALUES);

const score = lookup(SCORE_VALUES);

const scale = lookup(SCALES);

/** One to nine. */
const unit = (word: string) => Option.filter(small(word), (value) => value <= 9);

const sum = (a: Option.Option<number>, b: Option.Option<number>) =>
  Option.zipWith(a, b, (x, y) => x + y);

const isArticle = (word: string) => word === 'a' || word === 'an';

/** A tail's value, 1 to 399: below a hundred, or a score form. */
const tail = (words: readonly string[]): Option.Option<number> => {
  const [first = '', second = '', third = ''] = words;
  if (words.length === 1) {
    return small(first).pipe(
      Option.orElse(() => tens(first)),
      Option.orElse(() => joined(first)),
      Option.orElse(() => score(first)),
    );
  }
  if (words.length === 2) {
    return sum(tens(first), unit(second)).pipe(
      Option.orElse(() => sum(score(first), small(second))),
    );
  }
  if (words.length === 3 && second === 'and') {
    return sum(tens(first), unit(third)).pipe(
      Option.orElse(() => sum(unit(first), tens(third))),
      Option.orElse(() => sum(score(first), small(third))),
    );
  }
  return Option.none();
};

/** Words after a term: empty, or an optional `and` and then a nonempty rest. */
const afterAnd = (words: readonly string[]) => {
  if (words[0] === 'and') return words.slice(1);
  return words;
};

/** A hundreds term's remainder: nothing, or an optional `and` and a tail below a hundred. */
const below100 = (words: readonly string[]): Option.Option<number> => {
  if (words.length === 0) return Option.some(0);
  const rest = afterAnd(words);
  if (rest.length === 0) return Option.none();
  return Option.filter(tail(rest), (value) => value < 100);
};

/** A coefficient of a hundred or a scale: one to nine, or `a`/`an` as one. */
const coefficient = (word: string): Option.Option<number> => {
  if (isArticle(word)) return Option.some(1);
  return unit(word);
};

/** A group's value, 1 to 999, with `a`/`an` allowed as its hundreds coefficient. */
const group = (words: readonly string[]): Option.Option<number> => {
  const [first = '', second = ''] = words;
  if (second !== 'hundred') return tail(words);
  return Option.zipWith(
    coefficient(first),
    below100(words.slice(2)),
    (count, rest) => count * 100 + rest,
  );
};

/** `eleven hundred` to `nineteen hundred`, with an optional remainder below a hundred. */
const longHundreds = (words: readonly string[]): Option.Option<number> => {
  const [first = '', second = ''] = words;
  if (second !== 'hundred') return Option.none();
  return Option.zipWith(
    Option.filter(small(first), (count) => count >= 11),
    below100(words.slice(2)),
    (count, rest) => count * 100 + rest,
  );
};

/** A run of words up to a scale word, and that scale, or none for the run after the last. */
type Segment = Readonly<{ words: readonly string[]; scale: Option.Option<bigint> }>;

/** The phrase cut after each scale word; a phrase ending in a scale word has no last run. */
const segments = (words: readonly string[]): readonly Segment[] => {
  const found: Segment[] = [];
  let start = 0;
  words.forEach((word, index) => {
    const marked = scale(word);
    if (Option.isNone(marked)) return;
    found.push({ words: words.slice(start, index), scale: marked });
    start = index + 1;
  });
  if (start < words.length) found.push({ words: words.slice(start), scale: Option.none() });
  return found;
};

/** A segment's words as a term: after the first, a leading `and` joins it and goes. */
const termWords = (words: readonly string[], initial: boolean) => {
  if (initial) return words;
  return afterAnd(words);
};

/** A segment's group value; any segment may stand as a bare `a`/`an` before its scale. */
const segmentValue = (segment: Segment, initial: boolean): Option.Option<number> => {
  const part = termWords(segment.words, initial);
  if (part.length === 0) return Option.none();
  const [only = ''] = part;
  if (Option.isSome(segment.scale) && part.length === 1 && isArticle(only)) {
    return Option.some(1);
  }
  return group(part);
};

/** Descending scaled groups, then an optional unscaled group. */
const scaled = (words: readonly string[]): Option.Option<bigint> => {
  let total = 0n;
  let previous = Option.none<bigint>();
  for (const [position, segment] of segments(words).entries()) {
    const value = segmentValue(segment, position === 0);
    if (Option.isNone(value)) return Option.none();
    if (Option.isNone(segment.scale)) return Option.some(total + BigInt(value.value));
    const current = segment.scale.value;
    if (Option.exists(previous, (larger) => current >= larger)) return Option.none();
    total += BigInt(value.value) * current;
    previous = segment.scale;
  }
  return Option.some(total);
};

/** A value as a decimal string, when it lies in the safe-integer domain. */
const inDomain = (value: bigint): Option.Option<string> =>
  Option.some(value).pipe(
    Option.filter((v) => v <= MAX),
    Option.map((v) => v.toString()),
  );

/** Whether `word` can stand in a spelled-out numeric phrase. */
export const isNumberWord = (word: string): boolean => VOCABULARY.has(word);

/**
 * The value of a whole phrase of normalized words, as a decimal string, or
 * none when the phrase is no cardinal number in the safe-integer domain.
 * The arithmetic is exact, so no value past the domain is rounded back
 * into it.
 */
export const numberValue = (words: readonly string[]): Option.Option<string> => {
  const [first = ''] = words;
  if (words.length === 0) return Option.none();
  if (words.length === 1 && DECIMAL.test(first)) return inDomain(BigInt(first));
  if (words.length === 1 && first === 'zero') return Option.some('0');
  if (!words.every(isNumberWord)) return Option.none();
  return longHundreds(words).pipe(
    Option.map(BigInt),
    Option.orElse(() => scaled(words)),
    Option.flatMap(inDomain),
  );
};
