/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test in an Exact app's folder imports no effect (docs/exact.md: Exact's type check would stage its declarations), so it branches plainly, and a sub-book's index is made on its first query. */

import { describe, expect, test } from 'bun:test';

import { find, hymnIndex, indexOf } from '@manna/hymnal-app/hymns/search';

import { type Book, book } from '../hymns/book.ts';
import { below, query, seeded } from '../test/random.ts';
import { type RowSection, rowsOf, slugOf } from './rows.ts';

const numbers = (sections: ReadonlyArray<RowSection>) =>
  sections.flatMap((section) => section.rows.map((row) => row.number));

/** The rule for a list with no query: every hymn once in number order, each under its own topic, no section empty. */
const expectSections = (sub: Book, sections: ReadonlyArray<RowSection>) => {
  expect(numbers(sections)).toEqual(sub.hymns.map((hymn) => hymn.number));
  const topic = new Map(sub.hymns.map((hymn) => [hymn.number, hymn.topic]));
  for (const section of sections) {
    expect(section.rows.length).toBeGreaterThan(0);
    expect(section.name).not.toBe('');
    expect(section.slug).toBe(slugOf(section.name));
    for (const row of section.rows) expect(topic.get(row.number)).toBe(section.name);
  }
  expect(new Set(sections.map((section) => section.slug)).size).toBe(sections.length);
};

/** The rule for a list with a query: the search's hymns in its order, under no header; nothing at all when it finds none. */
const expectFound = (sub: Book, text: string, sections: ReadonlyArray<RowSection>) => {
  const found = find(sub.index(), text).map((each) => each.hymn.number);
  expect(numbers(sections)).toEqual(found);
  expect(sections.length).toBe(found.length === 0 ? 0 : 1);
  for (const section of sections)
    expect({ slug: section.slug, name: section.name }).toEqual({ slug: 'found', name: '' });
};

describe('search is the current app’s, over its whole domain', () => {
  test('for generated queries, the list’s numbers are `find(hymnIndex(), query)`’s, in order', () => {
    const random = seeded(20261114);
    for (let run = 0; run < 400; run++) {
      const text = query(random, book.hymns);
      const expected = find(hymnIndex(), text).map((found) => found.hymn.number);
      expect({ text, numbers: numbers(rowsOf(book, text)) }).toEqual({ text, numbers: expected });
    }
  });
});

describe('the list’s rows, as a rule', () => {
  test('over the whole book and generated queries', () => {
    expectSections(book, rowsOf(book, ''));
    const random = seeded(7);
    for (let run = 0; run < 200; run++) {
      const text = query(random, book.hymns);
      if (text.trim() === '') expectSections(book, rowsOf(book, text));
      else expectFound(book, text, rowsOf(book, text));
    }
  });

  test('over generated sub-books and generated queries', () => {
    const random = seeded(1885);
    for (let run = 0; run < 12; run++) {
      const keep = 0.02 + random() * 0.3;
      const hymns = book.hymns.filter(() => random() < keep);
      let index: ReturnType<typeof indexOf> | undefined;
      const sub: Book = { hymns, index: () => (index ??= indexOf(hymns)) };
      expectSections(sub, rowsOf(sub, ' '.repeat(below(random, 3))));
      for (let asked = 0; asked < 10; asked++) {
        const text = query(random, book.hymns);
        if (text.trim() === '') expectSections(sub, rowsOf(sub, text));
        else expectFound(sub, text, rowsOf(sub, text));
      }
    }
  });

  test('a list with no query asks for no search index', () => {
    const asked: Array<string> = [];
    const watched: Book = {
      hymns: book.hymns,
      index: () => {
        asked.push('index');
        return book.index();
      },
    };
    rowsOf(watched, '');
    rowsOf(watched, '   ');
    expect(asked).toEqual([]);
  });
});
