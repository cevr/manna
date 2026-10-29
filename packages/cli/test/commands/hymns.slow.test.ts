/** Real parser/handler receipts. Never attach child output or corpus values to assertions. */
import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { ConfigProvider, Context, Effect, FileSystem, Layer, Result, Schema, Stream } from 'effect';
import { Command } from 'effect/cli';
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { describe, expect, it } from 'effect-bun-test';

import { HymnalService, HymnId, HymnIndexes } from '@manna/core/hymnal';
import { layerHymnalBun } from '@manna/core/hymnal/bun';
import { init } from '../../src/commands/init.js';

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

const legacyFixture = (file: string, hymns: readonly (typeof ReturnedHymn.Type)[]) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(file)),
    (db) =>
      Effect.sync(() => {
        db.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT);
      CREATE TABLE hymns(id INTEGER PRIMARY KEY,name TEXT,category_id INTEGER,category TEXT,verses TEXT,favorite INTEGER,views INTEGER);
      CREATE TABLE settings(key TEXT,value TEXT); INSERT INTO settings VALUES('fixture','retained');`);
        db.transaction(() => {
          for (const h of hymns) {
            db.query('INSERT OR IGNORE INTO categories VALUES(?,?)').run(h.categoryId, h.category);
            db.query('INSERT INTO hymns VALUES(?,?,?,?,?,?,?)').run(
              h.id,
              h.name,
              h.categoryId,
              h.category,
              json(h.verses),
              1,
              17,
            );
          }
        })();
      }),
    (db) => Effect.sync(() => db.close()),
  );

/** A synthetic installed Bible satisfies init's unrelated prerequisite without corpus content.
 * Its newer generation keeps even --force from fetching a compiled-in older floor. */
const initPrerequisite = (file: string) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(file)),
    (db) =>
      Effect.sync(() => {
        db.exec(`CREATE TABLE books(id INTEGER);
      INSERT INTO books WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<66) SELECT x FROM n;
      CREATE TABLE verses(version_code TEXT);
      INSERT INTO verses WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<31102) SELECT 'KJV' FROM n;
      CREATE TABLE strongs(id INTEGER); INSERT INTO strongs VALUES(1);
      CREATE TABLE cross_refs(source TEXT); INSERT INTO cross_refs VALUES('openbible'),('tske');
      CREATE TABLE margin_notes(id INTEGER); INSERT INTO margin_notes VALUES(1);
      CREATE TABLE topics(id INTEGER); INSERT INTO topics VALUES(1);
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
      INSERT INTO meta VALUES('corpus_source','fixture'),('corpus_revision','fixture-v1'),('corpus_generation','1');`);
        db.query('INSERT INTO meta VALUES(?,?)').run('corpus_digest', `sha256:${'0'.repeat(64)}`);
      }),
    (db) => Effect.sync(() => db.close()),
  );

/** Named fetch adapter prevents any unrelated native fallback from reaching the network. */
const blockedNativeFetch = Object.assign(
  () => Effect.runPromise(Effect.succeed(new Response('', { status: 503 }))),
  { preconnect: () => {} },
);

const runInit = (home: string, refresh: boolean, client: Layer.Layer<HttpClient.HttpClient>) => {
  const args: string[] = [];
  if (refresh) args.push('--force');
  return Command.runWith(init, { version: 'test' })(args).pipe(
    Effect.provide(client),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ HOME: home }),
    ),
    Effect.provideService(FetchHttpClient.Fetch, blockedNativeFetch),
  );
};

describe('hymns CLI corpus contract', () => {
  it.effect('rejects imports that bypass core and hymnal package exports', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const spawner = yield* ChildProcessSpawner;
      const probe = [
        "import { coreProbe } from '../../../core/src/private.js';",
        "import { hymnalProbe } from '../../../hymnal/scripts/private.js';",
        'export { coreProbe, hymnalProbe };',
      ].join('\n');
      for (const filename of [
        'packages/cli/test/commands/hymns.slow.test.ts',
        'packages/hymnal/scripts/source-text.ts',
        'packages/core/src/hymnal/service-bun.ts',
        'packages/film/src/core/probe.ts',
      ]) {
        const file = `${dir}/${filename}`;
        yield* fs.makeDirectory(file.slice(0, file.lastIndexOf('/')), { recursive: true });
        yield* fs.writeFileString(file, probe);
        const child = yield* spawner.spawn(
          ChildProcess.make(
            'bun',
            [
              'x',
              '--no-install',
              'oxlint',
              '--format',
              'json',
              '--no-ignore',
              '--config',
              new URL('../../../../.oxlintrc.json', import.meta.url).pathname,
              file,
            ],
            {
              cwd: new URL('../../../..', import.meta.url).pathname,
              forceKillAfter: '5 seconds',
            },
          ),
        );
        const [out, code] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(child.stdout)),
            child.exitCode,
            Stream.runDrain(child.stderr),
          ],
          { concurrency: 3 },
        );
        expect(Number(code), filename).toBe(1);
        expect((out.match(/no-restricted-imports/g) ?? []).length >= 2, filename).toBe(true);
      }
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'returns complete verses for normalized and installed legacy databases without changing either file',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const normalized = `${dir}/normalized.db`,
          legacy = `${dir}/legacy.db`;
        yield* fs.copyFile(ARTIFACT, normalized);
        const reader = (file: string) =>
          layerHymnalBun.pipe(
            Layer.provide(
              ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: dir, HYMNAL_DB_PATH: file })),
            ),
            Layer.provide(BunServices.layer),
          );
        const corpus = Context.get(yield* Layer.build(reader(normalized)), HymnalService);
        yield* legacyFixture(
          legacy,
          yield* Effect.forEach([2, 696], (id) => corpus.getHymn(HymnId.make(id))),
        );
        for (const file of [normalized, legacy]) {
          const before = yield* fs.readFile(file);
          const service = Context.get(yield* Layer.build(reader(file)), HymnalService);
          for (const id of [2, 696]) {
            const result = yield* cli(dir, file, ['get', String(id), '--json']);
            expect(result.code, `${id}:cli:exit`).toBe(0);
            const hymn = yield* decodeHymn(result.stdout);
            const expected = yield* service.getHymn(HymnId.make(id));
            expect(
              hymn.id === id &&
                hymn.name === expected.name &&
                hymn.category === expected.category &&
                hymn.categoryId === expected.categoryId &&
                json(hymn.verses) === json(expected.verses),
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
    'gives a hymn its back-matter indexes in JSON and text, and none to a reading or a legacy database',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const normalized = `${dir}/normalized.db`,
          legacy = `${dir}/legacy.db`;
        yield* fs.copyFile(ARTIFACT, normalized);
        const service = Context.get(
          yield* Layer.build(
            layerHymnalBun.pipe(
              Layer.provide(
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({ HOME: dir, HYMNAL_DB_PATH: normalized }),
                ),
              ),
              Layer.provide(BunServices.layer),
            ),
          ),
          HymnalService,
        );
        const WithIndexes = Schema.Struct({ id: Schema.Int, indexes: Schema.Unknown });
        const indexesOf = (text: string) =>
          Schema.decodeEffect(Schema.fromJsonString(WithIndexes))(text).pipe(
            Effect.map((decoded) => decoded.indexes),
            Effect.mapError(() => CliProofError.make({ operation: 'decode-indexes' })),
          );

        for (const id of [2, 100, 695]) {
          const expected = yield* service.getHymnIndexes(HymnId.make(id));
          expect(expected.topics.length > 0 && expected.metres.length > 0, `${id}:indexed`).toBe(
            true,
          );
          const result = yield* cli(dir, normalized, ['get', String(id), '--json']);
          expect(result.code, `${id}:json:exit`).toBe(0);
          expect(json(yield* indexesOf(result.stdout)), `${id}:json:indexes`).toBe(
            json(yield* Schema.encodeEffect(HymnIndexes)(expected)),
          );

          const text = yield* cli(dir, normalized, ['get', String(id)]);
          expect(text.code, `${id}:text:exit`).toBe(0);
          const line = (label: string) =>
            text.stdout.split('\n').find((l) => l.startsWith(`${label}: `)) ?? '';
          expect(
            expected.topics.every((topic) => line('Topics').includes(topic.name)) &&
              expected.tunes.every((tune) => line('Tunes').includes(tune.name)) &&
              expected.metres.every((metre) => line('Metres').includes(metre)),
            `${id}:text:names`,
          ).toBe(true);
        }

        const reading = yield* cli(dir, normalized, ['get', '696', '--json']);
        expect(reading.code, 'reading:exit').toBe(0);
        expect(json(yield* indexesOf(reading.stdout)), 'reading:indexes').toBe('null');

        yield* legacyFixture(legacy, [yield* service.getHymn(HymnId.make(2))]);
        const old = yield* cli(dir, legacy, ['get', '2', '--json']);
        expect(old.code, 'legacy:exit').toBe(0);
        expect(json(yield* indexesOf(old.stdout)), 'legacy:indexes').toBe('null');
        const oldText = yield* cli(dir, legacy, ['get', '2']);
        expect(oldText.code === 0 && !oldText.stdout.includes('Topics: '), 'legacy:text').toBe(
          true,
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'acquires the raw hymnal artifact with isolated HTTP, skip, force and failed-download behavior',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const file = `${dir}/.bible/hymnal.db`;
        yield* fs.makeDirectory(`${dir}/.bible`);
        yield* initPrerequisite(`${dir}/.bible/bible.db`);
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
        yield* runInit(dir, false, client);
        expect([...(yield* fs.readFile(file))]).toEqual([42, 1]);
        yield* runInit(dir, false, client);
        expect(asked.length).toBe(1);
        yield* runInit(dir, true, client);
        expect([...(yield* fs.readFile(file))]).toEqual([42, 2]);
        const failed = yield* Effect.result(runInit(dir, true, client));
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
