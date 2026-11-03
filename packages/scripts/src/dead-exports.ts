#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Config, Console, Effect, FileSystem, Path } from 'effect';

import { debtLines, grownOver } from './dead-exports/base.js';
import { deadExports } from './dead-exports/graph.js';
import { readWorkspace } from './dead-exports/workspace.js';

const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dead = deadExports(yield* readWorkspace(path.resolve(import.meta.dir, '../../..')));
  const root = path.resolve(import.meta.dir, '../../..');
  const debtFile = 'packages/scripts/src/dead-exports/debt.txt';
  const debt = debtLines(yield* fs.readFileString(path.join(root, debtFile)));
  const named = yield* Config.option(Config.String('DEAD_EXPORTS_BASE'));
  const base = yield* grownOver(
    root,
    { check: 'packages/scripts/src/dead-exports.ts', debt: debtFile },
    named,
    debt,
  ).pipe(
    Effect.map((grown) => ({ grown, unreadable: false })),
    Effect.catchTag('BaseUnavailable', (e) =>
      Console.log(`base-unavailable ${e.reason}`).pipe(
        Effect.as<{ grown: ReadonlyArray<string>; unreadable: boolean }>({
          grown: [],
          unreadable: true,
        }),
      ),
    ),
  );
  const { grown } = base;
  const fresh = Arr.difference(dead, debt);
  const settled = Arr.difference(debt, dead);
  yield* Effect.forEach(grown, (line) => Console.log(`grown-debt ${line}`), { discard: true });
  yield* Effect.forEach(fresh, (line) => Console.log(`dead-export ${line}`), { discard: true });
  yield* Effect.forEach(settled, (line) => Console.log(`stale-debt ${line}`), { discard: true });
  yield* Console.log(
    `dead-exports debt=${debt.length} new=${fresh.length} settled=${settled.length} grown=${grown.length}`,
  );
  yield* Effect.sync(() => {
    process.exitCode = Number(fresh.length + settled.length + grown.length > 0 || base.unreadable);
  });
});

BunRuntime.runMain(main.pipe(Effect.provide(BunServices.layer)));
