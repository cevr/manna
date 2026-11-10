/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish -- the model reads the plain maps the lists are, and the sample's generator writes its choices as plain branches. */

/**
 * Each natural voice's list over the whole KJV as the app reads it
 * (`src/kjv.ts`). Every distinct word run of the corpus (a whitespace run
 * holding a letter or a number, its edges and all), planned alone in each
 * voice, is one chunk of BOS, its spoken lead, its voice's list's entry for
 * its key, its spoken trail and EOS, marked at its first phoneme over the
 * whole run: so every word of every verse is spoken by its own voice's
 * list. Then, over a seeded sample of verses with Isaiah 41:10 and John 3:16
 * among them, Him's plan lights the runs Her's lights and ends the phrases
 * Her's ends with the same rests, though nearly every verse's ids differ.
 *
 * It catches a voice planned by the other's list, a list served twice, a
 * word the British list lacks or holds out of the vocab, and a British entry
 * that moves a phrase's end. It misses the source's choice of list per speak
 * (`voice-lists.test.ts`, `route.test.ts`) and any change to a plan's ids
 * that both voices share (`plan.property.test.ts`).
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { versesOf } from '../kjv';
import { lexicon, type Lexicon } from './lexicon';
import type { NaturalVoice } from './manifest';
import { planOf, type NaturalPlan } from './plan';

const SEED = 41;
const SAMPLE = 700;
/** The verses always in the sample: Isaiah 41:10 (Today's passage) and John 3:16. */
const FIXED = [
  [23, 41, 10],
  [43, 3, 16],
] as const;

const SPOKEN = new Set([',', '.', ':', ';', '?', '!', '(', ')']);
const saidAs = (char: string) => (char === ';' || char === ':' ? '.' : char);
const isWordChar = (char: string) => /[\p{L}\p{N}]/u.test(char);

/** A seeded generator in [0, 1) (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** Every distinct whitespace run of the corpus, and how many verses it holds. */
const corpusRuns = () => {
  const runs = new Set<string>();
  let verses = 0;
  for (const book of BIBLE_BOOKS)
    for (let chapter = 1; chapter <= book.chapters; chapter += 1)
      for (const verse of versesOf(book.number, chapter)) {
        verses += 1;
        for (const run of verse.split(/\s+/u)) if (run !== '') runs.add(run);
      }
  return { runs, verses };
};

/** A run's key (its letters and numbers from the first to the last) and its spoken lead and trail; none for a run with no word. */
const partsOf = (run: string) => {
  const chars = Array.from(run);
  const first = chars.findIndex(isWordChar);
  if (first < 0) return Option.none();
  const last = chars.findLastIndex(isWordChar);
  const edge = (side: ReadonlyArray<string>) => side.filter((char) => SPOKEN.has(char)).map(saidAs);
  return Option.some({
    key: chars.slice(first, last + 1).join(''),
    lead: edge(chars.slice(0, first)),
    trail: edge(chars.slice(last + 1)),
  });
};

/** Whether `run` planned alone by `list` is the model's one chunk, or why not. */
const faultOf = (
  list: Lexicon,
  run: string,
  key: string,
  lead: ReadonlyArray<string>,
  trail: ReadonlyArray<string>,
) => {
  const body = list.words.get(key);
  if (body === undefined) return 'no entry';
  const want = [
    0,
    ...[...lead, ...Array.from(body), ...trail].map((symbol) => list.vocab.get(symbol) ?? -1),
    0,
  ];
  const planned = planOf(list.words, list.vocab, run);
  if (Option.isNone(planned)) return 'unplanned';
  const [chunk, ...more] = planned.value.chunks;
  if (chunk === undefined || more.length > 0) return 'chunks';
  if (JSON.stringify(chunk.ids) !== JSON.stringify(want)) return 'ids';
  const wantMarks = [{ token: 1 + lead.length, location: 0, length: run.length }];
  if (JSON.stringify(chunk.marks) !== JSON.stringify(wantMarks)) return 'marks';
  return '';
};

/** A plan's lit runs and its phrase ends with their rests, by word count. */
const outlineOf = (plan: NaturalPlan) => {
  let words = 0;
  const runs: Array<string> = [];
  const ends: Array<string> = [];
  for (const chunk of plan.chunks) {
    words += chunk.marks.length;
    for (const mark of chunk.marks) runs.push(`${mark.location}+${mark.length}`);
    if (chunk.rest > 0) ends.push(`${words}:${chunk.rest}`);
  }
  return `${runs.join(',')}|${ends.join(',')}`;
};

const VOICES_READ: ReadonlyArray<NaturalVoice> = ['af_heart', 'bm_george'];

describe('the natural voice’s two lists over the KJV', () => {
  it('speaks every word run of the corpus by its voice’s list, between its spoken edges', () => {
    const { runs, verses } = corpusRuns();
    const her = lexicon('af_heart');
    const him = lexicon('bm_george');
    const faults: Array<string> = [];
    let words = 0;
    let differ = 0;
    for (const run of runs) {
      const parts = partsOf(run);
      if (Option.isNone(parts)) continue;
      const { key, lead, trail } = parts.value;
      words += 1;
      if (her.words.get(key) !== him.words.get(key)) differ += 1;
      for (const voice of VOICES_READ) {
        const fault = faultOf(lexicon(voice), run, key, lead, trail);
        if (fault !== '') faults.push(`${voice} ${key}: ${fault}`);
      }
    }
    expect(faults.slice(0, 5)).toEqual([]);
    expect(verses).toBe(31_102);
    expect(words).toBe(28_881);
    expect(differ).toBe(21_182);
  });

  it('lights Her’s runs and ends Her’s phrases over a seeded sample of verses', () => {
    const next = random(SEED);
    const her = lexicon('af_heart');
    const him = lexicon('bm_george');
    const faults: Array<string> = [];
    let differ = 0;
    for (let drawn = 0; drawn < SAMPLE; drawn += 1) {
      const fixed = FIXED[drawn];
      const book = (
        fixed === undefined
          ? BIBLE_BOOKS[Math.floor(next() * BIBLE_BOOKS.length)]
          : BIBLE_BOOKS.find((each) => each.number === fixed[0])
      ) as (typeof BIBLE_BOOKS)[number];
      const chapter = fixed === undefined ? 1 + Math.floor(next() * book.chapters) : fixed[1];
      const verses = versesOf(book.number, chapter);
      const verse = fixed === undefined ? Math.floor(next() * verses.length) : fixed[2] - 1;
      const where = `${book.number}:${chapter}:${verse + 1}`;
      const text = verses[verse] ?? '';
      const hers = planOf(her.words, her.vocab, text);
      const his = planOf(him.words, him.vocab, text);
      if (Option.isNone(hers) || Option.isNone(his)) faults.push(`${where} unplanned`);
      else if (outlineOf(hers.value) !== outlineOf(his.value)) faults.push(`${where} outline`);
      else if (
        JSON.stringify(hers.value.chunks.map((chunk) => chunk.ids)) !==
        JSON.stringify(his.value.chunks.map((chunk) => chunk.ids))
      )
        differ += 1;
    }
    expect(faults.slice(0, 5)).toEqual([]);
    expect(differ).toBeGreaterThan(SAMPLE - 10);
  });
});
