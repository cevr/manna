/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test in an Exact app's folder imports no effect (docs/exact.md: Exact's type check would stage its declarations), so it branches plainly, and a sub-book's index is made on its first query. */

import { describe, expect, test } from 'bun:test';

import { find, hymnIndex, indexOf } from '@manna/hymnal-app/hymns/search';
import { plainRowsOf } from '@manna/hymnal-app/reader/rows';

import { type Book, book } from '../hymns/book.ts';
import { below, pick, query, type Random, seeded } from '../test/random.ts';
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

/** Words from a line of a hymn's words, as a reader recalls one: a few of them, from a place in it, now and then mistyped. */
const lineQuery = (random: Random): string => {
  const hymn = pick(random, book.hymns);
  const lines = hymn.sections.flatMap((section) => section.lines);
  if (lines.length === 0) return hymn.title;
  const words = pick(random, lines).split(/\s+/).filter(Boolean);
  const from = below(random, Math.max(1, words.length));
  const taken = words.slice(from, from + 2 + below(random, 4));
  return taken
    .map((word) =>
      below(random, 5) === 0
        ? `${word.slice(0, -1)}${word.at(-1) ?? ''}${word.at(-1) ?? ''}`
        : word,
    )
    .join(' ');
};

/** The rows as the current app's results draw them: `find`, then `plainRowsOf` over the found lines. */
const currentRows = (text: string) => {
  const found = find(hymnIndex(), text);
  const lines = new Map(
    found.flatMap((each) =>
      each.line._tag === 'Some' ? [[each.hymn.number, each.line.value] as const] : [],
    ),
  );
  return plainRowsOf(
    found.map((each) => each.hymn),
    undefined,
    lines,
  ).rows.flatMap((row) =>
    row.kind === 'hymn'
      ? [
          {
            number: row.hymn.number,
            title: row.hymn.title,
            line: row.line._tag === 'Some' ? row.line.value : '',
          },
        ]
      : [],
  );
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

  test('for generated queries, each row and its found line are the current app’s `plainRowsOf`’s', () => {
    const random = seeded(20261121);
    let lined = 0;
    for (let run = 0; run < 300; run++) {
      const text = below(random, 2) === 0 ? lineQuery(random) : query(random, book.hymns);
      const rows = rowsOf(book, text).flatMap((section) => section.rows);
      const expected = text.trim() === '' ? rows : currentRows(text);
      lined += expected.filter((row) => row.line !== '').length;
      expect({ text, rows }).toEqual({ text, rows: expected });
    }
    expect(lined).toBeGreaterThan(50);
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
