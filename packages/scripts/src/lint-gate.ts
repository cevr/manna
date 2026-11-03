#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { JSONC } from 'bun';
import { Clock, Console, Effect, FileSystem, Path, Schema } from 'effect';
import { availableParallelism } from 'node:os';

import { gateFiles, lintIgnored } from './guard/files.js';
import { partsOf, runEachPart, shareOf, sizesOf } from './guard/parts.js';
import { importClosure, pluginsOf } from './lint-gate/closure.js';
import {
  Kept,
  LintConfig,
  keptAfter,
  nativeOnly,
  passedOf,
  unkept,
  withoutJudged,
} from './lint-gate/config.js';

const LINTED = /\.[cm]?[jt]sx?$/;
const CACHE = 'node_modules/.cache/manna-lint';
const JUDGED_PLUGIN = './packages/scripts/lint/judged.ts';
const PER_PART = 64;

const ConfigJson = Schema.fromJsonString(LintConfig);
const KeptJson = Schema.fromJsonString(Kept);

const hashOf = (bytes: Uint8Array | string) =>
  new Bun.CryptoHasher('sha1').update(bytes).digest('hex');

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const started = yield* Clock.currentTimeMillis;
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const cache = path.join(root, CACHE);
  yield* fs.makeDirectory(cache, { recursive: true });

  const config = yield* Schema.decodeUnknownEffect(LintConfig)(
    JSONC.parse(yield* fs.readFileString(path.join(root, '.oxlintrc.json'))),
  );
  const native = yield* Schema.encodeEffect(ConfigJson)(nativeOnly(config));
  const pluginsConfig = withoutJudged(config, JUDGED_PLUGIN, (plugin) => path.join(root, plugin));
  const plugins = yield* Schema.encodeEffect(ConfigJson)(pluginsConfig);
  const nativeFile = path.join(cache, 'native.json');
  const pluginsFile = path.join(cache, 'plugins.json');
  yield* Effect.all(
    [fs.writeFileString(nativeFile, native), fs.writeFileString(pluginsFile, plugins)],
    { concurrency: 2 },
  );

  const ignored = yield* lintIgnored(root);
  const files = (yield* gateFiles(root)).filter((file) => LINTED.test(file) && !ignored(file));
  const pluginFiles = yield* importClosure(root, pluginsOf(pluginsConfig));
  const keyParts = yield* Effect.forEach(
    [...pluginFiles, 'bun.lock'],
    (file) =>
      Effect.map(fs.readFile(path.join(root, file)), (bytes) => `${file}\0${hashOf(bytes)}`),
    { concurrency: 16 },
  );
  const key = hashOf([plugins, ...keyParts].join('\n'));
  const hashes = new Map(
    yield* Effect.forEach(
      files,
      (file) =>
        Effect.map(fs.readFile(path.join(root, file)), (bytes) => [file, hashOf(bytes)] as const),
      { concurrency: 32 },
    ),
  );
  const keptFile = path.join(cache, 'kept.json');
  const kept = yield* fs.readFileString(keptFile).pipe(
    Effect.flatMap(Schema.decodeEffect(KeptJson)),
    Effect.orElseSucceed((): Kept => ({ key: '', files: {} })),
  );
  const toLint = unkept(kept, key, hashes);

  const cores = availableParallelism();
  const share = shareOf(cores);
  const parts = partsOf(
    yield* sizesOf(root, toLint),
    Math.min(share.parts, Math.ceil(toLint.length / PER_PART)),
  );
  const oxlint = 'node_modules/.bin/oxlint';
  const [nativeRuns, pluginRuns] = yield* Effect.all(
    [
      runEachPart(root, oxlint, ['-c', nativeFile, '--format=unix', `--threads=${cores}`], [files]),
      runEachPart(
        root,
        oxlint,
        [
          '-c',
          pluginsFile,
          '--format=unix',
          `--threads=${share.threads}`,
          '--report-unused-disable-directives-severity=error',
        ],
        parts,
      ),
    ],
    { concurrency: 2 },
  );
  const passed = parts.flatMap((part, at) =>
    pluginRuns.slice(at, at + 1).flatMap((run) => passedOf(part, run.code, run.output)),
  );
  yield* fs.writeFileString(
    keptFile,
    yield* Schema.encodeEffect(KeptJson)(keptAfter(kept, key, hashes, passed)),
  );

  const runs = [...nativeRuns, ...pluginRuns];
  yield* Effect.forEach(
    runs.filter((run) => run.code !== 0),
    (run) => Console.log(run.output.trimEnd()),
    { discard: true },
  );
  const code = Math.max(0, ...runs.map((run) => run.code));
  const ended = yield* Clock.currentTimeMillis;
  yield* Console.log(
    `lint: ${files.length} files, ${toLint.length} through the JS plugins in ${parts.length} parts (${files.length - toLint.length} kept), exit ${code}, ${ended - started} ms`,
  );
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
