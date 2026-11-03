#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Option, Path, Runtime, Schema, Stream } from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import {
  caseKey,
  caseSpans,
  casesOf,
  changesOf,
  diffLines,
  isBrowserTier,
  isTest,
  newOrChanged,
  reportLines,
  skippedOf,
  unloaded,
} from './redfirst/report.js';

class StepFailed extends Schema.TaggedError<StepFailed>()('StepFailed', {
  command: Schema.String,
  code: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `redfirst: \`${this.command}\` exited ${this.code}: ${this.output.trim()}`;
  }
  override readonly [Runtime.errorReported] = false;
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

const exec = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    return { stdout, stderr, code: Number(code) };
  }).pipe(Effect.scoped);

const failed = (command: string, args: ReadonlyArray<string>, code: number, output: string) =>
  StepFailed.make({ command: [command, ...args].join(' '), code, output });

const run = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.flatMap(exec(command, args, cwd), ({ stdout, stderr, code }) => {
    if (code === 0) return Effect.succeed(stdout);
    return Effect.fail(failed(command, args, code, `${stderr}${stdout}`));
  });

const lines = (out: string) => out.split('\n').filter((line) => line !== '');

const isTestCode = (file: string) =>
  isTest(file) || /(^|\/)fixtures\//.test(file) || file.endsWith('/testing.ts');

const worktree = (root: string, base: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' }), 'base');
    yield* Effect.acquireRelease(run('git', ['worktree', 'add', '--detach', dir, base], root), () =>
      Effect.ignore(run('git', ['worktree', 'remove', '--force', dir], root)),
    );
    return dir;
  });

const packageOf = Effect.fn('redfirst.packageOf')(function* (root: string, file: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let dir = path.dirname(file);
  while (dir !== '.' && dir !== '') {
    if (yield* fs.exists(path.join(root, dir, 'package.json'))) return `${dir}/`;
    dir = path.dirname(dir);
  }
  return '';
});

const PROBE = {
  file: 'redfirst-probe.test.ts',
  text: "import { test } from 'bun:test';\n\ntest('probe', () => {});\n",
};

const casesIn = Effect.fn('redfirst.casesIn')(function* (
  tree: string,
  prefix: string,
  files: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' });
  const report = path.join(scratch, 'junit.xml');
  const probe = path.join(scratch, PROBE.file);
  yield* fs.writeFileString(probe, PROBE.text);
  const relative = files.map((file) => file.slice(prefix.length));
  const args = [
    'test',
    '--timeout',
    '30000',
    '--reporter=junit',
    `--reporter-outfile=${report}`,
    ...relative,
    probe,
  ];
  const ran = yield* exec('bun', args, path.join(tree, prefix));
  const junit = yield* Effect.option(fs.readFileString(report));
  if (ran.code > 1 || Option.isNone(junit))
    return yield* failed('bun', args, ran.code, `${ran.stderr}${ran.stdout}`.slice(-4000));
  return casesOf(junit.value, prefix).filter((c) => !c.file.endsWith(PROBE.file));
});

const casesOfFiles = Effect.fn('redfirst.casesOfFiles')(function* (
  root: string,
  tree: string,
  files: ReadonlyArray<string>,
) {
  const byPackage = new Map<string, Array<string>>();
  for (const file of files) {
    const prefix = yield* packageOf(root, file);
    byPackage.set(prefix, [...(byPackage.get(prefix) ?? []), file]);
  }
  const runs = yield* Effect.forEach([...byPackage], ([prefix, inPackage]) =>
    casesIn(tree, prefix, inPackage),
  );
  return runs.flat();
});

const redfirst = Effect.fn('redfirst')(function* (baseRef: string) {
  const root = (yield* run('git', ['rev-parse', '--show-toplevel'], '.')).trim();
  const base = (yield* run('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], root)).trim();
  const head = (yield* run('git', ['rev-parse', 'HEAD'], root)).trim();
  const statuses = changesOf(yield* run('git', ['diff', '--name-status', '-M', base, head], root));
  const kept = statuses.filter((c) => ['A', 'M', 'R'].includes(c.status));
  const changed = kept.map((c) => c.file);
  const tests = changed.filter((file) => isTest(file) && !isBrowserTier(file));
  const fromOf = new Map(kept.map((c) => [c.file, c.from]));
  const toOf = new Map(kept.map((c) => [c.from, c.file]));
  const skipped = skippedOf(statuses);
  const range = `${base.slice(0, 9)}..${head.slice(0, 9)}`;
  if (tests.length === 0) {
    yield* Effect.forEach(reportLines(range, [], { skipped, unloaded: [] }), (line) =>
      Console.log(line),
    );
    return;
  }
  const tree = yield* worktree(root, base);
  yield* run('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], tree);
  const existed = lines(
    yield* run(
      'git',
      [
        'ls-tree',
        '-r',
        '--name-only',
        base,
        '--',
        ...tests.map((file) => fromOf.get(file) ?? file),
      ],
      root,
    ),
  );
  const baseCases = (yield* casesOfFiles(root, tree, existed)).map((c) => ({
    ...c,
    file: toOf.get(c.file) ?? c.file,
  }));
  const testCode = changed.filter(isTestCode);
  if (testCode.length > 0) yield* run('git', ['checkout', head, '--', ...testCode], tree);
  const headCases = yield* casesOfFiles(root, tree, tests);
  const changes = new Map(
    yield* Effect.forEach(tests, (file) =>
      Effect.all([
        run('git', ['diff', '-U0', '-M', base, head, '--', fromOf.get(file) ?? file, file], root),
        run('git', ['show', `${head}:${file}`], root),
      ]).pipe(
        Effect.map(
          ([diff, text]) => [file, { ...diffLines(diff), spans: caseSpans(file, text) }] as const,
        ),
      ),
    ),
  );
  const cases = newOrChanged(headCases, new Set(baseCases.map(caseKey)), changes);
  const report = reportLines(range, cases, { skipped, unloaded: unloaded(tests, headCases) });
  yield* Effect.forEach(report, (line) => Console.log(line));
});

const command = Command.make('redfirst', { base: Argument.String('base') }, ({ base }) =>
  Effect.scoped(redfirst(base)).pipe(
    Effect.tapErrorTag('StepFailed', (error) => Console.error(error.message)),
  ),
).pipe(
  Command.withDescription(
    "Name every new or changed test case that passes against the base's product sources",
  ),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
