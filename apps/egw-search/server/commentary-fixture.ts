/**
 * A made-up corpus for the commentary pack's tests: two commentary volumes
 * and one other book, their paragraphs and the citations in them, each read
 * counted.
 */

import { Effect, Layer, Option, Stream } from 'effect';

import type { Schemas } from '@manna/core/egw';
import { EGWParagraphDatabase } from '@manna/core/egw-db';

import type { CommentaryPack } from './api.js';

type Config = NonNullable<Parameters<typeof EGWParagraphDatabase.Test>[0]>;
type Node = Schemas.Paragraph['nodes'][number];

const book = (bookId: number, code: string) => ({
  book_id: bookId,
  book_code: code,
  book_title: `Made-up ${code}`,
  book_author: 'Made-up author',
  paragraph_count: 3,
  created_at: '2026-01-01',
});

/** A citation as the library prints it: `title` names its first verse,
 *  `text` is what the page shows. */
export const cite = (title: string, text: string): Node => ({
  _tag: 'ScriptureRef',
  title,
  dataLink: '1965.1',
  children: [{ _tag: 'Text', text }],
});

const paragraph = (bookCode: string, puborder: number, text: string, cites: readonly Node[]) => ({
  bookCode,
  para_id: Option.some(`${bookCode}.${String(puborder)}`),
  refcode_short: Option.some(`${bookCode} ${String(puborder)}.1`),
  nodes: [{ _tag: 'Text' as const, text }, ...cites],
  puborder,
});

/** Two cited paragraphs of 5BC (one naming two verses, one a whole chapter),
 *  one of 1BC, an uncited 5BC paragraph and a cited paragraph of a book
 *  outside the commentary, listed out of publication order. */
export const madeUpCorpus: Config = {
  books: [book(90, '1BC'), book(94, '5BC'), book(1, 'GC')],
  paragraphs: [
    paragraph('5BC', 2, 'second made-up note', [cite('John 1:1', 'John 1')]),
    paragraph('5BC', 1, 'first made-up note', [cite('John 1:1', 'John 1:1, 14')]),
    paragraph('5BC', 3, 'unlinked', []),
    paragraph('1BC', 7, 'early note', [cite('Genesis 1:1', 'Genesis 1:1')]),
    paragraph('GC', 1, 'not commentary', [cite('John 1:14', 'John 1:14')]),
  ],
};

/** The pack `madeUpCorpus` makes, by its notes and verses. */
export const madeUpPack: Pick<CommentaryPack, 'notes' | 'verses'> = {
  notes: [
    ['1BC 7.1', 'early noteGenesis 1:1'],
    ['5BC 1.1', 'first made-up noteJohn 1:1, 14'],
    ['5BC 2.1', 'second made-up noteJohn 1'],
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
 *  counted in `reads`; `failing` makes the paragraphs unreadable. */
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
        getParagraphsByBook: (bookId) => {
          reads.value += 1;
          if (options.failing === true) return Stream.die('made-up database failure');
          return db.getParagraphsByBook(bookId);
        },
      }),
    ),
  ).pipe(Layer.provide(EGWParagraphDatabase.Test(config)));
  return { reads, layer };
};
