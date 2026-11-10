/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's committed data files from disk and parses them plainly. */

/**
 * The lexicon as the app reads it, through `virtual:heartseed-lexicon`
 * (the test preload stands it in by `vite/lexicon.ts`, as the bundler
 * plugin does): Her's words are the American list's entries and Him's the
 * British list's, both over the vocab's, each list built once, and each
 * plans Today's passage.
 *
 * It catches a voice given the other's list, maps that drop or alter an
 * entry, swap a list and the vocab, or are rebuilt on each call. It misses
 * the bundler's own module.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Option } from 'effect';
import today from 'virtual:heartseed-passage';

import { lexicon } from './lexicon';
import { VOICES } from './manifest';
import { planOf } from './plan';

const DATA = join(import.meta.dir, '../../data');
const entries = <A>(file: string): Array<[string, A]> =>
  Object.entries(JSON.parse(readFileSync(join(DATA, file), 'utf8')) as Record<string, A>);

describe('lexicon', () => {
  it('maps each voice’s list, Her the American and Him the British, in the files’ order', () => {
    expect([...lexicon('af_heart').words]).toEqual(entries<string>('kjv-phonemes.json'));
    expect([...lexicon('bm_george').words]).toEqual(entries<string>('kjv-phonemes-gb.json'));
    for (const voice of VOICES)
      expect([...lexicon(voice).vocab]).toEqual(entries<number>('kokoro-vocab.json'));
  });

  it('builds each list’s map once, the two voices’ apart', () => {
    for (const voice of VOICES) {
      const first = lexicon(voice);
      expect(lexicon(voice)).toBe(first);
      expect(lexicon(voice).words).toBe(first.words);
    }
    expect(lexicon('bm_george').words).not.toBe(lexicon('af_heart').words);
  });

  it('plans Today’s passage in each voice', () => {
    for (const voice of VOICES) {
      const { words, vocab } = lexicon(voice);
      expect(Option.isSome(planOf(words, vocab, today.text)), voice).toBe(true);
    }
  });
});
