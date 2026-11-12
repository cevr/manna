/**
 * `bun scripts/slow.ts <name>…`: runs each named package script with
 * `bun run`, every one whatever the one before it answered, prints each
 * one's exit, then one line naming every script that failed, and exits 1
 * when any did. A name that ends in `:` names every script under it, in the
 * package's order: `test:slow` runs `test:slow:` (each group of slow files
 * that may share one process) and `test:browser`.
 *
 * The groups stay package scripts, each a plain `bun test`, so the repo's
 * test reach (`packages/scripts/src/test-budget/reach.ts`) reads which
 * script runs each file.
 */

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path, Schema, Stdio } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** The package scripts `names` stand for, in order: a name that ends in `:` stands for every script under it. */
export const scriptsOf = (
  scripts: Readonly<Record<string, string>>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  names.flatMap((name) => {
    if (name.endsWith(':')) return Object.keys(scripts).filter((key) => key.startsWith(name));
    return [name];
  });

/** A script and the code it exited with. */
export interface Ran {
  readonly script: string;
  readonly code: number;
}

/** Runs every script in order, each whatever the ones before it answered. */
export const runAll = <E, R>(
  scripts: ReadonlyArray<string>,
  run: (script: string) => Effect.Effect<number, E, R>,
) =>
  Effect.forEach(scripts, (script) => Effect.map(run(script), (code): Ran => ({ script, code })));

/** The closing line: every failed script, or that all passed. */
export const summaryOf = (ran: ReadonlyArray<Ran>) => {
  const failed = ran.filter(({ code }) => code !== 0);
  if (failed.length === 0) return `slow: all ${ran.length} scripts passed`;
  return [
    `slow: ${failed.length} of ${ran.length} scripts failed`,
    ...failed.map(({ script, code }) => `  exit ${code}: bun run ${script}`),
  ].join('\n');
};

const Manifest = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

const runOne = (cwd: string) => (script: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const child = yield* spawner.spawn(
        ChildProcess.make('bun', ['run', script], {
          cwd,
          stdout: 'inherit',
          stderr: 'inherit',
          forceKillAfter: '3 seconds',
        }),
      );
      const code = Number(yield* child.exitCode);
      yield* Console.log(`== exit ${code}: bun run ${script}`);
      return code;
    }),
  );

if (import.meta.main)
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const app = path.resolve(import.meta.dir, '..');
    const { scripts } = yield* Schema.decodeEffect(Manifest)(
      yield* fs.readFileString(path.join(app, 'package.json')),
    );
    const names = yield* (yield* Stdio.Stdio).args;
    const ran = yield* runAll(scriptsOf(scripts, names), runOne(app));
    yield* Console.log(summaryOf(ran));
    yield* Effect.sync(() => {
      process.exitCode = (ran.some(({ code }) => code !== 0) && 1) || 0;
    });
  }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
