/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- the test reads the app's KJV word list from disk, synchronously, and parses it plainly. */

/**
 * The sounds-alike table (`data/kjv-hearings.json`) within its bounds: the
 * archaic words, their modern forms, the pronouns and the extras are the
 * spec's lists exactly, written out here; every word is a KJV word (a key
 * of `data/kjv-phonemes.json`, folded) outside the spelling table; every
 * dictionary hearing is one or two folded words that sound as its word and
 * hold neither a pronoun nor the word's modern form; and the reader gives
 * each word its hearings in the spec's order.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import table from '../../data/kjv-hearings.json';
import { SPELLING_PAIRS } from '../test/matcher-model';
import { decodeHearings, hearingsOf, modernOf } from './hearings';

/** The spec's archaic words and each one's modern forms, in order. */
const LISTED = {
  art: ['are'],
  betwixt: ['between'],
  canst: ['can'],
  couldest: ['could'],
  didst: ['did'],
  dost: ['do', 'does'],
  doth: ['does', 'do'],
  ere: ['before'],
  hadst: ['had'],
  hast: ['have', 'has'],
  hath: ['has', 'have'],
  hence: ['from here'],
  hither: ['here'],
  lo: ['look'],
  mayest: ['may'],
  mightest: ['might'],
  naught: ['nothing'],
  nay: ['no'],
  saith: ['says', 'said'],
  sayest: ['say', 'says'],
  shalt: ['shall'],
  shouldest: ['should'],
  spake: ['spoke'],
  sware: ['swore'],
  thee: ['you'],
  thence: ['there', 'from there'],
  thine: ['your', 'yours'],
  thither: ['there'],
  thou: ['you'],
  thy: ['your'],
  thyself: ['yourself'],
  twain: ['two'],
  unto: ['to', 'into'],
  verily: ['truly'],
  wast: ['was', 'were'],
  wert: ['were'],
  whence: ['where', 'from where'],
  wherefore: ['why', 'therefore'],
  whither: ['where'],
  wilt: ['will'],
  wist: ['knew'],
  wot: ['know'],
  wouldest: ['would'],
  ye: ['you'],
  yea: ['yes'],
};
const ARCHAIC: ReadonlyMap<string, readonly string[]> = new Map(Object.entries(LISTED));

const PRONOUNS = [
  ...['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves'],
  ...['you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself'],
  ...['she', 'her', 'hers', 'herself', 'it', 'its', 'itself'],
  ...['they', 'them', 'their', 'theirs', 'themselves'],
];

const byCodeUnit = (a: string, b: string) => Number(a > b) - Number(a < b);
const fold = (text: string) => text.toLocaleLowerCase('und').replace(/[^\p{L}\p{N}]/gu, '');
const normal = (sound: string) => sound.replace(/[ˈˌ ]/gu, '').replaceAll('ð', 'θ');

const KJV: ReadonlySet<string> = new Set(
  Object.keys(
    JSON.parse(readFileSync(join(import.meta.dir, '../../data/kjv-phonemes.json'), 'utf8')),
  ).map(fold),
);
const SPELLED = new Set(SPELLING_PAIRS.flat().map((pair) => pair.split(' ').map(fold).join(' ')));
const entries = Object.entries(table.archaic);

describe('the sounds-alike table', () => {
  it('holds the spec’s archaic words in code-unit order, each with its modern forms', () => {
    expect(Object.keys(table.archaic)).toEqual([...ARCHAIC.keys()].toSorted(byCodeUnit));
    expect(entries.length).toBe(45);
    for (const [word, entry] of entries) {
      expect(entry.modern, word).toEqual([...(ARCHAIC.get(word) ?? [])]);
      expect(modernOf(word), word).toEqual(entry.modern);
    }
    expect(modernOf('fear')).toEqual([]);
  });

  it('holds the pronouns and exactly the two extras, each with a why', () => {
    expect(table.pronouns).toEqual(PRONOUNS.toSorted(byCodeUnit));
    expect(Object.keys(table.extra)).toEqual(['thy', 'yea']);
    expect(Object.keys(table.extra.thy)).toEqual(['thai']);
    expect(Object.keys(table.extra.yea)).toEqual(['yeah']);
    const whys = Object.values(table.extra).flatMap((extra) => Object.values(extra));
    expect(whys.length).toBeLessThanOrEqual(20);
    for (const why of whys) expect(why.trim()).not.toBe('');
  });

  it('keeps every word a folded KJV word outside the spelling table', () => {
    for (const [word] of entries) {
      expect(KJV.has(word), word).toBe(true);
      expect(fold(word), word).toBe(word);
      expect(SPELLED.has(word), word).toBe(false);
    }
  });

  it('keeps every dictionary hearing one or two folded words that sound as its word, with no pronoun or modern form', () => {
    let hearings = 0;
    for (const [word, entry] of entries) {
      const never = new Set([...PRONOUNS, ...entry.modern]);
      const own = new Set(entry.sounds.map(normal));
      for (const [hearing, sound] of Object.entries(entry.hearings)) {
        const parts = hearing.split(' ');
        expect(parts.length, hearing).toBeLessThanOrEqual(2);
        expect(hearing, word).not.toBe(word);
        for (const part of parts) {
          expect(fold(part), hearing).toBe(part);
          expect(never.has(part), `${word}: ${hearing}`).toBe(false);
          if (parts.length === 2) expect(KJV.has(part), `${hearing}: ${part}`).toBe(true);
        }
        expect(sound.split(' ').length, hearing).toBe(parts.length);
        expect(own.has(normal(sound)), `${word}: ${hearing}`).toBe(true);
        hearings += 1;
      }
      for (const extra of Object.keys(table.extra[word as keyof typeof table.extra] ?? {})) {
        expect(Object.hasOwn(entry.hearings, extra), `${word}: ${extra}`).toBe(false);
        for (const part of extra.split(' ')) expect(never.has(part), extra).toBe(false);
      }
    }
    expect(hearings).toBe(26);
  });

  it('gives each word its dictionary hearings in code-unit order, then its extras', () => {
    expect(hearingsOf('thy')).toEqual(['thigh', 'thai']);
    expect(hearingsOf('yea')).toEqual(['yay', 'yeah']);
    expect(hearingsOf('thyself')).toEqual(['thigh self', 'thy self']);
    expect(hearingsOf('thee')).toEqual(['the']);
    expect(hearingsOf('wherefore')).toEqual([
      'ware for',
      'ware four',
      'wear for',
      'wear four',
      'where for',
      'where four',
    ]);
    expect(hearingsOf('thou')).toEqual([]);
    expect(hearingsOf('the')).toEqual([]);
  });

  it('refuses a table that does not decode', () => {
    expect(() => decodeHearings({ archaic: { thy: { modern: 'your' } } })).toThrow();
    expect(decodeHearings(table).pronouns).toEqual(table.pronouns);
  });
});
