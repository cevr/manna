import { Database } from 'bun:sqlite';
import { Config, Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import {
  sourceDefinition,
  normalizeHeadword,
  WEBSTER_SOURCE,
  WEBSTER_SCHEMA_VERSION,
  WEBSTER_PROJECTION_VERSION,
} from '@manna/core/webster';

import { parseCsv, WebsterCompileError } from './csv.js';

const ManifestJson = Schema.fromJsonString(
  Schema.Struct({
    path: Schema.String,
    size: Schema.Int,
    sha256: Schema.String,
    records: Schema.Int,
    keys: Schema.Int,
    sourceSha256: Schema.String,
  }),
);

export const compileWebster = Effect.fn('WebsterCompiler.compile')(function* (input: {
  readonly csv: Uint8Array;
  readonly destination: string;
  readonly expectedDigest?: string;
  readonly expectedRecords?: number;
  readonly expectedKeys?: number;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  const destination = path.resolve(input.destination);
  const ownerData = path.join(home, '.bible');
  if (destination === ownerData || destination.startsWith(ownerData + path.sep))
    return yield* WebsterCompileError.make({
      message: 'Build output must not be inside the owner runtime .bible directory',
    });
  const digest = new Bun.CryptoHasher('sha256').update(input.csv).digest('hex');
  if (
    Option.exists(Option.fromUndefinedOr(input.expectedDigest), (expected) => digest !== expected)
  )
    return yield* WebsterCompileError.make({ message: 'Source SHA-256 mismatch' });
  const text = yield* Effect.try({
    try: () => new TextDecoder('utf-8', { fatal: true }).decode(input.csv),
    catch: (cause) => WebsterCompileError.make({ message: 'Invalid source UTF-8', cause }),
  });
  const records = yield* parseCsv(text);
  const entries: { id: number; headword: string; key: string; html: string; definition: string }[] =
    [];
  for (const [offset, fields] of records.entries()) {
    const [headword, html] = fields;
    if (
      fields.length !== 2 ||
      Predicate.isUndefined(headword) ||
      Predicate.isUndefined(html) ||
      !normalizeHeadword(headword) ||
      !html.trim()
    )
      return yield* WebsterCompileError.make({
        message: `Expected nonempty two-column CSV record ${offset + 1}`,
      });
    const definition = sourceDefinition(headword, html);
    if (!definition)
      return yield* WebsterCompileError.make({
        message: `Empty plaintext at record ${offset + 1}`,
      });
    entries.push({ id: offset + 1, headword, key: normalizeHeadword(headword), html, definition });
  }
  if (
    digest === WEBSTER_SOURCE.sha256 &&
    (entries.length !== WEBSTER_SOURCE.records ||
      new Set(entries.map((entry) => entry.key)).size !== WEBSTER_SOURCE.keys)
  )
    return yield* WebsterCompileError.make({
      message: 'Pinned source record or distinct-key count mismatch',
    });
  yield* fs.makeDirectory(path.dirname(input.destination), { recursive: true });
  const temp = yield* fs.makeTempDirectoryScoped({
    directory: path.dirname(input.destination),
    prefix: '.webster-build-',
  });
  const candidate = path.join(temp, 'webster.db');
  yield* Effect.acquireUseRelease(
    Effect.try({
      try: () => new Database(candidate),
      catch: (cause) =>
        WebsterCompileError.make({ message: 'Cannot create build candidate', cause }),
    }),
    (db) =>
      Effect.try({
        try: () => {
          db.exec(
            `PRAGMA journal_mode=DELETE; CREATE TABLE entries(id INTEGER PRIMARY KEY, headword TEXT NOT NULL, key TEXT NOT NULL, source_html TEXT NOT NULL, definition TEXT NOT NULL); CREATE INDEX entries_key ON entries(key); CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE VIRTUAL TABLE entries_fts USING fts5(headword, definition, content='entries', content_rowid='id');`,
          );
          db.transaction(() => {
            const insert = db.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?)');
            for (const entry of entries)
              insert.run(entry.id, entry.headword, entry.key, entry.html, entry.definition);
            const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
            for (const [key, value] of Object.entries({
              schema_version: WEBSTER_SCHEMA_VERSION,
              projection_version: WEBSTER_PROJECTION_VERSION,
              edition: WEBSTER_SOURCE.edition,
              source_url: WEBSTER_SOURCE.url,
              source_revision: WEBSTER_SOURCE.revision,
              source_sha256: digest,
              licence: WEBSTER_SOURCE.licence,
              source_records: String(entries.length),
              notice: WEBSTER_SOURCE.notice,
            }))
              meta.run(key, value);
            db.exec(
              "INSERT INTO entries_fts(entries_fts) VALUES ('rebuild'); INSERT INTO entries_fts(entries_fts, rank) VALUES ('integrity-check', 1);",
            );
          })();
          return {
            integrity: db.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()
              ?.integrity_check,
            census: db
              .query<{ records: number; keys: number }, []>(
                'SELECT count(*) AS records, count(DISTINCT key) AS keys FROM entries',
              )
              .get(),
          };
        },
        catch: (cause) =>
          WebsterCompileError.make({ message: 'SQLite compilation or verification failed', cause }),
      }),
    (db) => Effect.sync(() => db.close()),
  ).pipe(
    Effect.flatMap((verified) => {
      if (verified.integrity !== 'ok')
        return Effect.fail(WebsterCompileError.make({ message: 'Output integrity check failed' }));
      const expectedRecords = input.expectedRecords ?? entries.length;
      const expectedKeys = input.expectedKeys ?? new Set(entries.map((entry) => entry.key)).size;
      if (verified.census?.records !== expectedRecords || verified.census?.keys !== expectedKeys)
        return Effect.fail(
          WebsterCompileError.make({ message: 'Output record or distinct-key census mismatch' }),
        );
      return Effect.void;
    }),
  );
  const bytes = yield* fs.readFile(candidate);
  const manifest = {
    path: input.destination,
    size: bytes.length,
    sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    records: entries.length,
    keys: new Set(entries.map((entry) => entry.key)).size,
    sourceSha256: digest,
  };
  const manifestPath = input.destination.replace(/\.db$/u, '') + '.manifest.json';
  const encoded = yield* Schema.encodeEffect(ManifestJson)(manifest);
  yield* fs.writeFileString(path.join(temp, 'manifest.json'), encoded);
  yield* fs.rename(candidate, input.destination);
  yield* fs.rename(path.join(temp, 'manifest.json'), manifestPath);
  return manifest;
}, Effect.scoped);
