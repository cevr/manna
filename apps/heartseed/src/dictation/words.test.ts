/**
 * The words a listen hints to the recognizer: the verse's distinct word
 * keys, first seen first, at most 100, checked against the model's rule on
 * made-up verses long enough to pass the limit. Only made-up verses are
 * used.
 */

import { describe, expect, it } from 'bun:test';

import { modelHints } from '../test/dictation-model';
import { hintsOf } from './words';

/** A made-up verse of `count` words drawn from `distinct` names, each written in one of a few ways. */
const verseOf = (seed: number, count: number, distinct: number) => {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
  return Array.from({ length: count }, () => {
    const word = `w${next() % distinct}x`;
    const form = next() % 3;
    if (form === 0) return word.toUpperCase();
    if (form === 1) return `${word},`;
    return word;
  }).join(' ');
};

describe('hintsOf', () => {
  it('keeps the first 100 of 140 distinct words, in order', () => {
    const words = Array.from({ length: 140 }, (_, i) => `word${i}`);
    expect(hintsOf(words.join(' '))).toEqual(words.slice(0, 100));
  });

  it('gives each word key once, first seen first, without case or punctuation', () => {
    expect(hintsOf('Alpha, beta; ALPHA gamma. Beta — alpha')).toEqual(['alpha', 'beta', 'gamma']);
    expect(hintsOf(' — ; ')).toEqual([]);
  });

  it('equals the rule on 200 made-up verses, many past the limit', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const verse = verseOf(seed, 20 + (seed % 7) * 40, 30 + (seed % 5) * 40);
      expect(hintsOf(verse)).toEqual(modelHints(verse));
    }
  });
});
