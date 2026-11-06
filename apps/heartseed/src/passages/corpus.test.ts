/* oxlint-disable effect/noGlobals, effect/noTernary -- the test runs the laziness probe as a child process and reads its one JSON line, and writes its expected values as plain branches. */

/**
 * The corpus as the app reads it (hskjv K1, K3): `versesOf` over the
 * bundled module, judged against the model's corpus built from the KJV's
 * own rows with the display rule written again (`test/passages-model.ts`).
 * Its seams: `versesOf` over every chapter, the chapter bounds of every
 * book, and the module's reads as a child process sees them through a
 * counting proxy (`test/kjv-lazy-rig.ts`).
 *
 * It catches a verse shown raw or with the rule applied twice, a chapter
 * index off by one at any book's edge, a chapter past a book's end read
 * from the next book, a fraction or a zero taken for a chapter, and a
 * reader that splits chapters at import or reads more than the chapter
 * asked for. It misses Hermes's own evaluation of the module on a phone.
 */

import { describe, expect, it } from 'bun:test';

import { readVerses } from '../../vite/passage';
import { versesOf } from '../kjv';
import { corpusOf, versesIn } from '../test/passages-model';

const ROWS = readVerses();
const CORPUS = corpusOf(ROWS);

/** Each book's first chapter's index in canon order, from the model's counts. */
const startOf = (book: number) =>
  CORPUS.books
    .filter((before) => before < book)
    .reduce((sum, before) => sum + (CORPUS.counts.get(before) ?? 0), 0);

describe('versesOf, over the whole KJV', () => {
  it('shows every verse of every chapter as the display rule does, in verse order', () => {
    const wrong = [...CORPUS.chapters].flatMap(([key, want]) => {
      const [book, chapter] = key.split(':').map(Number);
      const got = versesOf(Number(book), Number(chapter));
      return got.length === want.length && got.every((text, index) => text === want[index])
        ? []
        : [key];
    });
    const verses = [...CORPUS.chapters.values()].reduce((sum, list) => sum + list.length, 0);
    expect({ verses, chapters: CORPUS.chapters.size, books: CORPUS.books.length, wrong }).toEqual({
      verses: 31102,
      chapters: 1189,
      books: 66,
      wrong: [],
    });
    expect(
      ROWS.filter((row) => versesOf(row.book, row.chapter)[row.verse - 1] !== row.text).length,
    ).toBeGreaterThan(1000);
  });

  it('gives none for a chapter the canon does not have, at every book’s edges', () => {
    const asked = CORPUS.books.flatMap((book) => {
      const last = CORPUS.counts.get(book) ?? 0;
      return [0, 1, last, last + 1, 1.5, -1, Number.NaN].map((chapter) => [book, chapter] as const);
    });
    const outside = [0, 67, -1, 1.5, Number.NaN].map((book) => [book, 1] as const);
    const wrong = [...asked, ...outside].filter(
      ([book, chapter]) =>
        JSON.stringify(versesOf(book, chapter)) !== JSON.stringify(versesIn(CORPUS, book, chapter)),
    );
    expect(wrong).toEqual([]);
    expect(versesOf(1, 51)).toEqual([]);
    expect(versesOf(19, 151)).toEqual([]);
    expect(versesOf(66, 23)).toEqual([]);
    expect(versesOf(67, 1)).toEqual([]);
  });
});

describe('the corpus module, read lazily', () => {
  it('reads no chapter at import, and one chapter, its own, for each chapter shown', () => {
    const asked = [
      ...CORPUS.books.flatMap((book) => [`${book}:1`, `${book}:${CORPUS.counts.get(book)}`]),
      '43:15',
      '19:117',
      '19:119',
      '19:151',
      '0:1',
      '67:1',
      '1:0',
    ];
    const run = Bun.spawnSync(['bun', `${import.meta.dir}/../test/kjv-lazy-rig.ts`, ...asked], {
      cwd: `${import.meta.dir}/../..`,
    });
    const line = run.stdout
      .toString()
      .split('\n')
      .find((each) => each.startsWith('LAZY '));
    expect(line, run.stderr.toString()).toBeDefined();
    const facts: {
      atImport: number[];
      asked: { asked: string; verses: number; read: number[] }[];
    } = JSON.parse(String(line).slice('LAZY '.length));
    const want = asked.map((each) => {
      const [book, chapter] = each.split(':').map(Number) as [number, number];
      const verses = versesIn(CORPUS, book, chapter).length;
      return { asked: each, verses, read: verses === 0 ? [] : [startOf(book) + chapter - 1] };
    });
    expect(facts.atImport).toEqual([]);
    expect(facts.asked).toEqual(want);
  });
});
