/**
 * R8: what the generator writes and when it refuses. A small book in an
 * in-memory database (two lists of one title in one section, a section left
 * out, a section with no sub-heading, a long range, a past-chapter part, an
 * unlinked reference, a row of another book) is written to the exact text
 * below, one list per line, and twice to the same bytes. A contents
 * snapshot with a repeated or fractional para, a database with no row of
 * the book, and a left-out title the contents lack are refused. The
 * committed `data/handbook.json` is the writer's own text of what it holds,
 * and its totals are the line the CLI prints.
 *
 * It catches a writer whose key order or line breaks change, a run that
 * differs from the one before, and a refusal lost.
 */

import { Database } from 'bun:sqlite';

import { BunServices } from '@effect/platform-bun';
import { getBibleBookByName } from '@manna/core/bible';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Schema } from 'effect';

import type { Lists, Node } from './lists';
import {
  type Chapters,
  contentsText,
  type Entry,
  generate,
  handbookText,
  readContents,
  rowsOf,
  totalsLine,
} from './source';

const SIZES: ReadonlyMap<string, number> = new Map([
  ['27.2', 49],
  ['23.9', 21],
  ['65.1', 25],
  ['45.3', 31],
  ['21.9', 18],
]);

const chapters: Chapters = {
  bookOf: (name) => Option.map(getBibleBookByName(name), (book) => Number(book.number)),
  count: (book, chapter) => SIZES.get(`${book}.${chapter}`) ?? 30,
};

const ENTRIES: readonly Entry[] = [
  { para: 10, level: 1, title: 'Prophecy' },
  { para: 12, level: 2, title: 'Second Chapter of Daniel' },
  { para: 20, level: 2, title: 'Second Chapter of Daniel' },
  { para: 30, level: 1, title: 'Dress' },
  { para: 40, level: 1, title: 'Nature of Man' },
];

const text = (value: string): Node => ({ _tag: 'Text', text: value });
const link = (title: string, shown: string): Node => ({
  _tag: 'ScriptureRef',
  title,
  children: [text(shown)],
});

const ROWS: readonly (readonly [
  book: number,
  paraId: string,
  type: string,
  nodes: readonly Node[],
])[] = [
  [978, '978.10', 'h2', [text('Prophecy')]],
  [
    978,
    '978.13',
    'p',
    [text('• '), link('Daniel 2:44', 'Daniel 2:44'), text(', '), link('Isaiah 9:6', '9:6, 7')],
  ],
  [
    978,
    '978.21',
    'p',
    [text('• '), link('Daniel 2:1', 'Daniel 2'), text('; '), link('Jude 1:21', 'Jude 21-23')],
  ],
  [
    978,
    '978.22',
    'p',
    [
      text('• '),
      link('Romans 3:20', '3:20, 77'),
      text('. A note, compare '),
      link('John 3:16', 'John 3:16'),
    ],
  ],
  [978, '978.31', 'p', [text('• '), link('Isaiah 3:16', 'Isaiah 3:16')]],
  [978, '978.41', 'p', [text('• Act 13:42-45 and a note.')]],
  [978, '978.42', 'p', [text('• '), link('Ecclesiastes 9:5', 'Ecclesiastes 9:5, 6')]],
  [1, '1.42', 'p', [text('• '), link('Genesis 1:1', 'Genesis 1:1')]],
];

/* oxlint-disable effect/noGlobals -- the fixture's rows are stored as the corpus stores them, JSON text. */
const databaseOf = (rows: typeof ROWS) => {
  const db = new Database(':memory:');
  db.run(
    'create table paragraphs (book_id integer, para_id text, element_type text, nodes_json text, puborder integer)',
  );
  rows.forEach(([book, paraId, type, nodes], at) =>
    db.run('insert into paragraphs values (?, ?, ?, ?, ?)', [
      book,
      paraId,
      type,
      JSON.stringify(nodes),
      at,
    ]),
  );
  return db;
};
/* oxlint-enable effect/noGlobals */

const EXPECTED = [
  '{',
  '"source":{"title":"Bible Handbook","author":"Stephen N. Haskell","year":1919,"code":"BHB","contents":"https://text.egwwritings.org/book/b978"},',
  '"sections":[',
  '{"id":"bhb-10","title":"Prophecy","lists":[',
  '{"id":"bhb-12","title":"Second Chapter of Daniel","ranges":[[27,2,44,44],[23,9,6,6],[23,9,7,7]]},',
  '{"id":"bhb-20","title":"Second Chapter of Daniel","ranges":[[65,1,21,23],[45,3,20,20]]}',
  ']},',
  '{"id":"bhb-40","title":"Nature of Man","lists":[',
  '{"id":"bhb-40","title":"Nature of Man","ranges":[[21,9,5,5],[21,9,6,6]]}',
  ']}',
  '],',
  '"skipped":[',
  '{"para":"978.21","ref":"Daniel 2","title":"Daniel 2:1","reason":"long"},',
  '{"para":"978.22","ref":"3:20, 77","title":"Romans 3:20","reason":"past-chapter"},',
  '{"para":"978.41","ref":"Act 13:42-45","reason":"unlinked"}',
  ']',
  '}',
  '',
].join('\n');

const Committed = Schema.fromJsonString(
  Schema.Struct({
    source: Schema.Unknown,
    sections: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        title: Schema.String,
        lists: Schema.Array(
          Schema.Struct({
            id: Schema.String,
            title: Schema.String,
            ranges: Schema.Array(
              Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
            ),
          }),
        ),
      }),
    ),
    skipped: Schema.Array(
      Schema.Struct({
        para: Schema.String,
        ref: Schema.String,
        title: Schema.optionalKey(Schema.String),
        reason: Schema.Literals(['unread', 'past-chapter', 'long', 'unlinked']),
      }),
    ),
  }),
);

const dataAt = (name: string) => new URL(`../../data/${name}`, import.meta.url).pathname;

describe('the writer', () => {
  it.effect(
    'writes the small book to its exact text, one list per line, the same bytes twice',
    () =>
      Effect.gen(function* () {
        const first = handbookText(yield* generate(databaseOf(ROWS), ENTRIES, ['Dress'], chapters));
        const second = handbookText(
          yield* generate(databaseOf(ROWS), ENTRIES, ['Dress'], chapters),
        );
        expect(first).toBe(EXPECTED);
        expect(second).toBe(first);
      }),
  );

  it.effect('reads only the book’s rows that carry a paragraph id', () =>
    Effect.gen(function* () {
      const rows = yield* rowsOf(
        databaseOf([...ROWS, [978, '', 'p', [text('• '), link('Joel 2:28', 'Joel 2:28')]]]),
      );
      expect(rows.map((row) => row.para)).toEqual([10, 13, 21, 22, 31, 41, 42]);
    }),
  );

  it.effect('counts sections, lists, ranges, distinct verses and skipped records', () =>
    Effect.sync(() => {
      const lists: Lists = {
        sections: [
          {
            id: 'bhb-1',
            title: 'A',
            lists: [
              { id: 'bhb-1', title: 'A', ranges: [[1, 1, 1, 3]] },
              {
                id: 'bhb-2',
                title: 'B',
                ranges: [
                  [1, 1, 2, 2],
                  [2, 1, 1, 1],
                ],
              },
            ],
          },
        ],
        skipped: [{ para: '978.1', ref: 'x', reason: 'unread' }],
      };
      expect(totalsLine(lists)).toBe('handbook sections=1 lists=2 ranges=3 verses=4 skipped=1');
    }),
  );
});

describe('the refusals', () => {
  it.effect('refuses a contents snapshot with a repeated or fractional para', () =>
    Effect.gen(function* () {
      expect(yield* readContents(contentsText(ENTRIES))).toEqual(ENTRIES);
      const repeated = yield* Effect.flip(
        readContents(contentsText([...ENTRIES, { para: 20, level: 2, title: 'Again' }])),
      );
      expect(repeated.reason).toContain('para 20 is repeated');
      const fractional = yield* Effect.flip(
        readContents(contentsText([...ENTRIES, { para: 41.5, level: 2, title: 'Half' }])),
      );
      expect(fractional.reason).toContain('para 41.5 is not a whole number');
    }),
  );

  it.effect('refuses a database with no row of the book', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        generate(databaseOf(ROWS.filter(([book]) => book !== 978)), ENTRIES, ['Dress'], chapters),
      );
      expect(failed._tag).toBe('HandbookRefused');
      expect(failed.reason).toContain('no row of book 978');
    }),
  );

  it.effect('refuses a left-out title the contents do not hold', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        generate(databaseOf(ROWS), ENTRIES, ['Dress', 'Dress Reform'], chapters),
      );
      expect(failed.reason).toContain('Dress Reform');
    }),
  );
});

describe('the committed files', () => {
  it.effect(
    'data/handbook.json is the writer’s text of what it holds, its totals the CLI’s line',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const written = yield* fs.readFileString(dataAt('handbook.json'));
        const held = yield* Schema.decodeEffect(Committed)(written);
        expect(handbookText(held)).toBe(written);
        expect(totalsLine(held)).toBe(
          'handbook sections=25 lists=131 ranges=2529 verses=3542 skipped=15',
        );
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('the contents snapshot reads without a fault', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const entries = yield* readContents(
        yield* fs.readFileString(dataAt('handbook-contents.json')),
      );
      expect(entries.length).toBe(211);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
