/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records. */

/**
 * Lining up as a property: a made-up verse of distinct words, and a tagged
 * copy of it with words split, joined, dropped or added at random. A shown
 * word that survives unchanged keeps its numbers; no shown word takes a
 * number from a word it does not match; a verse equal in words takes its
 * tags word for word; and a verse where under 80% of the tagged words find
 * their shown word carries none.
 */

import { describe, expect, it } from 'bun:test';

import { seeded, type Random } from '../test/random';
import { ALIGN_FLOOR, alignVerse, type TaggedWord } from './align';
import { lettersOf } from './words';

const RUNS = 400;

/** A word no other made-up word spells: its run's letters by index. */
const wordAt = (index: number) =>
  Array.from(String(index + 10), (digit) => 'abcdefghij'[Number(digit)] ?? 'z').join('');

/** Punctuation and case as the KJV's text varies it. */
const dressed = (random: Random, word: string) =>
  `${random.chance(0.2) ? word.toUpperCase() : word}${random.pick(['', '', ',', ';', '.', ':'])}`;

interface Made {
  readonly shown: Array<string>;
  readonly tagged: Array<TaggedWord>;
  /** For each tagged word, the shown word it stands for unchanged, or -1. */
  readonly source: Array<number>;
}

/** A verse and its tagged copy, edited at random. */
const made = (random: Random): Made => {
  const words = Array.from({ length: 2 + random.below(40) }, (_, index) => wordAt(index));
  const shown = words.map((word) => dressed(random, word));
  const tagged: Array<TaggedWord> = [];
  const source: Array<number> = [];
  const numbersFor = (index: number) =>
    random.chance(0.3) ? [] : Array.from({ length: 1 + random.below(3) }, () => index * 7 + 1);
  for (let index = 0; index < words.length; index++) {
    const word = words[index] ?? '';
    const edit = random.below(10);
    if (edit === 0) continue;
    if (edit === 1 && word.length > 3) {
      tagged.push({ text: word.slice(0, 2), numbers: numbersFor(index), added: false });
      tagged.push({ text: word.slice(2), numbers: numbersFor(index), added: false });
      source.push(-1, -1);
      continue;
    }
    if (edit === 2 && index + 1 < words.length) {
      tagged.push({ text: `${word}${words[index + 1]}`, numbers: numbersFor(index), added: false });
      source.push(-1);
      index++;
      continue;
    }
    if (edit === 3) {
      tagged.push({ text: `x${wordAt(900 + index)}`, numbers: [99_999], added: true });
      source.push(-1);
    }
    tagged.push({ text: word, numbers: numbersFor(index), added: random.chance(0.1) });
    source.push(index);
  }
  return { shown, tagged, source };
};

describe('lining up the tags with the shown words', () => {
  it('a shown word that survives unchanged keeps its numbers, and none takes a number from a word it does not match', () => {
    const random = seeded(41);
    let aligned = 0;
    for (let run = 0; run < RUNS; run++) {
      const { shown, tagged, source } = made(random);
      const result = alignVerse(shown, tagged);
      expect(result.from.length).toBe(shown.length);
      if (result.tags === undefined) {
        const matched = source.filter((index) => index >= 0).length;
        expect(matched).toBeLessThan(ALIGN_FLOOR * tagged.length + 1);
        continue;
      }
      expect(result.tags.length).toBe(shown.length);
      if (result.kind === 'equal') continue;
      aligned++;
      result.from.forEach((index, at) => {
        const tag = result.tags?.[at];
        if (index < 0) {
          expect(tag).toEqual({ numbers: [], added: false });
          return;
        }
        expect(lettersOf(tagged[index]?.text ?? '')).toBe(lettersOf(shown[at] ?? ''));
        expect(tag?.numbers).toEqual(tagged[index]?.numbers ?? []);
        expect(tag?.added).toBe(tagged[index]?.added ?? false);
      });
      source.forEach((at, index) => {
        if (at < 0) return;
        const tag = result.tags?.[at];
        expect(tag?.numbers).toEqual(tagged[index]?.numbers);
      });
    }
    expect(aligned).toBeGreaterThan(RUNS / 4);
  });

  it('a verse equal in words takes its tags word for word, whatever the words', () => {
    const random = seeded(42);
    for (let run = 0; run < RUNS; run++) {
      const shown = Array.from({ length: 1 + random.below(30) }, (_, index) => wordAt(index));
      const tagged = shown.map((_, index) => ({
        text: random.chance(0.1) ? 'Cæsar' : (shown[index] ?? ''),
        numbers: [index + 1],
        added: random.chance(0.2),
      }));
      const result = alignVerse(shown, tagged);
      expect(result.kind).toBe('equal');
      expect(result.tags).toEqual(tagged.map(({ numbers, added }) => ({ numbers, added })));
    }
  });

  it('words the tagged text lacks take none, and a verse whose tagged words mostly find nothing is bare', () => {
    const title = ['A', 'Psalm', 'of', 'David.'];
    const verse = ['LORD,', 'how', 'are', 'they', 'increased'];
    const tagged = ['Lord,', 'how', 'are', 'they', 'increased'].map((text, index) => ({
      text,
      numbers: [index + 1],
      added: false,
    }));
    const result = alignVerse([...title, ...verse], tagged);
    expect(result.kind).toBe('aligned');
    expect(result.tags?.map((tag) => tag.numbers)).toEqual([
      [],
      [],
      [],
      [],
      [1],
      [2],
      [3],
      [4],
      [5],
    ]);
    expect(alignVerse(['one', 'two', 'three'], tagged).kind).toBe('bare');
  });
});
