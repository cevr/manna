/**
 * The static leg of the contained host: `.oxlintrc.json`'s block for
 * `packages/sim/src` refuses `node:fs`, `fs`, `child_process` and Bun's own
 * file and spawn calls, which would reach the host around `host.ts`, and no
 * later block lets a driver source off. oxlint runs the block's own rules
 * over a probe and reports each banned line, and only those.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { Glob, JSONC } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The timeout of the test that spawns oxlint: a cold start's time is the machine's (effect/requireSpawnBudget). */
const SPAWNS_MS = 30_000;

const SIM_SOURCES = '**/packages/sim/src/**/*.ts';
const BANNED = ['no-restricted-imports', 'no-restricted-properties'];

const Override = Schema.Struct({
  files: Schema.Array(Schema.String),
  rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});
const Config = Schema.Struct({ overrides: Schema.Array(Override) });
const ProbeConfig = Schema.fromJsonString(
  Schema.Struct({ rules: Schema.Record(Schema.String, Schema.Unknown) }),
);

/** A probe: each line that reaches the host directly is marked by the rule oxlint must report on it. */
const PROBE = [
  "import { writeFileSync } from 'node:fs';",
  "import { readFile } from 'fs/promises';",
  "import { spawn } from 'node:child_process';",
  "import { Effect } from 'effect';",
  "await Bun.write('/nonexistent/loop-probe-x', 'x');",
  "Bun.file('/nonexistent/loop-probe-x');",
  "Bun.spawn(['true']);",
  'Bun.spawnSync([`true`]);',
  'export const used = [writeFileSync, readFile, spawn, Effect];',
];
const REPORTED_LINES = [1, 2, 3, 5, 6, 7, 8];

const root = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.resolve(import.meta.dirname, '..', '..', '..');
});

const simBlocks = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(yield* root, '.oxlintrc.json'));
  const config = yield* Schema.decodeUnknownEffect(Config)(JSONC.parse(text));
  return config.overrides;
});

/** The 1-based probe lines oxlint reported, in `--format unix`. */
const reportedLines = (out: string) =>
  out
    .split('\n')
    .flatMap((line) => Option.toArray(Option.fromNullishOr(/probe\.ts:(\d+):\d+: /.exec(line))))
    .map((match) => Number(match[1]));

describe('the static leg of the contained host', () => {
  it.effect.layer(BunServices.layer)(
    'no later block lets a driver source off the block that bans direct host calls',
    () =>
      Effect.gen(function* () {
        const overrides = yield* simBlocks;
        const sample = [
          'packages/sim/src/host.ts',
          'packages/sim/src/drive.ts',
          'packages/sim/src/a/b.ts',
        ];
        for (const file of sample) {
          const setting = overrides.filter(
            (o) =>
              o.files.some((glob) => new Glob(glob).match(file)) &&
              BANNED.some((rule) =>
                Option.exists(Option.fromUndefinedOr(o.rules), (rules) => rule in rules),
              ),
          );
          expect(setting.at(-1)?.files).toEqual([SIM_SOURCES]);
        }
      }),
  );

  it.effect.layer(BunServices.layer)(
    'reports every direct file, process and Bun host call, and nothing else',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const block = (yield* simBlocks).find((o) => o.files.includes(SIM_SOURCES));
        const rules = Object.fromEntries(BANNED.map((rule) => [rule, block?.rules?.[rule]]));
        const config = yield* Schema.encodeEffect(ProbeConfig)({ rules });
        const oxlint = path.join(yield* root, 'node_modules', '.bin', 'oxlint');
        const out = yield* Effect.scoped(
          Effect.gen(function* () {
            const cwd = yield* fs.makeTempDirectoryScoped();
            yield* fs.writeFileString(path.join(cwd, 'probe.ts'), PROBE.join('\n'));
            yield* fs.writeFileString(path.join(cwd, 'oxlint.json'), config);
            const handle = yield* spawner.spawn(
              ChildProcess.make(oxlint, ['-c', 'oxlint.json', '--format', 'unix', 'probe.ts'], {
                cwd,
                forceKillAfter: '5 seconds',
              }),
            );
            const [stdout] = yield* Effect.all(
              [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
              { concurrency: 2 },
            );
            return stdout;
          }),
        );
        expect([...new Set(reportedLines(out))].toSorted((a, b) => a - b)).toEqual(REPORTED_LINES);
      }),
    SPAWNS_MS,
  );
});
