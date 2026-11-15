/* oxlint-disable effect/noGlobals -- a Bun test in an Exact app's folder imports no effect (docs/exact.md: Exact's type check would stage its declarations, and so its Schema JSON codecs), and the sizes it holds are the JSON bytes the build ships. */

import { describe, expect, test } from 'bun:test';

import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { indexOf } from '@manna/hymnal-app/hymns/search';
import { readWords } from '@manna/hymnal-app/vite/words';

import { book } from './hymns/book.ts';
import { sources } from './sources.ts';
import { below, pick, query, seeded } from './test/random.ts';

/** A route's hymn number as a reader or a stale link writes it. */
const route = (random: () => number): string =>
  pick(random, [
    `${1 + below(random, 695)}`,
    '0',
    '696',
    '007',
    '-1',
    '1.5',
    '',
    'abc',
    `${below(random, 100000)}`,
  ]);

describe('the data module runs where Exact runs it', () => {
  test('inside the data host, every source answers generated arguments without throwing', () => {
    const random = seeded(41);
    withDataHost(() => {
      indexOf(book.hymns);
      for (let run = 0; run < 200; run++) {
        expect(() => sources.hymnRows([query(random, book.hymns)])).not.toThrow();
        expect(() => sources.hymnPage([route(random)])).not.toThrow();
      }
    });
    expect(Object.keys(sources).toSorted()).toEqual(['hymnPage', 'hymnRows']);
  });
});

describe('size', () => {
  test('the words ship once, under 1 MB', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(readWords())).length;
    expect(bytes).toBeLessThan(1_000_000);
  });

  test('the list’s answer holds numbers, titles and sections, never a stanza’s words', () => {
    const answer = sources.hymnRows(['']);
    for (const section of answer) {
      expect(Object.keys(section).toSorted()).toEqual(['name', 'rows', 'slug']);
      for (const row of section.rows)
        expect(Object.keys(row).toSorted()).toEqual(['number', 'title']);
    }
    expect(new TextEncoder().encode(JSON.stringify(answer)).length).toBeLessThan(40_000);
  });
});
