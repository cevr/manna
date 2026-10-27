/** Real parser/handler receipts. Never attach child output or corpus values to assertions. */
import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Result, Schema, Stream } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { describe, expect, it } from 'effect-bun-test';

import { readSourceText, type SourceText } from '../../../hymnal/scripts/source-text.js';
import { ensureHymnal } from '../../src/commands/init.js';

const ARTIFACT = new URL('../../../core/data/hymnal.db', import.meta.url).pathname;
const MAIN = new URL('../../src/main.ts', import.meta.url).pathname;
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const ReturnedHymn = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  category: Schema.String,
  categoryId: Schema.Int,
  verses: Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String })),
});

class CliProofError extends Schema.TaggedError<CliProofError>()('CliProofError', {
  operation: Schema.String,
}) {}
const decodeHymn = (text: string) =>
  Schema.decodeEffect(Schema.fromJsonString(ReturnedHymn))(text).pipe(
    Effect.mapError(() => CliProofError.make({ operation: 'decode-hymn' })),
  );

const cli = Effect.fn('HymnsProof.cli')(function* (
  home: string,
  db: string,
  args: readonly string[],
) {
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make('bun', [MAIN, 'hymns', ...args], {
      env: { HOME: home, HYMNAL_DB_PATH: db },
      extendEnv: true,
      forceKillAfter: '5 seconds',
    }),
  );
  const [stdout, stderr, code] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(child.stdout)),
      Stream.mkString(Stream.decodeText(child.stderr)),
      child.exitCode,
    ],
    { concurrency: 3 },
  );
  return { stdout, stderr, code: Number(code) };
}, Effect.scoped);

const legacyFixture = (file: string, source: SourceText) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(file)),
    (db) =>
      Effect.sync(() => {
        db.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT);
      CREATE TABLE hymns(id INTEGER PRIMARY KEY,name TEXT,category_id INTEGER,category TEXT,verses TEXT,favorite INTEGER,views INTEGER);
      CREATE TABLE settings(key TEXT,value TEXT); INSERT INTO settings VALUES('fixture','retained');`);
        db.transaction(() => {
          for (const c of source.categories)
            db.query('INSERT INTO categories VALUES(?,?)').run(c.id, c.name);
          for (const h of source.hymns.filter((h) => [2, 696].includes(h.number)))
            db.query('INSERT INTO hymns VALUES(?,?,?,?,?,?,?)').run(
              h.number,
              h.title,
              h.categoryId,
              source.categories.find((c) => c.id === h.categoryId)?.name ?? '',
              json(h.verses),
              1,
              17,
            );
        })();
      }),
    (db) => Effect.sync(() => db.close()),
  );

const acquireHymnal = (
  file: string,
  refresh: boolean,
  client: Layer.Layer<HttpClient.HttpClient>,
) => ensureHymnal(file, refresh).pipe(Effect.provide(client));

describe('hymns CLI corpus contract', () => {
  it.effect(
    'returns complete verses for normalized and installed legacy databases without changing either file',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const source = yield* readSourceText();
        const normalized = `${dir}/normalized.db`,
          legacy = `${dir}/legacy.db`;
        yield* fs.copyFile(ARTIFACT, normalized);
        yield* legacyFixture(legacy, source);
        for (const file of [normalized, legacy]) {
          const before = yield* fs.readFile(file);
          for (const id of [2, 696]) {
            const result = yield* cli(dir, file, ['get', String(id), '--json']);
            expect(result.code, `${id}:cli:exit`).toBe(0);
            const hymn = yield* decodeHymn(result.stdout);
            const expected = source.hymns[id - 1];
            expect(
              hymn.id === id &&
                hymn.name === expected?.title &&
                json(hymn.verses) === json(expected?.verses),
              `${id}:cli:full-verses`,
            ).toBe(true);
          }
          const after = yield* fs.readFile(file);
          expect(
            before.length === after.length && before.every((value, i) => value === after[i]),
            'cli:read-only',
          ).toBe(true);
        }
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('preserves malformed and limited search plus the missing-ID JSON contract', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/normalized.db`;
      yield* fs.copyFile(ARTIFACT, file);
      const SearchResult = Schema.Struct({
        matches: Schema.Array(Schema.Struct({ id: Schema.Int, firstLine: Schema.String })),
      });
      for (const query of ['"', 'NEAR(', 'OR']) {
        const result = yield* cli(dir, file, ['search', query, '--limit', '2', '--json']);
        expect(result.code).toBe(0);
        const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(SearchResult))(
          result.stdout,
        ).pipe(Effect.mapError(() => CliProofError.make({ operation: 'decode-search' })));
        expect(decoded.matches.length <= 2).toBe(true);
        expect(
          decoded.matches.every((h, i) => i === 0 || h.id > (decoded.matches[i - 1]?.id ?? 0)),
        ).toBe(true);
      }
      const missing = yield* cli(dir, file, ['get', '921', '--json']);
      expect(missing.code).toBe(0);
      const decoded = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Struct({ id: Schema.Int, hymn: Schema.Null })),
      )(missing.stdout).pipe(
        Effect.mapError(() => CliProofError.make({ operation: 'decode-missing' })),
      );
      expect(decoded.id).toBe(921);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'acquires the raw hymnal artifact with isolated HTTP, skip, force and failed-download behavior',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const file = `${dir}/hymnal.db`;
        const asked: string[] = [];
        const client = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.sync(() => {
              asked.push(request.url);
              let status = 200;
              if (asked.length === 3) status = 503;
              return HttpClientResponse.fromWeb(
                request,
                new Response(new Uint8Array([42, asked.length]), { status }),
              );
            }),
          ),
        );
        yield* acquireHymnal(file, false, client);
        expect([...(yield* fs.readFile(file))]).toEqual([42, 1]);
        yield* acquireHymnal(file, false, client);
        expect(asked.length).toBe(1);
        yield* acquireHymnal(file, true, client);
        expect([...(yield* fs.readFile(file))]).toEqual([42, 2]);
        const failed = yield* Effect.result(acquireHymnal(file, true, client));
        expect(Result.isFailure(failed)).toBe(true);
        expect([...(yield* fs.readFile(file))]).toEqual([42, 2]);
        expect(asked.length).toBe(3);
        expect(
          asked.every(
            (url) =>
              url ===
              'https://raw.githubusercontent.com/cevr/manna/main/packages/core/data/hymnal.db',
          ),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
