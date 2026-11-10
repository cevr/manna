/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's committed data files from disk and the plugin's answer as the JSON it is. */

/**
 * The bundle-time lexicon (hskokoro K6): `readLexicon` carries
 * the three committed data files exactly (the American list as `us`, the
 * British list as `gb`, the vocab), `lexiconOf` refuses either list or the
 * vocab of the wrong shape, and the plugin serves `virtual:heartseed-lexicon`
 * as the script prints it (the plugin runs the script, so its printed output
 * is what this reads).
 *
 * It catches a derivation that drops, adds or alters an entry, takes the
 * files the wrong way round, serves one list as both, lets a word without
 * phonemes or a fractional id through, or a plugin that does not serve the
 * module. It misses the bundler's own handling of the module.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lexiconOf, readLexicon } from './lexicon';
import { passage } from './plugin';

const DATA = join(import.meta.dir, '../data');
const text = (file: string) => readFileSync(join(DATA, file), 'utf8');
const usText = text('kjv-phonemes.json');
const gbText = text('kjv-phonemes-gb.json');
const vocabText = text('kokoro-vocab.json');

describe('readLexicon', () => {
  it('carries the three data files, each entry once, in the files’ order', () => {
    const read = readLexicon();
    expect(Object.keys(read).toSorted()).toEqual(['lists', 'vocab']);
    expect(Object.keys(read.lists).toSorted()).toEqual(['gb', 'us']);
    expect(Object.entries(read.lists.us)).toEqual(Object.entries(JSON.parse(usText)));
    expect(Object.entries(read.lists.gb)).toEqual(Object.entries(JSON.parse(gbText)));
    expect(Object.entries(read.vocab)).toEqual(Object.entries(JSON.parse(vocabText)));
    expect(Object.keys(read.lists.us).length).toBe(13_756);
    expect(Object.keys(read.lists.gb).length).toBe(13_756);
    expect(read.lists.gb).not.toEqual(read.lists.us);
    expect(Object.keys(read.vocab).length).toBe(114);
  });
});

describe('lexiconOf', () => {
  it('takes two lists of phoneme strings and a vocab of whole ids', () => {
    expect(lexiconOf('{"a":"ɐ"}', '{"a":"a"}', '{"ɐ":69,"a":43," ":16}')).toEqual({
      lists: { us: { a: 'ɐ' }, gb: { a: 'a' } },
      vocab: { ɐ: 69, a: 43, ' ': 16 },
    });
  });

  it('refuses a word of either list without a phoneme string, a fractional or textual id, or a list that is no record', () => {
    for (const [us, gb, vocab] of [
      ['{"a":1}', '{"a":"a"}', '{"ɐ":69}'],
      ['{"a":null}', '{"a":"a"}', '{"ɐ":69}'],
      ['{"a":"ɐ"}', '{"a":1}', '{"ɐ":69}'],
      ['{"a":"ɐ"}', '{"a":null}', '{"ɐ":69}'],
      ['{"a":"ɐ"}', '{"a":"a"}', '{"ɐ":6.5}'],
      ['{"a":"ɐ"}', '{"a":"a"}', '{"ɐ":"69"}'],
      ['["ɐ"]', '{"a":"a"}', '{"ɐ":69}'],
      ['{"a":"ɐ"}', '["a"]', '{"ɐ":69}'],
      ['{"a":"ɐ"}', '{"a":"a"}', '[69]'],
    ] as const)
      expect(() => lexiconOf(us, gb, vocab)).toThrow();
  });
});

describe('the plugin', () => {
  it('serves the lexicon as the script prints it, and nothing for a near name', () => {
    const plugin = passage();
    const id = plugin.resolveId('virtual:heartseed-lexicon');
    expect(id).toBe('\0virtual:heartseed-lexicon');
    const code = String(plugin.load(String(id)));
    expect(code.startsWith('export default ')).toBe(true);
    const served = JSON.parse(code.slice('export default '.length).replace(/;$/u, ''));
    expect(served).toEqual(readLexicon());
    expect(plugin.resolveId('virtual:heartseed-lexicon.ts')).toBeUndefined();
    expect(plugin.load('virtual:heartseed-lexicon')).toBeUndefined();
  });
});
