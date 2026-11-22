/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noTernary, effect/noNewError, effect/noGlobals, eslint/no-await-in-loop -- the guard reads the app's own files under Bun; a host's refusal is the Error it rejects with; a Bun test in an Exact app's folder imports no effect (docs/exact.md): it awaits the source's Promise, one search after another as a reader types them, over the current app's table module imported by its path. */

/**
 * The hymns about a search are the current app's: over generated queries,
 * the answer read from the table's shipped files, field by field, is
 * `aboutQuery`'s; the files are read once, at the first search, never
 * before; and a host that ships none answers no hymns about any query.
 */

import { describe, expect, test } from 'bun:test';
import { aboutQuery } from '@manna/hymnal-app/hymns/meaning';

import { book } from '../hymns/book.ts';
import { query, seeded } from '../test/random.ts';
import { MEANING_FIELDS, MEANING_ROOT } from './fields.ts';
import { aboutOver } from './table.ts';

const { meaning } = (await import(
  new URL('../../../hymnal/assets/meaning/meaning.js', import.meta.url).href
)) as { readonly meaning: () => Readonly<Record<string, string | number>> };
const shipped = meaning();

/** A host's read of the shipped files, counting each path it is asked for. */
const host = () => {
  const asked: Array<string> = [];
  const read = (path: string) => {
    asked.push(path);
    const field = path.slice(MEANING_ROOT.length + 1);
    const bytes = new TextEncoder().encode(String(shipped[field]));
    return Promise.resolve(bytes.buffer as ArrayBuffer);
  };
  return { asked, read };
};

/** Each source file of the app (not a test, a declaration or a generated file), by its path under `src/`. */
const sourceFiles = Array.from(
  new Bun.Glob('**/*.ts').scanSync({ cwd: new URL('../', import.meta.url).pathname }),
).filter((path) => !/\.(test|testing|d)\.ts$|\.gen\.ts$/u.test(path));

describe('the data module never bundles the table', () => {
  test('only the build’s prepare step reads the table’s module, and no source imports that step', async () => {
    const texts = await Promise.all(
      sourceFiles.map(async (path) => ({
        path,
        text: await Bun.file(new URL(`../${path}`, import.meta.url)).text(),
      })),
    );
    const readers = texts
      .filter(({ text }) => /['"][^'"\n]*assets\/meaning\//u.test(text))
      .map(({ path }) => path);
    expect(readers).toEqual(['results/meaning-files.ts']);
    const importers = texts
      .filter(({ text }) => /^import [^\n]*meaning-files\.ts'/mu.test(text))
      .map(({ path }) => path);
    expect(importers).toEqual(['hymns/make.ts']);
    const searchers = texts
      .filter(({ path, text }) => /^(results|list)\//u.test(path) && /hymns\/meaning'/u.test(text))
      .map(({ path }) => path);
    expect(searchers).toEqual([]);
  });
});

describe('the hymns about a search', () => {
  test('the shipped files are the current table’s every field the rule reads', () => {
    expect(MEANING_FIELDS.map(String).toSorted()).toEqual(
      Object.keys(shipped)
        .filter((key) => key !== 'source')
        .toSorted(),
    );
  });

  test('over generated queries, are the current app’s `aboutQuery`, each answer naming its query', async () => {
    const random = seeded(20261121);
    const { asked, read } = host();
    const about = aboutOver(read);
    const words = [
      'river',
      'peace',
      'jesus loves',
      'storm at sea',
      'no 100',
      'ab',
      'hymns about grace',
    ];
    const queries = [...words, ...Array.from({ length: 40 }, () => query(random, book.hymns))];
    let some = 0;
    for (const text of queries) {
      const answer = await about(text);
      const expected = text.trim() === '' ? [] : [...aboutQuery(text)];
      expect({ text, numbers: answer.numbers }).toEqual({ text, numbers: expected });
      expect(answer.query).toBe(text);
      if (answer.numbers.length > 0) some += 1;
    }
    expect(some).toBeGreaterThan(3);
    expect(asked).toEqual(MEANING_FIELDS.map((field) => `${MEANING_ROOT}/${field}`));
  });

  test('read nothing until a search asks, and an empty query asks nothing', async () => {
    const { asked, read } = host();
    const about = aboutOver(read);
    expect(asked).toEqual([]);
    expect(await about('  ')).toEqual({ query: '  ', numbers: [] });
    expect(asked).toEqual([]);
  });

  test('on a host that ships no table, are none for every query, the read tried once', async () => {
    let tries = 0;
    const about = aboutOver(() => {
      tries += 1;
      return Promise.reject(new Error('NotSupportedError'));
    });
    for (const text of ['river', 'peace', 'storm at sea'])
      expect(await about(text)).toEqual({ query: text, numbers: [] });
    expect(tries).toBe(1);
  });
});
