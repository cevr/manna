import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
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
      expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'UserError' } });
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

it.scoped('forced init refuses live WALs beside all four resolved symlink targets', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: 'init-linked-wal-' });
    const directory = `${home}/.bible`;
    yield* fs.makeDirectory(directory);
    const targets: string[] = [];
    for (const name of ['bible', 'topics', 'webster', 'hymnal']) {
      const target = `${home}/${name}.db`;
      const link = `${directory}/${name}.db`;
      const seed = new Database(target);
      seed.exec('CREATE TABLE fixture(id INTEGER); INSERT INTO fixture VALUES(1)');
      seed.close();
      yield* fs.symlink(target, link);
      const writer = yield* Effect.acquireRelease(
        Effect.sync(() => new Database(link)),
        (db) => Effect.sync(() => db.close()),
      );
      yield* Effect.sync(() =>
        writer.exec(
          'PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO fixture VALUES(2)',
        ),
      );
      expect((yield* fs.stat(`${target}-wal`)).size > 0n).toBe(true);
      expect(yield* fs.exists(`${link}-wal`)).toBe(false);
      targets.push(target);
    }
    const files = targets.flatMap((target) => [target, `${target}-wal`, `${target}-shm`]);
    const before = yield* Effect.forEach(files, (file) => fs.readFile(file));
    const lines: string[] = [];
    const capture = (...parts: unknown[]) => {
      lines.push(parts.join(' '));
    };
    const console: Console.Console = {
      ...Console.Console.defaultValue(),
      log: capture,
      error: capture,
    };
    const offline = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die('linked WAL requested HTTP')),
    );
    const result = yield* Effect.result(runInit(home, console, offline, ['--force']));
    expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'UserError' } });
    expect(yield* Effect.forEach(files, (file) => fs.readFile(file))).toEqual(before);
    for (const target of targets)
      expect(
        lines.some((line) => line.includes(`${target}-wal`) && line.includes('checkpoint')),
      ).toBe(true);
    expect(lines.some((line) => /^✓ (bible|topics|webster|hymnal)\.db/u.test(line))).toBe(false);
  }).pipe(Effect.provide(BunServices.layer)),
);

it.scoped(
  'forced init permits empty and absent WALs at the CLI pre-check and fails closed on stat errors',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      for (const mode of ['empty', 'absent', 'stat-error']) {
        const home = yield* fs.makeTempDirectoryScoped({ prefix: 'init-wal-control-' });
        const directory = `${home}/.bible`;
        yield* fs.makeDirectory(directory);
        for (const name of ['bible', 'topics', 'webster', 'hymnal']) {
          yield* fs.writeFileString(`${directory}/${name}.db`, 'outgoing');
          if (name !== 'hymnal') yield* fs.writeFileString(`${directory}/${name}.db-wal`, 'x');
        }
        const destination = `${directory}/hymnal.db`;
        if (mode === 'empty') yield* fs.writeFileString(`${destination}-wal`, '');
        if (mode === 'stat-error') yield* fs.symlink(`${destination}-wal`, `${destination}-wal`);
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
          HttpClient.make((request) => {
            if (mode === 'stat-error') return Effect.die('uninspectable WAL requested HTTP');
            return Effect.succeed(HttpClientResponse.fromWeb(request, new Response('replacement')));
          }),
        );
        const result = yield* Effect.result(runInit(home, console, http, ['--force']));
        expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'UserError' } });
        if (mode === 'stat-error') {
          expect(yield* fs.readFileString(destination)).toBe('outgoing');
          expect(
            output.some(
              (line) => line.includes('Cannot inspect') && line.includes('hymnal.db-wal'),
            ),
          ).toBe(true);
        } else {
          expect(yield* fs.readFileString(destination)).toBe('replacement');
          expect(output.some((line) => line.startsWith('✓ hymnal.db installed'))).toBe(true);
        }
        if (mode === 'empty') expect(yield* fs.readFileString(`${destination}-wal`)).toBe('');
        expect(
          (yield* fs.readDirectory(directory)).some((file) => file.includes('.building')),
        ).toBe(false);
      }
    }).pipe(Effect.provide(BunServices.layer)),
);

it.scoped(
  'default init names orphan WALs and asks for their matching database instead of a corpus rebuild',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: 'init-orphan-wal-' });
      const directory = `${home}/.bible`;
      yield* fs.makeDirectory(directory);
      for (const name of ['bible', 'hymnal'])
        yield* fs.writeFileString(`${directory}/${name}.db`, 'outgoing');
      for (const name of ['topics', 'webster'])
        yield* fs.writeFileString(`${directory}/${name}.db-wal`, 'x');
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
        HttpClient.make(() => Effect.die('orphan WAL requested HTTP')),
      );
      const result = yield* Effect.result(runInit(home, console, offline, []));
      expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'UserError' } });
      for (const name of ['topics', 'webster']) {
        expect(
          output.some(
            (line) =>
              line.includes(`${name}.db-wal`) && line.includes('matching database file is missing'),
          ),
        ).toBe(true);
        expect(yield* fs.exists(`${directory}/${name}.db`)).toBe(false);
        expect(yield* fs.readFileString(`${directory}/${name}.db-wal`)).toBe('x');
      }
      expect(
        output.some((line) => line.includes('build:topics') || line.includes('build:webster')),
      ).toBe(false);
    }).pipe(Effect.provide(BunServices.layer)),
);

it.scoped('Hymnal stages and renames without writing through database or staging links', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    for (const mode of ['symlink', 'hardlink', 'staging-link']) {
      const home = yield* fs.makeTempDirectoryScoped({ prefix: 'init-linked-control-' });
      const directory = `${home}/.bible`;
      yield* fs.makeDirectory(directory);
      for (const name of ['bible', 'topics', 'webster', 'hymnal']) {
        yield* fs.writeFileString(`${directory}/${name}.db`, 'outgoing');
        if (name !== 'hymnal') yield* fs.writeFileString(`${directory}/${name}.db-wal`, 'x');
      }
      const destination = `${directory}/hymnal.db`;
      const external = `${home}/external.db`;
      yield* fs.writeFileString(external, 'external-bytes');
      if (mode === 'staging-link') yield* fs.symlink(external, `${destination}.building`);
      else {
        yield* fs.remove(destination);
        if (mode === 'symlink') yield* fs.symlink(external, destination);
        else yield* fs.link(external, destination);
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
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response('replacement'))),
        ),
      );
      expect(yield* Effect.result(runInit(home, console, http, ['--force']))).toMatchObject({
        _tag: 'Failure',
        failure: { _tag: 'UserError' },
      });
      expect(yield* fs.readFileString(destination)).toBe('replacement');
      expect(yield* fs.readFileString(external)).toBe('external-bytes');
      expect(output.some((line) => line.startsWith('✓ hymnal.db installed'))).toBe(true);
      expect((yield* fs.readDirectory(directory)).some((file) => file.includes('.building'))).toBe(
        false,
      );
    }
  }).pipe(Effect.provide(BunServices.layer)),
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
      expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'UserError' } });
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
    expect(
      output
        .filter((line) => line.startsWith('✓'))
        .slice(0, 4)
        .map((line) => line.split(' ')[1]),
    ).toEqual(['bible.db', 'webster.db', 'topics.db', 'hymnal.db']);
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
