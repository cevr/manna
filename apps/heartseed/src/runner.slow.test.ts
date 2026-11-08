/**
 * The proof of `.oxlintrc.json`'s sync-runner rule over Heartseed's product
 * code (`apps/heartseed/{src,app}`, less tests and `src/test/`). Generated
 * files, each at a product, test, rig, probe, script or other workspace's
 * path, hold a seeded mix of the forms a runner takes: a member of
 * `Effect`, of a namespace alias or of a runtime, a computed member, a
 * destructure, a runner piped by name, a named or namespace import of
 * `effect/Effect`, and a key or string that only names one. oxlint, under
 * the repo's own config, must report `no-restricted-properties` or
 * `no-restricted-imports` on exactly the sync-runner lines of the product
 * files, and on no line of any other file; `runFork`, `runPromise`,
 * `runCallback` and their `With` forms are never reported.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { JSONC } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The timeout of the test, which spawns oxlint: a cold start's time is the machine's (effect/requireSpawnBudget). */
const SPAWNS_MS = 60_000;

const SYNC: ReadonlyArray<string> = ['runSync', 'runSyncExit', 'runSyncWith', 'runSyncExitWith'];
const ASYNC: ReadonlyArray<string> = [
  'runFork',
  'runPromise',
  'runCallback',
  'runForkWith',
  'runPromiseExit',
  'runPromiseWith',
];
const RULES: ReadonlyArray<string> = ['no-restricted-properties', 'no-restricted-imports'];

/** Where each generated file stands, from the repo's root, and whether the rule reads it. */
const PLACES: ReadonlyArray<readonly [(n: number) => string, boolean]> = [
  [(n) => `apps/heartseed/src/gen${n}.ts`, true],
  [(n) => `apps/heartseed/src/deep/gen${n}.tsx`, true],
  [(n) => `apps/heartseed/app/gen${n}.tsx`, true],
  [(n) => `apps/heartseed/app/probe/gen${n}.tsx`, true],
  [(n) => `apps/heartseed/src/gen${n}.test.ts`, false],
  [(n) => `apps/heartseed/src/deep/gen${n}.test.tsx`, false],
  [(n) => `apps/heartseed/src/test/gen${n}.ts`, false],
  [(n) => `apps/heartseed/scripts/gen${n}.ts`, false],
  [(n) => `apps/hymnal/src/gen${n}.ts`, false],
  [(n) => `packages/gen/src/gen${n}.ts`, false],
];

/** A seeded generator (mulberry32): the same seed, the same files. */
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A generated file: its path, its text, and the 1-based lines the rule must report. */
interface Generated {
  readonly file: string;
  readonly text: string;
  readonly flagged: ReadonlyArray<number>;
}

const generate = (r: () => number, n: number): Generated => {
  const int = (k: number) => Math.floor(r() * k);
  const pick = <A>(xs: ReadonlyArray<A>) => xs[int(xs.length)] as A;
  const [place, read] = pick(PLACES);
  const lines = ["import { Effect, ManagedRuntime, Layer } from 'effect';"];
  const flagged: number[] = [];
  const add = (line: string, hit: boolean) => {
    lines.push(line);
    if (hit && read) flagged.push(lines.length);
  };
  const imports: ReadonlyArray<() => void> = [
    () => add("import * as E from 'effect/Effect';", true),
    () => add("import { Effect as E } from 'effect';", false),
    () => add("import { Effect as E } from 'effect';", false),
  ];
  pick(imports)();
  if (r() < 0.3) {
    const name = pick([...SYNC, ...ASYNC]);
    add(`import { ${name} as named${n} } from 'effect/Effect';`, SYNC.includes(name));
  }
  add('const runtime = ManagedRuntime.make(Layer.empty);', false);
  const count = 1 + int(6);
  for (let i = 0; i < count; i++) {
    const name = pick([...SYNC, ...ASYNC]);
    const hit = SYNC.includes(name);
    const forms: ReadonlyArray<() => void> = [
      () => add(`export const v${i} = Effect.${name};`, hit),
      () => add(`export const v${i} = E.${name};`, hit),
      () => add(`export const v${i} = runtime.${name};`, hit),
      () => add(`export const v${i} = Effect['${name}'];`, hit),
      () => add(`const { ${name}: d${i} } = Effect;`, hit),
      () => add(`export const v${i} = Effect.void.pipe(Effect.${name});`, hit),
      () => add(`export const v${i} = { ${name}: 1, note: 'Effect.${name}' };`, false),
    ];
    pick(forms)();
  }
  return { file: place(n), text: `${lines.join('\n')}\n`, flagged };
};

/** 12 seeds of 20 files each. */
const GENERATED: ReadonlyArray<Generated> = Array.from({ length: 12 }, (_, s) => {
  const r = rng(s + 1);
  return Array.from({ length: 20 }, (_, k) => generate(r, (s + 1) * 100 + k));
}).flat();

const Plugins = Schema.Struct({ jsPlugins: Schema.Array(Schema.String) });
const Config = Schema.Record(Schema.String, Schema.Unknown);
const ConfigJson = Schema.fromJsonString(Config);

/** The repo's `.oxlintrc.json`, its plugins given by absolute path so it runs from any folder. */
const repoConfig = Effect.fn('test.runnerRule.repoConfig')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const parsed: unknown = JSONC.parse(yield* fs.readFileString(path.join(root, '.oxlintrc.json')));
  const { jsPlugins } = yield* Schema.decodeUnknownEffect(Plugins)(parsed);
  const whole = yield* Schema.decodeUnknownEffect(Config)(parsed);
  return yield* Schema.encodeEffect(ConfigJson)({
    ...whole,
    jsPlugins: jsPlugins.map((plugin) => Bun.resolveSync(plugin, root)),
  });
});

/** The lines oxlint reported one of `RULES` on, by file, read from `--format unix`. */
const reportsOf = (out: string): ReadonlyMap<string, ReadonlyArray<number>> => {
  const found = new Map<string, number[]>();
  for (const line of out.split('\n'))
    for (const m of Option.toArray(
      Option.fromNullishOr(
        /^(.+?):(\d+):\d+: .*\[(?:Error|Warning)\/eslint\(([\w-]+)\)\]$/u.exec(line),
      ),
    ))
      if (RULES.includes(m[3] ?? ''))
        found.set(m[1] ?? '', [...(found.get(m[1] ?? '') ?? []), Number(m[2])]);
  return found;
};

describe('the sync-runner rule', () => {
  it.effect.layer(BunServices.layer)(
    'refuses every form of a sync runner in Heartseed product code, and nothing else, over 240 generated files',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const root = path.resolve(import.meta.dir, '../../..');
          const cwd = yield* fs.makeTempDirectoryScoped();
          yield* fs.writeFileString(path.join(cwd, '.oxlintrc.json'), yield* repoConfig(root));
          yield* Effect.forEach(
            GENERATED,
            ({ file, text }) =>
              Effect.andThen(
                fs.makeDirectory(path.dirname(path.join(cwd, file)), { recursive: true }),
                fs.writeFileString(path.join(cwd, file), text),
              ),
            { discard: true },
          );
          const handle = yield* spawner.spawn(
            ChildProcess.make(
              path.join(root, 'node_modules', '.bin', 'oxlint'),
              ['-c', '.oxlintrc.json', '--format', 'unix', ...GENERATED.map(({ file }) => file)],
              { cwd, forceKillAfter: '5 seconds' },
            ),
          );
          const [stdout, stderr] = yield* Effect.all(
            [
              Stream.mkString(Stream.decodeText(handle.stdout)),
              Stream.mkString(Stream.decodeText(handle.stderr)),
              handle.exitCode,
            ],
            { concurrency: 3 },
          );
          const reports = reportsOf(stdout);
          const wrong = GENERATED.map(({ file, flagged }) => ({
            file,
            reported: [...(reports.get(file) ?? [])].toSorted((a, b) => a - b).join(' '),
            expected: flagged.join(' '),
          }))
            .filter(({ reported, expected }) => reported !== expected)
            .map(
              ({ file, reported, expected }) =>
                `${file}: reported [${reported}], expected [${expected}]`,
            );
          expect({
            stderr: stderr.trim().slice(0, 400),
            read: GENERATED.filter(({ flagged }) => flagged.length > 0).length > 20,
            wrong: wrong.slice(0, 8),
          }).toEqual({ stderr: '', read: true, wrong: [] });
        }),
      ),
    SPAWNS_MS,
  );
});
