/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's committed data files from disk and the plugin's answer as the JSON it is. */

/**
 * The bundle-time lexicon (hskokoro K6): `readLexicon` carries the two
 * committed data files exactly, `lexiconOf` refuses a list or vocab of the
 * wrong shape, and the plugin serves `virtual:heartseed-lexicon` as the
 * script prints it (the plugin runs the script, so its printed output is
 * what this reads).
 *
 * It catches a derivation that drops, adds or alters an entry, takes the
 * files the wrong way round, lets a word without phonemes or a fractional
 * id through, or a plugin that does not serve the module. It misses the
 * bundler's own handling of the module.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lexiconOf, readLexicon } from './lexicon';
import { passage } from './plugin';

const DATA = join(import.meta.dir, '../data');
const wordsText = readFileSync(join(DATA, 'kjv-phonemes.json'), 'utf8');
const vocabText = readFileSync(join(DATA, 'kokoro-vocab.json'), 'utf8');

describe('readLexicon', () => {
  it('carries both data files, each entry once, in the files’ order', () => {
    const read = readLexicon();
    expect(Object.entries(read.words)).toEqual(Object.entries(JSON.parse(wordsText)));
    expect(Object.entries(read.vocab)).toEqual(Object.entries(JSON.parse(vocabText)));
    expect(Object.keys(read.words).length).toBe(13_756);
    expect(Object.keys(read.vocab).length).toBe(114);
  });
});

describe('lexiconOf', () => {
  it('takes a list of phoneme strings and a vocab of whole ids', () => {
    expect(lexiconOf('{"a":"ɐ"}', '{"ɐ":69," ":16}')).toEqual({
      words: { a: 'ɐ' },
      vocab: { ɐ: 69, ' ': 16 },
    });
  });

  it('refuses a word without a phoneme string, a fractional or textual id, or a list that is no record', () => {
    for (const [words, vocab] of [
      ['{"a":1}', '{"ɐ":69}'],
      ['{"a":null}', '{"ɐ":69}'],
      ['{"a":"ɐ"}', '{"ɐ":6.5}'],
      ['{"a":"ɐ"}', '{"ɐ":"69"}'],
      ['["ɐ"]', '{"ɐ":69}'],
      ['{"a":"ɐ"}', '[69]'],
    ] as const)
      expect(() => lexiconOf(words, vocab)).toThrow();
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
