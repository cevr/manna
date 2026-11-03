/* oxlint-disable effect/noNodeBuiltinImport -- build tooling, not portable runtime core: this suite creates real SQLite files in a temp directory to drive `bun:sqlite`'s own failures, which is the whole point of it. */

import { EGW_SCOPE_AUTHORS } from '@manna/core/writings';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { Effect, Option } from 'effect';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readVectorSource, VectorSourceError } from './source.js';

const inWorkspace = <A>(body: (workspace: string) => A): A =>
  Effect.runSync(
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(path.join(tmpdir(), 'bible-vector-source-'))),
      (workspace) => Effect.sync(() => body(workspace)),
      (workspace) => Effect.sync(() => rmSync(workspace, { recursive: true, force: true })),
    ),
  );

const AUTHOR = EGW_SCOPE_AUTHORS[0] ?? 'Ellen Gould White';

const makeDatabase = (
  workspace: string,
  input: {
    readonly name: string;
    readonly rows?: readonly {
      readonly bookCode: string;
      readonly paraId: Option.Option<string>;
      readonly refcodeShort: Option.Option<string>;
      readonly text: string;
    }[];
    readonly paraIdType?: string;
  },
): string => {
  const filename = path.join(workspace, input.name);
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE books (book_id INTEGER PRIMARY KEY, book_code TEXT NOT NULL, book_author TEXT NOT NULL);
    CREATE TABLE paragraphs (
      book_id INTEGER NOT NULL,
      ref_code TEXT NOT NULL,
      para_id ${input.paraIdType ?? 'TEXT'},
      refcode_short TEXT,
      content_text TEXT NOT NULL,
      puborder INTEGER NOT NULL
    );
  `);
  const book = database.prepare(
    'INSERT INTO books (book_id, book_code, book_author) VALUES (?,?,?)',
  );
  const paragraph = database.prepare(
    'INSERT INTO paragraphs (book_id, ref_code, para_id, refcode_short, content_text, puborder) VALUES (?,?,?,?,?,?)',
  );
  const codes = new Map<string, number>();
  (input.rows ?? []).forEach((row, order) => {
    if (!codes.has(row.bookCode)) {
      const id = codes.size + 1;
      codes.set(row.bookCode, id);
      book.run(id, row.bookCode, AUTHOR);
    }
    paragraph.run(
      codes.get(row.bookCode) ?? 1,
      `${row.bookCode} ${String(order)}`,
      Option.getOrNull(row.paraId),
      Option.getOrNull(row.refcodeShort),
      row.text,
      order,
    );
  });
  database.close();
  return filename;
};

const run = (filename: string, limit = Option.none<number>()) =>
  Effect.runSync(Effect.result(readVectorSource({ filename, limit })));

describe('readVectorSource — failures reach the error channel (F15)', () => {
  it('fails rather than reporting an empty corpus when the file cannot be opened', () =>
    inWorkspace((workspace) => {
      const outcome = run(path.join(workspace, 'does-not-exist.db'));

      expect(outcome._tag).toBe('Failure');
      if (outcome._tag !== 'Failure') return;
      expect(outcome.failure).toBeInstanceOf(VectorSourceError);
      expect(outcome.failure.message).toContain('cannot open');
    }));

  it('fails when the query cannot run against the schema', () =>
    inWorkspace((workspace) => {
      const filename = path.join(workspace, 'no-tables.db');
      new Database(filename).close();

      const outcome = run(filename);

      expect(outcome._tag).toBe('Failure');
      if (outcome._tag !== 'Failure') return;
      expect(outcome.failure).toBeInstanceOf(VectorSourceError);
      expect(outcome.failure.message).toContain('query failed');
    }));

  it('fails when a column holds a type the decoder rejects', () =>
    inWorkspace((workspace) => {
      const filename = makeDatabase(workspace, {
        name: 'bad-schema.db',
        paraIdType: 'INTEGER',
        rows: [
          {
            bookCode: 'GC',
            paraId: Option.none(),
            refcodeShort: Option.some('GC 425.1'),
            text: 'the sanctuary',
          },
        ],
      });
      const database = new Database(filename);
      database
        .prepare(
          'INSERT INTO paragraphs (book_id, ref_code, para_id, refcode_short, content_text, puborder) VALUES (1, ?, 12345, ?, ?, 99)',
        )
        .run('GC 1', 'GC 1.1', 'a paragraph');
      database.close();

      const outcome = run(filename);

      expect(outcome._tag).toBe('Failure');
      if (outcome._tag !== 'Failure') return;
      expect(outcome.failure.message).toContain('unexpected paragraphs schema');
    }));
});

describe('readVectorSource — the handle is released on every exit (F15)', () => {
  const countingCloses = (filename: string) =>
    Effect.runSync(
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const original = Database.prototype.close;
          const counter = { closes: 0, original };
          Database.prototype.close = function patched(
            this: Database,
            ...args: Parameters<typeof original>
          ) {
            counter.closes += 1;
            return original.apply(this, args);
          };
          return counter;
        }),
        (counter) => Effect.sync(() => ({ outcome: run(filename), closes: counter.closes })),
        (counter) =>
          Effect.sync(() => {
            Database.prototype.close = counter.original;
          }),
      ),
    );

  it('releases the database after a successful read', () =>
    inWorkspace((workspace) => {
      const filename = makeDatabase(workspace, {
        name: 'success.db',
        rows: [
          {
            bookCode: 'GC',
            paraId: Option.some('14879.1'),
            refcodeShort: Option.some('GC 425.1'),
            text: 'the sanctuary',
          },
        ],
      });

      const probe = countingCloses(filename);

      expect(probe.outcome._tag).toBe('Success');
      expect(probe.closes).toBe(1);
    }));

  it('releases the database when the decode fails', () =>
    inWorkspace((workspace) => {
      const filename = makeDatabase(workspace, {
        name: 'release-on-failure.db',
        paraIdType: 'INTEGER',
      });
      const database = new Database(filename);
      database.exec(
        `INSERT INTO books (book_id, book_code, book_author) VALUES (1, 'GC', '${AUTHOR}')`,
      );
      database
        .prepare(
          'INSERT INTO paragraphs (book_id, ref_code, para_id, refcode_short, content_text, puborder) VALUES (1, ?, 42, ?, ?, 0)',
        )
        .run('GC 1', 'GC 1.1', 'a paragraph');
      database.close();

      const probe = countingCloses(filename);

      expect(probe.outcome._tag).toBe('Failure');
      expect(probe.closes).toBe(1);
    }));

  it('releases the database when the query fails', () =>
    inWorkspace((workspace) => {
      const filename = path.join(workspace, 'release-on-query-failure.db');
      new Database(filename).close();

      const probe = countingCloses(filename);

      expect(probe.outcome._tag).toBe('Failure');
      expect(probe.closes).toBe(1);
    }));
});

describe('readVectorSource — which rows become vectors (F15)', () => {
  it('drops rows with no identity and no text, and keeps the rest', () =>
    inWorkspace((workspace) => {
      const filename = makeDatabase(workspace, {
        name: 'filtering.db',
        rows: [
          {
            bookCode: 'GC',
            paraId: Option.some('1.1'),
            refcodeShort: Option.some('GC 425.1'),
            text: 'the sanctuary',
          },
          {
            bookCode: 'GC',
            paraId: Option.none(),
            refcodeShort: Option.some('GC 425.2'),
            text: 'no identity',
          },
          {
            bookCode: 'GC',
            paraId: Option.some('1.3'),
            refcodeShort: Option.some('GC 425.3'),
            text: '   ',
          },
          {
            bookCode: 'DA',
            paraId: Option.some('2.1'),
            refcodeShort: Option.none(),
            text: 'falls back to ref_code',
          },
        ],
      });

      const outcome = run(filename);

      expect(outcome._tag).toBe('Success');
      if (outcome._tag !== 'Success') return;
      expect(outcome.success.map((row) => row.paraId)).toEqual(['2.1', '1.1']);
      expect(outcome.success[0]?.refcode).toBe('DA 3');
    }));

  it('honours --limit, which is what keeps a test off the full corpus', () =>
    inWorkspace((workspace) => {
      const filename = makeDatabase(workspace, {
        name: 'limited.db',
        rows: Array.from({ length: 5 }, (_value, index) => ({
          bookCode: 'GC',
          paraId: Option.some(`1.${String(index)}`),
          refcodeShort: Option.some(`GC 425.${String(index)}`),
          text: 'the sanctuary',
        })),
      });

      const outcome = run(filename, Option.some(2));

      expect(outcome._tag).toBe('Success');
      if (outcome._tag !== 'Success') return;
      expect(outcome.success.length).toBe(2);
    }));
});
