/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noTryCatch, effect/noNullish, effect/noNodeBuiltinImport, effect/noGlobals -- a test over the current app's host readers: it imports the module fresh with a dynamic import, reads the passage reader's thrown NoSuchVerse as none, and compares the written corpus file with the deriver's JSON. */

/**
 * The text is the current Heartseed's, all of it (spec A1-A4). Its oracles
 * are the current app's own: the chapters its deriver gives
 * (`@manna/heartseed/vite/kjv`), split as its `versesOf` splits them, and
 * each verse as its passage reader gives it (`passageOf`, from the KJV's
 * rows). It catches a chapter shipped out of place, lost, or cut
 * differently; a range read past its chapter, or one that reads a verse
 * under another number; a chapter split at import or more than asked; and a
 * corpus rewritten when nothing changed. It misses the bundler's handling
 * of the written file, which `text.test.contract` reads on each host.
 */

import { readFileSync, statSync } from 'node:fs';

import { versesOf } from '@manna/heartseed/kjv';
import { passageOf, readVerses } from '@manna/heartseed/passage';
import { inChapter, passageReference, verseReference, type Range } from '@manna/heartseed/passages';
import { readChapters } from '@manna/heartseed/vite/kjv';
import { describe, expect, it } from 'bun:test';

import { chaptersRead, KJV_FILE, writeKjv } from '../../tools/kjv';
import { seeded } from '../test/random';
import type * as Text from './text';
import { textOf, textVerses } from './text';

const ROWS = readVerses();

/** Each chapter of the canon, in order, by `book:chapter`, with its verse count as the rows give it. */
const COUNTS = new Map<string, number>();
for (const row of ROWS) {
  const key = `${row.book}:${row.chapter}`;
  COUNTS.set(key, (COUNTS.get(key) ?? 0) + 1);
}
const KEYS = [...COUNTS.keys()];
const placeOf = (key: string) => key.split(':').map(Number) as [number, number];

/** The current app's corpus, by its deriver. */
const CHAPTERS = readChapters();

/** The places `got` and `want` differ, by index: a failure names chapters, never a verse. */
const differ = (got: ReadonlyArray<ReadonlyArray<string>>, want: ReadonlyArray<string>) =>
  want.flatMap((chapter, index) => (got[index]?.join('\n') === chapter ? [] : [KEYS[index]]));

describe('textVerses', () => {
  it('reads every chapter of the canon as the current app’s deriver gives it', () => {
    expect(KEYS.length).toBe(1189);
    const read = KEYS.map((key) => textVerses(...placeOf(key)));
    expect(differ(read, CHAPTERS)).toEqual([]);
    expect(
      differ(
        KEYS.map((key) => versesOf(...placeOf(key))),
        CHAPTERS,
      ),
    ).toEqual([]);
  });

  it('reads each chapter’s verse count as the garden’s chapters held it', () => {
    const counted = KEYS.filter((key) => textVerses(...placeOf(key)).length !== COUNTS.get(key));
    expect(counted).toEqual([]);
  });

  it('reads no verse for a chapter the canon lacks', () => {
    const outside: ReadonlyArray<readonly [number, number]> = [
      [0, 1],
      [67, 1],
      [-1, 1],
      [43, 0],
      [43, 22],
      [19, 151],
      [66, 23],
      [43, 1.5],
      [43, Number.NaN],
      [Number.NaN, 1],
      [43, Number.POSITIVE_INFINITY],
    ];
    for (const [book, chapter] of outside) {
      expect(textVerses(book, chapter), `${book}:${chapter}`).toEqual([]);
      expect(versesOf(book, chapter)).toEqual([]);
    }
  });
});

/** The verse the current app's passage reader gives for `book chapter:verse`, or none where it has none. */
const passageAt = (book: number, chapter: number, verse: number) => {
  try {
    return passageOf(verseReference(book, chapter, verse));
  } catch {
    return undefined;
  }
};

/** A generated range: one verse, a range, one past its chapter's end, or a malformed one. */
const rangeOf = (seed: number): Range => {
  const random = seeded(seed);
  const [book, chapter] = placeOf(random.pick(KEYS));
  const count = COUNTS.get(`${book}:${chapter}`) ?? 0;
  const first = 1 + random.below(count);
  switch (random.below(4)) {
    case 0:
      return { book, chapter, first, last: first };
    case 1:
      return { book, chapter, first, last: Math.min(count, first + random.below(6)) };
    case 2:
      return { book, chapter, first, last: count + 1 + random.below(4) };
    default:
      return random.pick([
        { book, chapter, first: 0, last: first },
        { book, chapter, first: first + 1, last: first },
        { book, chapter, first: first + 0.5, last: count },
        { book, chapter: chapter + 0.5, first: 1, last: 1 },
        { book: 0, chapter: 1, first: 1, last: 1 },
        { book, chapter, first: Number.NaN, last: 2 },
      ]);
  }
};

describe('textOf', () => {
  it('reads a generated range’s verses, each as the current app’s passage reader gives it', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const range = rangeOf(seed);
      const read = textOf(range);
      const want = Array.from({ length: Math.max(0, range.last - range.first + 1) }, (_, at) => ({
        verse: range.first + at,
        passage: passageAt(range.book, range.chapter, range.first + at),
      })).filter(({ passage }) => passage !== undefined);
      const label = `seed ${seed}: ${range.book} ${range.chapter}:${range.first}-${range.last}`;
      const count = COUNTS.get(`${range.book}:${range.chapter}`) ?? 0;
      const held = { ...range, last: Math.min(range.last, count) };
      if (!inChapter(held)) {
        expect(read, label).toEqual({ reference: '', verses: [] });
        kinds.add('malformed');
        continue;
      }
      expect(
        read.verses.map(({ verse }) => verse),
        label,
      ).toEqual(want.map(({ verse }) => verse));
      expect(
        read.verses.every(({ text }, at) => text === want[at]?.passage?.text),
        label,
      ).toBe(true);
      expect(read.reference, label).toBe(passageReference(held));
      if (held.first === held.last) expect(read.reference).toBe(want[0]?.passage?.reference ?? '-');
      kinds.add(range.last > count ? 'past' : held.first === held.last ? 'one' : 'range');
    }
    expect([...kinds].toSorted()).toEqual(['malformed', 'one', 'past', 'range']);
  });

  it('reads no verse for a range from verse 0, even one running to its chapter’s end', () => {
    const count = COUNTS.get('43:3') ?? 0;
    expect(count).toBeGreaterThan(1);
    for (const last of [0, 1, count - 1, count, count + 1])
      expect(textOf({ book: 43, chapter: 3, first: 0, last }), `0-${last}`).toEqual({
        reference: '',
        verses: [],
      });
  });
});

describe('the shipped corpus', () => {
  it('is the current app’s deriver’s, written only when its text changes', () => {
    writeKjv();
    const written = statSync(KJV_FILE).mtimeMs;
    expect(writeKjv()).toBe(false);
    expect(statSync(KJV_FILE).mtimeMs).toBe(written);
    expect(readFileSync(KJV_FILE, 'utf8') === JSON.stringify(CHAPTERS)).toBe(true);
  });
});

describe('decode on use', () => {
  it('splits no chapter at import, and one read splits only the chapter it asks for', async () => {
    const before = chaptersRead.length;
    const again = './text.ts?fresh';
    const fresh: typeof Text = await import(again);
    expect(chaptersRead.length).toBe(before);
    fresh.textVerses(43, 3);
    expect(chaptersRead.slice(before)).toEqual([KEYS.indexOf('43:3')]);
  });
});
