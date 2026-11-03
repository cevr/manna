#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Path } from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { docLines, readAllDocs } from './doc-anchors.ts';

/** How much of a line the report shows. */
const SHOWN = 160;

const docLinesOf = Effect.fn('docLines.run')(function* (base: string) {
  const path = yield* Path.Path;
  const root = path.join(import.meta.dir, '..', '..', '..', '..');
  const spawner = yield* ChildProcessSpawner;
  const out = yield* spawner.string(
    ChildProcess.make('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd: root,
      forceKillAfter: '5 seconds',
    }),
  );
  const changed = new Set(out.split('\n').filter((file) => file !== ''));
  const lines = yield* docLines(yield* readAllDocs(root), changed);
  for (const { doc, line, files, text } of lines) {
    const shown = `${text.slice(0, SHOWN)}${'…'.repeat(Number(text.length > SHOWN))}`;
    yield* Console.log(`doc-lines ${doc}:${line} ${files.join(', ')}: ${shown}`);
  }
  yield* Console.log(`doc-lines ${base}..HEAD files=${changed.size} lines=${lines.length}`);
});

const command = Command.make('doc-lines', { base: Argument.String('base') }, ({ base }) =>
  docLinesOf(base),
).pipe(Command.withDescription('Name every doc line that names a file the branch changed'));

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
