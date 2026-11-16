/**
 * A made-up corpus for the commentary pack's tests: two commentary volumes
 * and one other book, their paragraphs and their links, each read counted.
 */

import { Effect, Layer, Option } from 'effect';

import { EGWParagraphDatabase } from '@manna/core/egw-db';

import type { CommentaryPack } from './api.js';

type Config = NonNullable<Parameters<typeof EGWParagraphDatabase.Test>[0]>;

const book = (bookId: number, code: string) => ({
  book_id: bookId,
  book_code: code,
  book_title: `Made-up ${code}`,
  book_author: 'Made-up author',
  paragraph_count: 3,
  created_at: '2026-01-01',
});

const paragraph = (bookCode: string, puborder: number, text: string) => ({
  bookCode,
  para_id: Option.some(`${bookCode}.${String(puborder)}`),
  refcode_short: Option.some(`${bookCode} ${String(puborder)}.1`),
  nodes: [{ _tag: 'Text' as const, text }],
  puborder,
});

/** A link row; a verse of none links the whole chapter. */
const link = (
  bookId: number,
  refCode: string,
  bible: readonly [number, number, Option.Option<number>],
) => ({
  para_book_id: bookId,
  para_ref_code: refCode,
  bible_book: bible[0],
  bible_chapter: bible[1],
  bible_verse: Option.getOrNull(bible[2]),
});

/** Two linked paragraphs of 5BC (one under two verses, one under a whole
 *  chapter), one of 1BC keyed by its paragraph id, an unlinked 5BC
 *  paragraph and a linked paragraph of a book outside the commentary. */
export const madeUpCorpus: Config = {
  books: [book(90, '1BC'), book(94, '5BC'), book(1, 'GC')],
  paragraphs: [
    paragraph('5BC', 2, 'second made-up note'),
    paragraph('5BC', 1, 'first made-up note'),
    paragraph('5BC', 3, 'unlinked'),
    paragraph('1BC', 7, 'early note'),
    paragraph('GC', 1, 'not commentary'),
  ],
  bibleRefs: [
    link(94, '5BC 1.1', [43, 1, Option.some(14)]),
    link(94, '5BC 1.1', [43, 1, Option.some(1)]),
    link(94, '5BC 2.1', [43, 1, Option.none()]),
    link(90, '1BC.7', [1, 1, Option.some(1)]),
    link(1, 'GC 1.1', [43, 1, Option.some(14)]),
  ],
};

/** The pack `madeUpCorpus` makes, by its notes and verses. */
export const madeUpPack: Pick<CommentaryPack, 'notes' | 'verses'> = {
  notes: [
    ['1BC 7.1', 'early note'],
    ['5BC 1.1', 'first made-up note'],
    ['5BC 2.1', 'second made-up note'],
  ],
  verses: {
    '1.1': [[1, [0]]],
    '43.1': [
      [0, [2]],
      [1, [1]],
      [14, [1]],
    ],
  },
};

/** `EGWParagraphDatabase.Test` over `config`, each read of the corpus
 *  counted in `reads`; `failing` makes the links unreadable. */
export const countedCorpus = (config: Config, options: { readonly failing?: boolean } = {}) => {
  const reads = { value: 0 };
  const layer = Layer.effect(
    EGWParagraphDatabase,
    Effect.map(EGWParagraphDatabase, (db) =>
      EGWParagraphDatabase.of({
        ...db,
        getBooksByCode: (code) => {
          reads.value += 1;
          return db.getBooksByCode(code);
        },
        getBibleRefsByBook: (bookId) => {
          reads.value += 1;
          if (options.failing === true) return Effect.die('made-up database failure');
          return db.getBibleRefsByBook(bookId);
        },
      }),
    ),
  ).pipe(Layer.provide(EGWParagraphDatabase.Test(config)));
  return { reads, layer };
};
