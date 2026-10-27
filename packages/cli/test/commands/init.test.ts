import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Console, Effect, FileSystem, Layer } from 'effect';
import { Command } from 'effect/cli';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { expect, it } from 'effect-bun-test';

import { init } from '../../src/commands/init.js';

const blockedFetch: typeof fetch = Object.assign(
  () => Effect.runPromise(Effect.fail('default init requested native HTTP')),
  { preconnect: () => {} },
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
