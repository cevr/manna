import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Console, Effect, FileSystem, Layer } from 'effect';
import { Command } from 'effect/cli';
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http';
import { expect, it } from 'effect-bun-test';

import { init } from '../../src/commands/init.js';
import { CorpusSupply, Target } from '@manna/core/corpus-supply';
import { layerNativeTopicsArtifacts } from '@manna/core/corpus-supply/bun';
import { withSqliteRefresh } from '../../src/lib/sqlite-refresh.js';

const stageWithOutgoingWal = (
  destination: string,
  source: string,
  onProvenance: () => Effect.Effect<void, unknown>,
) =>
  CorpusSupply.use((supply) => supply.ensure({ target: Target.topics(), refresh: true })).pipe(
    Effect.provide(
      CorpusSupply.layer.pipe(
        Layer.provide(
          layerNativeTopicsArtifacts({
            destination,
            sources: [{ kind: 'workspace', path: source, label: 'fixture' }],
            verify: () => Effect.succeed(1),
            provenanceStore: {
              read: () => Effect.fail('no prior provenance'),
              write: onProvenance,
            },
          }),
        ),
      ),
    ),
  );

it.scoped(
  'retains an activation WAL refusal after its WAL disappears before optional error handling',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'init-activation-refusal-' });
      const destination = `${dir}/topics.db`;
      const source = `${dir}/source.db`;
      yield* fs.writeFileString(destination, 'outgoing');
      yield* fs.writeFileString(source, 'candidate');
      const operation = stageWithOutgoingWal(destination, source, () =>
        fs.writeFileString(`${destination}-wal`, 'x'),
      ).pipe(Effect.ensuring(fs.remove(`${destination}-wal`, { force: true }).pipe(Effect.orDie)));
      const result = yield* Effect.result(withSqliteRefresh(destination, true, operation));
      expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'SqliteRefreshRefused' } });
      expect(yield* fs.exists(`${destination}-wal`)).toBe(false);
      expect(yield* fs.readFileString(destination)).toBe('outgoing');
      expect((yield* fs.readDirectory(dir)).sort()).toEqual(['source.db', 'topics.db']);
    }).pipe(Effect.provide(BunServices.layer)),
);

const blockedFetch: typeof fetch = Object.assign(
  () => Effect.runPromise(Effect.fail('default init requested native HTTP')),
  { preconnect: () => {} },
);

it.scoped(
  'forced init refuses every non-empty WAL and reports all refusals without touching destinations',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: 'init-wal-' });
      const directory = `${home}/.bible`;
      yield* fs.makeDirectory(directory);
      const names = ['bible', 'topics', 'webster', 'hymnal'];
      for (const name of names) {
        yield* fs.writeFileString(`${directory}/${name}.db`, `prior-${name}`);
        yield* fs.writeFileString(`${directory}/${name}.db-wal`, 'x');
      }
      const output: string[] = [];
      const capture = (...parts: unknown[]) => {
        output.push(parts.join(' '));
      };
      const console: Console.Console = {
        ...Console.Console.defaultValue(),
        log: capture,
        error: capture,
      };
      const offline = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die('refused database requested HTTP')),
      );
      const result = yield* Effect.result(runInit(home, console, offline, ['--force']));
      expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'InitError' } });
      for (const name of names) {
        expect(yield* fs.readFileString(`${directory}/${name}.db`)).toBe(`prior-${name}`);
        expect(yield* fs.readFileString(`${directory}/${name}.db-wal`)).toBe('x');
        expect(
          output.some((line) => line.includes(`${name}.db-wal`) && line.includes('checkpoint')),
        ).toBe(true);
        expect(output.some((line) => line.startsWith(`✓ ${name}.db`))).toBe(false);
      }
      expect((yield* fs.readDirectory(directory)).length).toBe(8);
    }).pipe(Effect.provide(BunServices.layer)),
);

const runInit = (
  home: string,
  console: Console.Console,
  offline: Layer.Layer<HttpClient.HttpClient>,
  args: string[],
) =>
  Command.runWith(init, { version: 'test' })(args).pipe(
    Effect.provide(offline),
    Effect.provideService(FetchHttpClient.Fetch, blockedFetch),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ HOME: home }),
    ),
    Effect.provideService(Console.Console, console),
  );

it.scoped(
  'forced init refuses a Hymnal WAL that appears during download before writing the destination',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: 'init-late-wal-' });
      const directory = `${home}/.bible`;
      yield* fs.makeDirectory(directory);
      for (const name of ['bible', 'topics', 'webster', 'hymnal']) {
        yield* fs.writeFileString(`${directory}/${name}.db`, 'outgoing');
        if (name !== 'hymnal') yield* fs.writeFileString(`${directory}/${name}.db-wal`, 'x');
      }
      const output: string[] = [];
      const capture = (...parts: unknown[]) => {
        output.push(parts.join(' '));
      };
      const console: Console.Console = {
        ...Console.Console.defaultValue(),
        log: capture,
        error: capture,
      };
      const http = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          fs
            .writeFileString(`${directory}/hymnal.db-wal`, 'late')
            .pipe(
              Effect.orDie,
              Effect.as(HttpClientResponse.fromWeb(request, new Response('replacement'))),
            ),
        ),
      );
      const result = yield* Effect.result(runInit(home, console, http, ['--force']));
      expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'InitError' } });
      expect(yield* fs.readFileString(`${directory}/hymnal.db`)).toBe('outgoing');
      expect(yield* fs.readFileString(`${directory}/hymnal.db-wal`)).toBe('late');
      expect(
        output.some((line) => line.includes('hymnal.db-wal') && line.includes('checkpoint')),
      ).toBe(true);
      expect(output.some((line) => line.startsWith('✓ hymnal.db'))).toBe(false);
    }).pipe(Effect.provide(BunServices.layer)),
);

it.scoped('default init preserves every existing database without HTTP or provenance writes', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: 'init-preserve-' });
    const directory = `${home}/.bible`;
    yield* fs.makeDirectory(directory);
    const names = ['bible', 'topics', 'webster', 'hymnal', 'state', 'study', 'egw-paragraphs'];
    for (const name of names) yield* fs.writeFileString(`${directory}/${name}.db`, `prior-${name}`);
    const before = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* () {
        return { name, stat: yield* fs.stat(`${directory}/${name}.db`) };
      }),
    );
    const output: string[] = [];
    const console: Console.Console = {
      ...Console.Console.defaultValue(),
      log: (...parts) => {
        output.push(parts.join(' '));
      },
    };
    const offline = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die('default init requested HTTP for existing databases')),
    );
    yield* runInit(home, console, offline, []);
    const forced = yield* Effect.result(runInit(home, console, offline, ['--force']));
    expect(forced).toMatchObject({ _tag: 'Failure', failure: { _tag: 'CorpusInstallationError' } });
    for (const { name, stat } of before) {
      expect(yield* fs.readFileString(`${directory}/${name}.db`)).toBe(`prior-${name}`);
      const after = yield* fs.stat(`${directory}/${name}.db`);
      expect(after.ino).toEqual(stat.ino);
      expect(after.mtime).toEqual(stat.mtime);
      expect(after.size).toEqual(stat.size);
    }
    for (const name of names.slice(0, 4))
      expect(output.some((line) => line.startsWith(`✓ ${name}.db`))).toBe(true);
    expect((yield* fs.readDirectory(directory)).sort()).toEqual(
      names.map((name) => `${name}.db`).sort(),
    );
  }).pipe(Effect.provide(BunServices.layer)),
);
