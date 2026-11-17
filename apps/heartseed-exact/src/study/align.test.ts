/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records. */

/**
 * Lining up as a property: a made-up verse of distinct words, and a tagged
 * copy of it with words split, joined, dropped or added at random. A shown
 * word that survives unchanged keeps its numbers; no shown word takes a
 * number from a word it does not match; a verse equal in words whose words
 * are alike takes its tags word for word, and one where a word stands
 * against another is lined up by its words; and a verse is bare exactly
 * when under 80% of the tagged words find their shown word.
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

  it('a verse equal in words whose words are alike (æ written out, an older spelling one letter apart) takes its tags word for word', () => {
    const random = seeded(42);
    for (let run = 0; run < RUNS; run++) {
      const shown = Array.from({ length: 1 + random.below(30) }, (_, index) =>
        dressed(random, `${wordAt(index)}ae${wordAt(index)}`),
      );
      const tagged = shown.map((word, index) => {
        const letters = lettersOf(word);
        const spelt = random.pick([
          letters,
          letters.replace('ae', 'æ'),
          `${letters.slice(0, -1)}z`,
          `${letters}s`,
          letters.slice(1),
        ]);
        return { text: spelt, numbers: [index + 1], added: random.chance(0.2) };
      });
      const result = alignVerse(shown, tagged);
      expect(result.kind).toBe('equal');
      expect(result.tags).toEqual(tagged.map(({ numbers, added }) => ({ numbers, added })));
    }
  });

  it('a verse equal in words where a word stands against another lines up by its words, so no number moves to a word it does not match', () => {
    const random = seeded(43);
    let moved = 0;
    for (let run = 0; run < RUNS; run++) {
      const words = Array.from({ length: 3 + random.below(30) }, (_, index) => wordAt(index));
      const cut = random.below(words.length - 1);
      const tagged = [
        ...words.slice(0, cut).map((text, index) => ({ text, numbers: [index + 1], added: false })),
        { text: '(', numbers: [], added: false },
        ...words.slice(cut, -1).map((text, index) => ({
          text,
          numbers: [cut + index + 1],
          added: false,
        })),
      ];
      const result = alignVerse(words, tagged);
      expect(result.kind).not.toBe('equal');
      if (result.tags === undefined) continue;
      moved++;
      result.tags.forEach((tag, at) => {
        expect(tag.numbers).toEqual(at === words.length - 1 ? [] : [at + 1]);
      });
    }
    expect(moved).toBeGreaterThan(RUNS / 2);
  });

  it("a verse is bare exactly when under 80% of its tagged words find their shown word (the spec's floor, held apart from ALIGN_FLOOR)", () => {
    const random = seeded(44);
    for (let run = 0; run < RUNS; run++) {
      const size = 5 + random.below(40);
      const found = Math.ceil(0.5 * size) + random.below(Math.floor(0.5 * size) + 1);
      const tagged = Array.from({ length: size }, (_, index) => ({
        text: wordAt(index),
        numbers: [index + 1],
        added: false,
      }));
      const shown = [
        ...tagged.map((word, index) => (index < found ? word.text : `x${wordAt(500 + index)}`)),
        `x${wordAt(999)}`,
      ];
      const result = alignVerse(shown, tagged);
      expect(result.kind).toBe(found * 5 < size * 4 ? 'bare' : 'aligned');
    }
  });

  it('words the tagged text lacks take none, and a verse whose tagged words mostly find nothing is bare', () => {
    const title = ['Abc', 'bcd', 'cde', 'def.'];
    const verse = ['EFG,', 'fgh', 'ghi', 'hij', 'ijk'];
    const tagged = ['Efg,', 'fgh', 'ghi', 'hij', 'ijk'].map((text, index) => ({
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
