/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's committed data files from disk, synchronously, and hashes and parses them plainly. */

/**
 * The natural voice's committed data: Kokoro's vocab byte for byte as the
 * pinned revision publishes it, and the two KJV pronunciation lists (the
 * American one Her reads, the British one Him reads) and their overrides,
 * each key once and in UTF-16 order, each phoneme string non-empty, unspaced
 * and spoken in the vocab's symbols, and their bytes the generator's last run
 * (`data/lexicon.py`). The British list holds the American list's keys in its
 * order, each list writes only its own dialect's symbols, and a word
 * differing from a listed key only by case plans none over it. That the
 * lists hold exactly the KJV's keys, with Misaki's phonemes, is the
 * generator's own work, checked outside the unit tests.
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
/** The SHA-256 of `kjv-phonemes-gb.json` as the generator writes it from Misaki 0.9.4 (british=True) and its overrides. */
const GB_LIST_SHA256 = 'b8c9c72099a4a32ade69df4434f3d3ec1690736ef358b2ac194a3c07e80cbf5c';
/** Symbols only Misaki's American G2P writes, and only its British one. */
const US_ONLY = ['æ', 'O', 'T', 'ᵻ'];
const GB_ONLY = ['ɒ', 'ː', 'a', 'Q'];
/** The plan's own stops and brackets, which no list entry may hold. */
const MARKS = new Set([',', '.', ':', ';', '?', '!', '(', ')']);

const vocabBytes = readFileSync(join(DATA, 'kokoro-vocab.json'));
const vocab = new Map(
  Object.entries(JSON.parse(vocabBytes.toString('utf8')) as Record<string, number>),
);
const read = (name: string) => readFileSync(join(DATA, name), 'utf8');
const listText = read('kjv-phonemes.json');
const list = JSON.parse(listText) as Record<string, string>;
const overrides = JSON.parse(read('kjv-phonemes.overrides.json')) as Record<string, string>;
const gbText = read('kjv-phonemes-gb.json');
const gb = JSON.parse(gbText) as Record<string, string>;
const gbOverrides = JSON.parse(read('kjv-phonemes-gb.overrides.json')) as Record<string, string>;
const lists = [
  { name: 'American', text: listText, entries: list, overrides },
  { name: 'British', text: gbText, entries: gb, overrides: gbOverrides },
];

const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const spoken = (phonemes: string) =>
  phonemes.length > 0 &&
  !/\s/u.test(phonemes) &&
  Array.from(phonemes).every((symbol) => vocab.has(symbol) && !MARKS.has(symbol));
const holding = (entries: Record<string, string>, symbols: ReadonlyArray<string>) =>
  Object.keys(entries).filter((key) =>
    symbols.some((symbol) => (entries[key] ?? '').includes(symbol)),
  );

describe('the natural voice’s data', () => {
  it('holds Kokoro’s vocab as the pinned revision publishes it', () => {
    expect(sha256(vocabBytes)).toBe(VOCAB_SHA256);
    expect([vocab.size, vocab.get(' ')]).toEqual([114, 16]);
  });

  it('holds both lists as `data/lexicon.py` last wrote them; a regeneration updates these hashes', () => {
    expect([sha256(listText), sha256(gbText)]).toEqual([LIST_SHA256, GB_LIST_SHA256]);
  });

  it.each(lists)(
    'lists each $name key once, one entry a line, in UTF-16 order, each spoken in the vocab',
    ({ text, entries }) => {
      const keys = Object.keys(entries);
      const lines = text.split('\n');
      expect([lines[0], lines.at(-2), lines.at(-1)]).toEqual(['{', '}', '']);
      expect(lines.length - 3).toBe(keys.length);
      expect(keys.length).toBeGreaterThan(13_000);
      expect(keys.filter((key, index) => index > 0 && !((keys[index - 1] ?? '') < key))).toEqual(
        [],
      );
      expect(keys.filter((key) => !spoken(entries[key] ?? ''))).toEqual([]);
    },
  );

  it.each(lists)(
    'overrides only listed $name keys, with the override in the list and spoken in the vocab',
    ({ entries, overrides: own }) => {
      const keys = Object.keys(own);
      expect(keys.length).toBeLessThanOrEqual(200);
      expect(keys.filter((key) => !(key in entries) || entries[key] !== own[key])).toEqual([]);
      expect(keys.filter((key) => !spoken(own[key] ?? ''))).toEqual([]);
    },
  );

  it('holds the American list’s keys in the British list, in its order', () => {
    expect(Object.keys(gb)).toEqual(Object.keys(list));
  });

  it('speaks each dialect’s own symbols in its list, and 10,242 of the 13,756 keys change', () => {
    expect(holding(gb, US_ONLY)).toEqual([]);
    expect(holding(list, GB_ONLY)).toEqual([]);
    expect(holding(gb, GB_ONLY).length).toBeGreaterThan(5_000);
    expect(Object.keys(list).filter((key) => list[key] !== gb[key]).length).toBe(10_242);
    const finalR = Object.keys(gb).filter((key) => /^[a-z]+r$/u.test(key));
    expect(finalR.length).toBeGreaterThan(500);
    expect(finalR.filter((key) => (gb[key] ?? '').endsWith('ɹ'))).toEqual([]);
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
