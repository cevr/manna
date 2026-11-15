import * as BunServices from '@effect/platform-bun/BunServices';
import { Duration, Effect, FileSystem, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';

import { KEYS, probe } from '../../lab/heartseed-exact/probe.ts';
import table from '../../lab/heartseed-exact/probe-table.json';
import { withDataHost } from '../data-host/testing.ts';

/** A call as Exact makes one: a time past 2026 and a seed. */
const CALL = { now: 1_800_000_000_123.5, seed: 7 };

/** The runner's host in Bun: each step under `withDataHost`, each sleep over at once. */
const HOST = { turn: withDataHost, wait: () => Effect.runPromise(Effect.void) };

/** The lab's contract test, written from the table: a tap and an expectation per row. */
const contractTest = (rows: Readonly<Record<string, string>>) =>
  [
    'test "each probe row shows what probe-table.json says"',
    '  expect text "title" == "Exact Lab"',
    ...Object.entries(rows).flatMap(([key, text]) => [
      `  tap "ask-${key}"`,
      '  clock settle',
      `  expect text "out-${key}" == "${text}"`,
    ]),
    '',
  ].join('\n');

const here = (file: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* path.fromFileUrl(new URL(file, import.meta.url));
  });

describe('the Effect probe', () => {
  it.effect('the table names every row in each mode, in the lab order', () =>
    Effect.sync(() => expect(Object.keys(table)).toEqual([...KEYS])),
  );

  it.effect(
    'each row, with Effect defaults and through the runner, does what the table says under the data-host rules',
    () =>
      Effect.gen(function* () {
        const seen = yield* Effect.forEach(KEYS, (key) =>
          Effect.map(
            Effect.promise(() => probe(key, CALL, HOST)),
            (text) => [key, text] as const,
          ),
        );
        expect(Object.fromEntries(seen)).toEqual(table);
      }),
  );

  it.effect(
    'effect, effect/persistence and the runner load for the first time under the data-host rules',
    () =>
      Effect.gen(function* () {
        const script = yield* here('./import-probe.ts');
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const loaded = yield* Effect.scoped(
          Effect.flatMap(
            spawner.spawn(
              ChildProcess.make('bun', [script], { forceKillAfter: Duration.seconds(5) }),
            ),
            (handle) => Stream.mkString(Stream.decodeText(handle.stdout)),
          ),
        );
        expect(loaded).toBe(table['import-defaults']);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("the lab's contract test asks every row and expects the table's text", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const committed = yield* fs.readFileString(
        yield* here('../../lab/heartseed-exact/app.test.contract'),
      );
      expect(committed).toBe(contractTest(table));
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
