/**
 * Under first letters each hidden word shows its first letter or number as
 * written (spec A4): over seeded verses of generated words, among them
 * words led by a numeral (`3rd`, `144,000`, `2:4`), by punctuation (`(and`,
 * `‘Fear`, `--the`) and by both (`(7`), each word Today draws at rest is
 * the model's: the first character that is a letter or a number, and the
 * word's first character when it has none. The rule drawn is the current
 * Heartseed's (`lettersOf`); this model is written apart from it, so a
 * change to that rule turns the test red.
 */

import { expect, it } from 'bun:test';

import { seeded, type Random } from '../test/random';
import { initial, step } from './step';
import { view } from './view';

const LEADS = ['', '', '', '(', '‘', '"', '--', '[', '¶ '];
const BODIES = ['3rd', '144,000', '2:4', '7', 'Fear', 'and', 'LORD', 'thee', 'Ah', 'É', 'o'];
const TAILS = ['', '', ',', ';', '.', ')', '’', ':', '?'];

/** The model's first letter or number of `word`: the first character that is either, else its first. */
const firstOf = (word: string) => {
  const chars = [...word];
  return chars.find((char) => /[\p{L}\p{N}]/u.test(char)) ?? chars[0] ?? '';
};

const verseOf = (random: Random) =>
  Array.from(
    { length: 3 + random.below(10) },
    () => `${random.pick(LEADS).trim()}${random.pick(BODIES)}${random.pick(TAILS)}`,
  ).join(' ');

it('draws each hidden word under first letters as its first letter or number, numerals and punctuation first included', () => {
  let numerals = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const text = verseOf(seeded(seed));
    const state = step(initial({ reference: 'Test 1:1', text }), {
      _tag: 'cue',
      cue: 'initials',
      cap: 2,
    });
    const words = text.split(' ');
    const drawn = view(state).words;
    expect({ seed, count: drawn.length }).toEqual({ seed, count: words.length });
    for (const word of drawn) {
      const own = words[word.index] ?? '';
      if (/^\P{L}*\p{N}/u.test(own)) numerals++;
      expect({ seed, own, shown: word.shown }).toEqual({ seed, own, shown: firstOf(own) });
    }
  }
  expect(numerals).toBeGreaterThan(100);
});
