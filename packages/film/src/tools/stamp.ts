import { createRequire } from 'node:module';
import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Record as Rec,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { parseSync } from 'oxc-parser';
import { type Scope, addressKey, sceneAddress } from '../core/address.ts';
import type { Stamp } from '../core/catalogue.ts';
import type { Placed } from '../core/layout.ts';
import { Short, Timed, type Timings, VoiceTiming } from '../core/schema.ts';
import { sha256Hex } from './digest.ts';
import type { FilmPaths } from './film-repo.ts';
import { collectWithin } from './process.ts';
import { type LocateError, SceneSources } from './scene-sources.ts';

export interface SceneKeys {
  readonly commit: Option.Option<string>;
  readonly keys: ReadonlyMap<string, string>;
  readonly beats: ReadonlyMap<string, string>;
}

export interface Keyed {
  readonly paths: Pick<FilmPaths, 'name' | 'dir'>;
  readonly timings: Timings;
}

type StampError = LocateError | PlatformError | Schema.SchemaError;

const SOURCE = ['.ts', '.tsx', '.js', '.mjs'];
const GIT_LIMIT = Duration.seconds(10);

const Files = Schema.Array(Schema.Tuple([Schema.String, Schema.String]));

const SceneKeyInput = Schema.fromJsonString(
  Schema.Struct({
    files: Files,
    entered: Files,
    beat: Timed,
    timing: Schema.OptionFromOptionalKey(VoiceTiming),
    voice: Schema.String,
    start: Schema.Finite,
    dur: Schema.Finite,
  }),
);

const BeatRead = Schema.Struct({
  beat: Timed,
  timing: Schema.OptionFromOptionalKey(VoiceTiming),
  dur: Schema.Finite,
});

const BeatKeyInput = Schema.fromJsonString(
  Schema.Struct({
    files: Files,
    entered: Files,
    enteredBeat: Schema.OptionFromOptionalKey(BeatRead),
    beat: Timed,
    timing: Schema.OptionFromOptionalKey(VoiceTiming),
    voice: Schema.String,
    dur: Schema.Finite,
  }),
);

const AddressKeyInput = Schema.fromJsonString(
  Schema.Struct({
    address: Schema.String,
    short: Schema.OptionFromOptionalKey(Short),
    scenes: Schema.Array(Schema.String),
    levels: Schema.OptionFromOptionalKey(
      Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
    ),
  }),
);

const resolveFrom = Option.liftThrowable((spec: string, from: string) =>
  createRequire(from).resolve(spec),
);

export const importsOf = (file: string, source: string): ReadonlyArray<string> => {
  const { module } = parseSync(file, source, { lang: 'ts', sourceType: 'module' });
  return Arr.dedupe([
    ...module.staticImports.map((i) => i.moduleRequest.value),
    ...module.staticExports
      .flatMap((e) =>
        e.entries.flatMap((entry) => Option.toArray(Option.fromNullishOr(entry.moduleRequest))),
      )
      .map((request) => request.value),
  ]);
};

export const stampOf = (
  keys: SceneKeys,
  scope: Pick<Scope, 'address' | 'short' | 'scenes'>,
  levels: Readonly<Record<string, string>> = {},
): Stamp => ({
  commit: keys.commit,
  key: sha256Hex(
    Schema.encodeSync(AddressKeyInput)({
      address: addressKey(scope.address),
      short: scope.short,
      scenes: scope.scenes.flatMap((p) =>
        Option.toArray(Option.fromUndefinedOr(keys.keys.get(p.spec.id))),
      ),
      levels: Option.liftPredicate(
        Arr.sortWith(Object.entries(levels), ([look]) => look, Order.String),
        Arr.isArrayNonEmpty,
      ),
    }),
  ),
});

export const sceneStamps = (
  keys: SceneKeys,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<{ readonly scene: string; readonly stamp: Stamp }> =>
  placed.map((p) => ({
    scene: p.spec.id,
    stamp: stampOf(keys, { address: sceneAddress(p.spec.id), short: Option.none(), scenes: [p] }),
  }));

interface StampsService {
  readonly scenes: (
    film: Keyed,
    placed: ReadonlyArray<Placed>,
  ) => Effect.Effect<SceneKeys, StampError>;
}

interface Read {
  readonly hash: string;
  readonly imports: ReadonlyArray<string>;
}

export class Stamps extends Context.Service<Stamps, StampsService>()('@manna/film/tools/Stamps') {
  static readonly layer = Layer.effect(
    Stamps,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sources = yield* SceneSources;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const isFile = (file: string) =>
        fs.stat(file).pipe(
          Effect.map((info) => info.type === 'File'),
          Effect.orElseSucceed(() => false),
        );

      const relative = Effect.fn('Stamps.relative')(function* (spec: string, from: string) {
        const at = path.resolve(path.dirname(from), spec);
        const candidates = [at, ...SOURCE.map((ext) => `${at}${ext}`), path.join(at, 'index.ts')];
        return yield* Effect.findFirst(candidates, isFile);
      });

      const workspace = (spec: string, from: string) =>
        Option.match(resolveFrom(spec, from), {
          onNone: () => Effect.succeedNone,
          onSome: (file) =>
            fs.realPath(file).pipe(
              Effect.map((real) =>
                Option.liftPredicate(real, (r) => !r.split(path.sep).includes('node_modules')),
              ),
              Effect.orElseSucceed(() => Option.none<string>()),
            ),
        });

      const resolve = (spec: string, from: string) => {
        if (spec.startsWith('.') || spec.startsWith('/')) return relative(spec, from);
        return workspace(spec, from);
      };

      const readOnce = Effect.fn('Stamps.read')(function* (file: string) {
        const bytes = yield* fs.readFile(file);
        const imports: Array<string> = [];
        if (SOURCE.includes(path.extname(file)))
          for (const spec of importsOf(file, new TextDecoder().decode(bytes))) {
            const to = yield* resolve(spec, file);
            if (Option.isSome(to)) imports.push(to.value);
          }
        return { hash: sha256Hex(bytes), imports } satisfies Read;
      });

      const closure = Effect.fn('Stamps.closure')(function* (
        roots: ReadonlyArray<string>,
        cut: (from: string, to: string) => boolean,
        reads: Map<string, Read>,
      ) {
        const seen = new Set<string>();
        let queue = [...roots];
        while (queue.length > 0) {
          const next: Array<string> = [];
          for (const file of queue) {
            if (seen.has(file)) continue;
            const known = Option.fromUndefinedOr(reads.get(file));
            if (Option.isNone(known) && !(yield* isFile(file))) continue;
            seen.add(file);
            const read = yield* Option.match(known, {
              onNone: () => readOnce(file),
              onSome: Effect.succeed,
            });
            reads.set(file, read);
            for (const to of read.imports) if (!cut(file, to)) next.push(to);
          }
          queue = next;
        }
        return [...seen];
      });

      const commitAt = (dir: string) =>
        collectWithin(
          spawner,
          'git rev-parse',
          ChildProcess.make('git', ['rev-parse', 'HEAD'], {
            cwd: dir,
            forceKillAfter: '5 seconds',
          }),
          GIT_LIMIT,
        ).pipe(
          Effect.map((done) =>
            Option.liftPredicate(done.stdout.trim(), (sha) => done.exitCode === 0 && sha !== ''),
          ),
          Effect.orElseSucceed(() => Option.none<string>()),
        );

      const scenes = Effect.fn('Stamps.scenes')(function* (
        film: Keyed,
        placed: ReadonlyArray<Placed>,
      ) {
        const dir = film.paths.dir;
        const films = path.dirname(dir);
        const reads = new Map<string, Read>();
        const located = yield* sources.locate(film.paths.name);
        const sceneFiles = new Set([...located.sites.values()].map((s) => s.file));
        const registry = path.join(dir, 'scenes', 'index.ts');
        const engines = yield* Effect.forEach(
          ['@manna/film/player', '@manna/film/render'],
          (spec) => workspace(spec, path.join(dir, 'film.ts')),
        );
        const frame = yield* closure(
          [path.join(dir, 'film.ts'), registry, ...engines.flatMap(Option.toArray)],
          (from, to) => from === registry && sceneFiles.has(to),
          reads,
        );
        const own = (id: string) =>
          Option.match(Option.fromUndefinedOr(located.sites.get(id)), {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (site) => closure([site.file], () => false, reads),
          });
        const digest = (files: ReadonlyArray<string>) =>
          Arr.dedupe(files)
            .flatMap((file) =>
              Option.toArray(
                Option.map(
                  Option.fromUndefinedOr(reads.get(file)),
                  (read) => [path.relative(films, file), read.hash] as const,
                ),
              ),
            )
            .toSorted(([a], [b]) => a.localeCompare(b));
        const keys = new Map<string, string>();
        const beats = new Map<string, string>();
        for (const p of placed) {
          const mine = yield* own(p.spec.id);
          const before = Option.fromUndefinedOr(placed[p.index - 1]);
          const entered = Option.filter(before, () =>
            Option.exists(Option.fromUndefinedOr(p.spec.enter), (enter) => enter.kind !== 'cut'),
          );
          const drawn = yield* Option.match(entered, {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (prev) => own(prev.spec.id),
          });
          const files = digest([...frame, ...mine]);
          const timing = Rec.get(film.timings.scenes, p.spec.id);
          keys.set(
            p.spec.id,
            sha256Hex(
              yield* Schema.encodeEffect(SceneKeyInput)({
                files,
                entered: digest(drawn),
                beat: p.spec,
                timing,
                voice: film.timings.voice,
                start: p.start,
                dur: p.dur,
              }),
            ),
          );
          beats.set(
            p.spec.id,
            sha256Hex(
              yield* Schema.encodeEffect(BeatKeyInput)({
                files,
                entered: digest(drawn),
                enteredBeat: Option.map(entered, (prev) => ({
                  beat: prev.spec,
                  timing: Rec.get(film.timings.scenes, prev.spec.id),
                  dur: prev.dur,
                })),
                beat: p.spec,
                timing,
                voice: film.timings.voice,
                dur: p.dur,
              }),
            ),
          );
        }
        return { commit: yield* commitAt(dir), keys, beats } satisfies SceneKeys;
      });

      return Stamps.of({ scenes });
    }),
  );
}
