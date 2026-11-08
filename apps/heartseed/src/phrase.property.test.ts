/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its texts with plain branches, tallies its kinds in plain maps, and names a wrong case by its word counts. */

/**
 * The phrase cut and its reference form (hsphrase H1-H3). Its seams:
 * `cutOf`, judged against the model's `cutRule` (`test/phrase-model.ts`)
 * and, for 13-22 words, its brute force over every partition, for
 * generated texts of 0-90 words: letters of five scripts, astral letters,
 * combining marks, numbers, every trailing and leading mark, runs of marks
 * alone (`—`, `¶`, `...`, a lone comma) between words, and every kind of
 * whitespace; and `phraseReference` with `phraseOf`, judged against the
 * model's reader over round trips, near misses and generated strings.
 *
 * It catches a comma read as strong, a mark-only run left out of its gap,
 * a verse of 13 words kept whole, a phrase of 13, ties to the latest cut,
 * no balancing of sizes, a phrase's trailing mark dropped or carried over,
 * and a reader that takes a reference in any other form. It misses which
 * pieces carry phrases: that is the session's.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { sourceWords } from './matcher/words';
import { cutOf, phraseOf, phraseReference } from './phrase';
import { below, random } from './test/garden-model';
import {
  bruteSizes,
  cutRule,
  gapsOf,
  phraseOfRule,
  phraseRefRule,
  wordsOf,
} from './test/phrase-model';

const CORES = [
  'and',
  'Lord',
  'thee',
  'é',
  'e\u0301',
  'naïve',
  'αγάπη',
  'λόγος',
  'жизнь',
  'שלום',
  'אמן',
  '愛',
  '平安',
  '𝒜dam',
  '𐌰𐌱',
  '3',
  '٣',
  '½',
  '144',
  'x2',
];
const LEADS = ['(', '"', '‘', '¿', '[', '—', '...', '\u0301'];
const TRAILS = ['.', ',', ';', ':', '?', '!', ',"', '.)', '—', "'s", '?’', ',—', '...', '¶'];
const SPACES = [' ', ' ', ' ', '\t', '\n', '\u00a0', '  ', ' \u2003 ', '\r\n'];
const MARK_RUNS = ['—', '¶', '...', ',', ';', '-', '\u0301', '«»'];

const pick = <A>(next: () => number, list: readonly A[]): A => list[below(next, list.length)]!;

/** A word of `kind`'s edges, from `next`: a core, sometimes with a leading or trailing mark. */
const wordOf = (next: () => number, trailRate: number): string => {
  const lead = below(next, 10) === 0 ? pick(next, LEADS) : '';
  const trail = next() < trailRate ? pick(next, TRAILS) : '';
  return `${lead}${pick(next, CORES)}${trail}`;
};

/** A text of `count` words, from `next`: whitespace of every kind, runs of marks alone between words, and whitespace at either end. */
const textOf = (next: () => number, count: number): string => {
  const trailRate = pick(next, [0, 0.1, 0.3, 0.6]);
  const parts: string[] = [];
  if (below(next, 4) === 0) parts.push(pick(next, SPACES));
  for (let index = 0; index < count; index += 1) {
    if (index > 0) parts.push(pick(next, SPACES));
    if (below(next, 12) === 0) parts.push(pick(next, MARK_RUNS), pick(next, SPACES));
    parts.push(wordOf(next, trailRate));
  }
  if (below(next, 4) === 0) parts.push(pick(next, SPACES), pick(next, MARK_RUNS));
  return parts.join('');
};

/** A word count, from `next`: the edges 0, 12, 13 and 90 in a fifth, 13-22 in a third, else 0-90. */
const countOf = (next: () => number): number => {
  const roll = below(next, 15);
  if (roll < 3) return pick(next, [0, 12, 13, 90]);
  if (roll < 8) return 13 + below(next, 10);
  return below(next, 91);
};

const tally = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

const ranges = (phrases: readonly { first: number; last: number }[]) =>
  phrases.map((phrase) => `${phrase.first}-${phrase.last}`).join(' ');

/** The kinds a text reaches: its length's edges, and the gaps its cut is made at. */
const kindsOf = (text: string, cuts: readonly (string | undefined)[], count: number): string[] => [
  count <= 12 ? 'whole' : 'long',
  ...(count === 13 ? ['13 words'] : []),
  ...(count === 90 ? ['90 words'] : []),
  ...(count === 0 ? ['no words'] : []),
  ...(MARK_RUNS.some((run) => text.includes(` ${run} `)) ? ['mark run'] : []),
  ...[...new Set(cuts)].map((gap) => `cut at ${gap}`),
];

/** What is wrong with `cutOf` on case `c`: its ranges or texts against the model, the model against the brute force for 13-22 words, and a phrase's words against its range. */
const faultsOf = (c: number, text: string, counts: Map<string, number>): string[] => {
  const words = wordsOf(text);
  const got = cutOf(text).map((phrase) => ({ ...phrase }));
  const want = cutRule(text);
  const gaps = gapsOf(text, words);
  const cuts = want.slice(0, -1).map((phrase) => gaps[phrase.last - 1]);
  for (const kind of kindsOf(text, cuts, words.length)) tally(counts, kind);
  const faults: string[] = [];
  if (JSON.stringify(got) !== JSON.stringify(want))
    faults.push(`case ${c} (${words.length} words): ${ranges(got)} where H1 has ${ranges(want)}`);
  if (words.length >= 13 && words.length <= 22) {
    tally(counts, 'brute');
    const sizes = want.map((phrase) => phrase.last - phrase.first + 1);
    if (JSON.stringify(bruteSizes(words.length, gaps)) !== JSON.stringify(sizes))
      faults.push(`case ${c} (${words.length} words): the model's cut is not the brute force's`);
  }
  const all = sourceWords(text);
  for (const phrase of got)
    if (sourceWords(phrase.text).join(' ') !== all.slice(phrase.first - 1, phrase.last).join(' '))
      faults.push(`case ${c}: phrase ${phrase.first}-${phrase.last} holds other words`);
  return faults;
};

describe('the phrase cut', () => {
  it('cuts generated texts as H1 and H3 do, and as a brute force does for 13-22 words', () => {
    const CASES = 3000;
    const next = random(0x9f1e);
    const counts = new Map<string, number>();
    const faults: string[] = [];
    for (let c = 0; c < CASES; c += 1)
      faults.push(...faultsOf(c, textOf(next, countOf(next)), counts));
    expect(faults.slice(0, 10)).toEqual([]);
    const floors = {
      long: CASES / 3,
      whole: CASES / 10,
      brute: CASES / 20,
      'cut at plain': CASES / 20,
      'cut at comma': CASES / 20,
      'cut at strong': CASES / 20,
      '13 words': 20,
      '90 words': 20,
      'no words': 20,
      'mark run': CASES / 10,
    };
    expect(Object.entries(floors).filter(([key, floor]) => (counts.get(key) ?? 0) < floor)).toEqual(
      [],
    );
  });

  it('keeps a mark after the last word with the phrase before the cut, and a mark-only run in its gap', () => {
    const twelve = 'one two three four five six seven eight nine ten eleven twelve';
    expect(cutOf(twelve)).toEqual([]);
    const text = `${twelve.replace('six', 'six;')} thirteen fourteen.`;
    expect(cutOf(text).map((phrase) => [phrase.first, phrase.last, phrase.text])).toEqual([
      [1, 6, 'one two three four five six;'],
      [7, 14, 'seven eight nine ten eleven twelve thirteen fourteen.'],
    ]);
    const run = `one two three four — five six seven eight nine ten eleven twelve thirteen`;
    expect(ranges(cutOf(run))).toBe('1-6 7-13');
    expect(ranges(cutOf(run.replace('—', '...')))).toBe('1-4 5-13');
  });
});

const VERSES = ['John 3:16', 'Isaiah 41:10', '1 Samuel 2:3', 'Song of Solomon 1:1', 'Psalms 91:1'];
const STRAY = ['J', ' ', '[', ']', '-', '1', '0', '9', '3', ':', 'é'];

/** A number as a reference's range may hold it, from `next`: 1-3 of the digits 1, 0, 9 and 3 (none in an eighth), now and then a stray character. */
const numberOf = (next: () => number): string =>
  Array.from({ length: below(next, 8) === 0 ? 0 : 1 + below(next, 3) }, () =>
    below(next, 10) === 0 ? pick(next, STRAY) : pick(next, ['1', '0', '9', '3']),
  ).join('');

const NEAR_MISSES = [
  'John 3:16 [01-6]',
  'John 3:16 [1-06]',
  'John 3:16 [0-3]',
  'John 3:16 [3-1]',
  'John 3:16 [1-6] ',
  'John 3:16[1-6]',
  'John 3:16 1-6]',
  'John 3:16 [1-6',
  'John 3:16 [+1-6]',
  'John 3:16 [-1-6]',
  'John 3:16 [1--6]',
  'John 3:16 [1-6-7]',
  'John 3:16 [1.5-6]',
  'John 3:16 [1-9007199254740992]',
  'John 3:16 [9007199254740992-9007199254740993]',
  'John [3]:16 [1-6]',
  'John 3:16] [1-6]',
  ' [1-6]',
  '[1-6]',
  'John 3:16 [1-6]x',
  'John 3:16 [ 1-6]',
  'John 3:16 [1 - 6]',
  'John 3:16 [١-٦]',
  'John 3:16',
  '',
];

describe('the phrase reference', () => {
  it('reads back what it writes, for verse references and any verse part with no bracket', () => {
    const next = random(0x2e1);
    const faults: string[] = [];
    for (let c = 0; c < 3000; c += 1) {
      const verse =
        below(next, 2) === 0
          ? pick(next, VERSES)
          : Array.from({ length: 1 + below(next, 8) }, () =>
              pick(
                next,
                STRAY.filter((char) => char !== '[' && char !== ']'),
              ),
            ).join('');
      const a = 1 + below(next, 120);
      const b = 1 + below(next, 120);
      const first = Math.min(a, b);
      const last = Math.max(a, b);
      const reference = phraseReference(verse, { first, last });
      if (reference !== phraseRefRule(verse, first, last))
        faults.push(`${first}-${last} written another way`);
      if (
        JSON.stringify(Option.getOrUndefined(phraseOf(reference))) !==
        JSON.stringify({ verse, first, last })
      )
        faults.push(`${JSON.stringify(reference)} read back otherwise`);
    }
    expect(faults.slice(0, 10)).toEqual([]);
  });

  it('reads no near miss of the form, and reads generated strings as H2 does', () => {
    expect(
      NEAR_MISSES.filter((reference) => Option.isSome(phraseOf(reference))).concat(
        NEAR_MISSES.filter((reference) => phraseOfRule(reference) !== undefined),
      ),
    ).toEqual([]);
    expect(
      Option.getOrUndefined(phraseOf('John 3:16 [9007199254740991-9007199254740991]')),
    ).toEqual({
      verse: 'John 3:16',
      first: 9007199254740991,
      last: 9007199254740991,
    });
    const next = random(0x51a7);
    const faults: string[] = [];
    let read = 0;
    for (let c = 0; c < 3000; c += 1) {
      const text =
        below(next, 2) === 0
          ? `${pick(next, VERSES)} [${numberOf(next)}${pick(next, ['-', '-', '-', '', '--', ':'])}${numberOf(next)}]`
          : Array.from({ length: below(next, 16) }, () => pick(next, STRAY)).join('');
      const got = Option.getOrUndefined(phraseOf(text));
      const want = phraseOfRule(text);
      if (want !== undefined) read += 1;
      if (JSON.stringify(got) !== JSON.stringify(want))
        faults.push(`${JSON.stringify(text)} read as ${JSON.stringify(got)}`);
    }
    expect(faults.slice(0, 10)).toEqual([]);
    expect(read).toBeGreaterThan(100);
  });
});
