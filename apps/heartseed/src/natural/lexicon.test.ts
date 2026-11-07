/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's committed data files from disk and parses them plainly. */

/**
 * The lexicon as the app reads it, through `virtual:heartseed-lexicon`
 * (the test preload stands it in by `vite/lexicon.ts`, as the bundler
 * plugin does): its maps hold the committed data files' entries, they are
 * built once, and they plan Today's passage.
 *
 * It catches maps that drop or alter an entry, swap the list and the
 * vocab, or are rebuilt on each call. It misses the bundler's own module.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Option } from 'effect';
import today from 'virtual:heartseed-passage';

import { lexicon } from './lexicon';
import { planOf } from './plan';

const DATA = join(import.meta.dir, '../../data');
const entries = <A>(file: string): Array<[string, A]> =>
  Object.entries(JSON.parse(readFileSync(join(DATA, file), 'utf8')) as Record<string, A>);

describe('lexicon', () => {
  it('maps each committed entry, in the files’ order', () => {
    expect([...lexicon().words]).toEqual(entries<string>('kjv-phonemes.json'));
    expect([...lexicon().vocab]).toEqual(entries<number>('kokoro-vocab.json'));
  });

  it('builds its maps once', () => {
    const first = lexicon();
    expect(lexicon()).toBe(first);
    expect(lexicon().words).toBe(first.words);
  });

  it('plans Today’s passage', () => {
    const { words, vocab } = lexicon();
    expect(Option.isSome(planOf(words, vocab, today.text))).toBe(true);
  });
});
