/** The semantic verifiers of the SQLite File Corpora, under Bun (§3.5).
 *
 *  What a candidate Bible or Topics database must hold before the lifecycle in
 *  `file-artifact.ts` will activate it. SQLite is opened through `bun:sqlite`;
 *  the Topics *rules* stay single-definition in core (`verifyTopicsArtifact` is
 *  imported, not restated), so only statement execution lives here.
 */

import { Database } from 'bun:sqlite';

import {
  verifyTopicsArtifact,
  type TopicsArtifactReader,
} from '../corpus-supply/topics-verifier.js';
import { Effect, Option, Schema } from 'effect';
import { checkWebsterSchema } from '../webster/schema-bun.js';
import { WEBSTER_SOURCE, normalizeHeadword, definitionText } from '../webster/source.js';

import {
  closeDatabase,
  countRows,
  integrityCheck,
  openDatabase,
  storeError,
} from './file-artifact.js';

/** The §3.5 Bible gate, asserting exactly what the native verifier asserts. */
export const verifyBibleDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) =>
      Effect.gen(function* () {
        const integrity = yield* integrityCheck(database);
        if (integrity !== 'ok') {
          return yield* Effect.fail(`SQLite integrity check failed: ${integrity}`);
        }
        const books = yield* countRows(database, 'books');
        if (books !== 66) {
          return yield* Effect.fail('Bible Artifact does not contain the 66-book Canon');
        }
        const verses = yield* countRows(database, 'verses', "WHERE version_code = 'KJV'");
        if (verses !== 31_102) {
          return yield* Effect.fail(`Bible Artifact contains ${String(verses)} KJV Verses`);
        }
        if ((yield* countRows(database, 'strongs')) === 0) {
          return yield* Effect.fail("Bible Artifact has no Strong's lexicon");
        }
        if ((yield* countRows(database, 'cross_refs', "WHERE source = 'openbible'")) === 0) {
          return yield* Effect.fail('Bible Artifact has no OpenBible Cross References');
        }
        if ((yield* countRows(database, 'cross_refs', "WHERE source = 'tske'")) === 0) {
          return yield* Effect.fail('Bible Artifact has no TSKe Cross References');
        }
        if ((yield* countRows(database, 'margin_notes')) === 0) {
          return yield* Effect.fail('Bible Artifact has no Margin Notes');
        }
        if ((yield* countRows(database, 'topics')) === 0) {
          return yield* Effect.fail('Bible Artifact has no Topics');
        }
        return verses;
      }),
    closeDatabase,
  );

/** The three reads `verifyTopicsArtifact` makes, over one open connection. */
const bunTopicsReader = (database: Database): TopicsArtifactReader => ({
  integrity: integrityCheck(database),
  meta: (key) =>
    Effect.try({
      try: () => database.query('SELECT value FROM meta WHERE key = ?').get(key),
      catch: storeError('read-meta'),
    }).pipe(
      Effect.flatMap((raw) =>
        Option.match(Option.fromNullishOr(raw), {
          onNone: () => Effect.succeedNone,
          onSome: (row) =>
            Schema.decodeUnknownEffect(Schema.Struct({ value: Schema.String }))(row).pipe(
              Effect.map((decoded) => Option.some(decoded.value)),
              Effect.mapError(storeError('read-meta')),
            ),
        }),
      ),
    ),
  count: (table) => countRows(database, table),
});

/** The Topics gate: open, apply the shared rules, close. */
export const verifyTopicsDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) => verifyTopicsArtifact(bunTopicsReader(database)),
    closeDatabase,
  );

export const verifyWebsterDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (db) =>
      Effect.gen(function* () {
        const meta = yield* checkWebsterSchema(db);
        const integrity = yield* integrityCheck(db);
        if (integrity !== 'ok') return yield* Effect.fail('Webster SQLite integrity check failed');
        for (const [key, expected] of Object.entries({
          source_url: WEBSTER_SOURCE.url,
          source_revision: WEBSTER_SOURCE.revision,
          source_sha256: WEBSTER_SOURCE.sha256,
          licence: WEBSTER_SOURCE.licence,
          source_records: String(WEBSTER_SOURCE.records),
          notice: WEBSTER_SOURCE.notice,
        })) {
          if (meta.get(key) !== expected)
            return yield* Effect.fail(`Webster metadata mismatch: ${key}`);
        }
        const count = yield* Effect.try({
          try: () => {
            const rows = db
              .query<
                {
                  id: number;
                  headword: string;
                  key: string;
                  source_html: string;
                  definition: string;
                },
                []
              >('SELECT id, headword, key, source_html, definition FROM entries ORDER BY id')
              .all();
            const valid =
              rows.length === WEBSTER_SOURCE.records &&
              new Set(rows.map((row) => row.key)).size === WEBSTER_SOURCE.keys &&
              rows.every(
                (row, index) =>
                  row.id === index + 1 &&
                  row.key === normalizeHeadword(row.headword) &&
                  row.source_html.trim().length > 0 &&
                  row.definition === definitionText(row.source_html),
              );
            const duplicates = db
              .query<{ key: string; n: number }, []>(
                'SELECT key, count(*) AS n FROM entries GROUP BY key HAVING count(*) > 1 ORDER BY key',
              )
              .all();
            const duplicateCounts =
              duplicates.length === 2 &&
              duplicates[0]?.key === 'anticonstitutional' &&
              duplicates[0]?.n === 2 &&
              duplicates[1]?.key === 'counter-revolution' &&
              duplicates[1]?.n === 3;
            const exact = db
              .query<{ n: number }, []>(
                "SELECT count(*) AS n FROM entries_fts JOIN entries e ON e.id = entries_fts.rowid WHERE entries_fts MATCH 'definition : disheartened' AND e.key = 'dismayed'",
              )
              .get();
            return valid && duplicateCounts && exact?.n === 1;
          },
          catch: storeError('verify-webster'),
        }).pipe(
          Effect.flatMap((valid) => {
            if (!valid)
              return Effect.fail(
                'Webster entry census, normalized keys or definition FTS is invalid',
              );
            return Effect.succeed(WEBSTER_SOURCE.records);
          }),
        );
        // FTS cross-content verification needs a writable connection. Its
        // isolated memory copy leaves candidate and active files read-only.
        yield* Effect.acquireUseRelease(
          Effect.try({
            try: () => Database.deserialize(db.serialize()),
            catch: storeError('copy-webster-fts'),
          }),
          (copy) =>
            Effect.try({
              try: () =>
                copy.exec(
                  "INSERT INTO entries_fts(entries_fts, rank) VALUES ('integrity-check', 1)",
                ),
              catch: storeError('verify-webster-fts'),
            }),
          closeDatabase,
        );
        return count;
      }),
    closeDatabase,
  );
