/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's committed data files from disk, synchronously, and hashes and parses them plainly. */

/**
 * The natural voice's committed data: Kokoro's vocab byte for byte as the
 * pinned revision publishes it, and the KJV pronunciation list and its
 * overrides, each key once and in UTF-16 order, each phoneme string
 * non-empty, unspaced and spoken in the vocab's symbols, and its bytes the
 * generator's last run (`data/lexicon.py`); a word differing from a listed
 * key only by case plans none over it. That the list holds exactly the
 * KJV's keys, with Misaki's phonemes, is the generator's own work, checked
 * outside the unit tests.
 */

import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Option } from 'effect';

import { planOf } from './plan';

const DATA = join(import.meta.dir, '../../data');
const VOCAB_SHA256 = '8d65b0188b77eafc60751dac42bbac7ab5f5685074af44db91d1877b42dc1d7c';
/** The SHA-256 of `kjv-phonemes.json` as the generator writes it from Misaki 0.9.4 and the overrides, so a hand edit goes red. */
const LIST_SHA256 = 'b568a8b41cb55dfa6b9021e67abaf50a7df5efbb602aeb6a9d092fcd2d54f810';

const vocabBytes = readFileSync(join(DATA, 'kokoro-vocab.json'));
const vocab = new Map(
  Object.entries(JSON.parse(vocabBytes.toString('utf8')) as Record<string, number>),
);
const listText = readFileSync(join(DATA, 'kjv-phonemes.json'), 'utf8');
const list = JSON.parse(listText) as Record<string, string>;
const overrides = JSON.parse(
  readFileSync(join(DATA, 'kjv-phonemes.overrides.json'), 'utf8'),
) as Record<string, string>;

const spoken = (phonemes: string) =>
  phonemes.length > 0 &&
  !/\s/u.test(phonemes) &&
  Array.from(phonemes).every((symbol) => vocab.has(symbol));

describe('the natural voice’s data', () => {
  it('holds Kokoro’s vocab as the pinned revision publishes it', () => {
    expect(createHash('sha256').update(vocabBytes).digest('hex')).toBe(VOCAB_SHA256);
    expect([vocab.size, vocab.get(' ')]).toEqual([114, 16]);
  });

  it('holds the list as `data/lexicon.py` last wrote it; a regeneration updates this hash', () => {
    expect(createHash('sha256').update(listText).digest('hex')).toBe(LIST_SHA256);
  });

  it('lists each key once, one entry a line, in UTF-16 order, each spoken in the vocab', () => {
    const keys = Object.keys(list);
    const lines = listText.split('\n');
    expect([lines[0], lines.at(-2), lines.at(-1)]).toEqual(['{', '}', '']);
    expect(lines.length - 3).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(13_000);
    expect(keys.filter((key, index) => index > 0 && !((keys[index - 1] ?? '') < key))).toEqual([]);
    expect(keys.filter((key) => !spoken(list[key] ?? ''))).toEqual([]);
  });

  it('overrides only listed keys, with the override in the list and spoken in the vocab', () => {
    const keys = Object.keys(overrides);
    expect(keys.length).toBeLessThanOrEqual(200);
    expect(keys.filter((key) => !(key in list) || list[key] !== overrides[key])).toEqual([]);
    expect(keys.filter((key) => !spoken(overrides[key] ?? ''))).toEqual([]);
  });

  it('plans none for a word that differs from a listed key only by case', () => {
    const words = new Map(Object.entries(list));
    const variants = {
      Thee: 'thee',
      THEE: 'thee',
      jesus: 'Jesus',
      israel: 'Israel',
      SELAH: 'Selah',
    };
    expect(Object.keys(variants).filter((key) => key in list)).toEqual([]);
    expect(Object.values(variants).filter((key) => !(key in list))).toEqual([]);
    const plans = (text: string) => Option.isSome(planOf(words, vocab, text));
    expect(Object.keys(variants).map(plans)).toEqual(Object.keys(variants).map(() => false));
    expect(Object.values(variants).map(plans)).toEqual(Object.values(variants).map(() => true));
  });
});
