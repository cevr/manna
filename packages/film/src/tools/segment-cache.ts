import {
  Array as Arr,
  Boolean as Bool,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  type Scope,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { CatalogueJson } from '../core/catalogue.ts';
import { isSegment } from '../core/segment.ts';
import { CATALOGUE_FILE } from './catalogue.ts';
import { writeWhole } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { CacheBusy, CacheEscapes, CacheOutputUnrecorded, CacheUnrecorded } from './errors.ts';
import { ManifestLock } from './manifest-lock.ts';
import { isKept, lastUsed, segmentsFolder } from './segments.ts';

const DAY_MS = 86_400_000;

export const PRUNE_DAYS = 7;

const CACHE_WAIT = '500 millis';

const cacheOf = (path: Path.Path, out: string) => path.join(out, 'cache');

const notLink = (fs: FileSystem.FileSystem, file: string) =>
  Effect.flatMap(Effect.option(fs.readLink(file)), (to) =>
    Option.match(to, {
      onNone: () => Effect.void,
      onSome: (real) => Effect.fail(CacheEscapes.make({ folder: file, real })),
    }),
  );

const ownPath = (fs: FileSystem.FileSystem, dir: string, own: string) =>
  Effect.gen(function* () {
    const real = yield* fs.realPath(dir);
    if (real !== own) return yield* CacheEscapes.make({ folder: dir, real });
    return real;
  });

const ownedPath = (fs: FileSystem.FileSystem, path: Path.Path, out: string, names: string) =>
  Effect.map(fs.realPath(out), (real) => path.join(real, 'cache', names));

const ownCache = (fs: FileSystem.FileSystem, path: Path.Path, out: string) =>
  Effect.gen(function* () {
    yield* fs.makeDirectory(cacheOf(path, out), { recursive: true });
    const real = path.join(yield* fs.realPath(out), 'cache');
    return yield* ownPath(fs, cacheOf(path, out), real);
  });

const tryHoldCache = (
  out: string,
): Effect.Effect<
  boolean,
  PlatformError | CacheEscapes,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cache = yield* ownCache(fs, path, out);
    const lock = yield* ManifestLock;
    const held = yield* Effect.acquireRelease(lock.take(path.join(cache, 'segments')), (release) =>
      Option.getOrElse(release, () => Effect.void),
    );
    return Option.isSome(held);
  });

const waitForCache = (
  out: string,
): Effect.Effect<
  void,
  PlatformError | CacheEscapes,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> =>
  Effect.flatMap(tryHoldCache(out), (held) =>
    Bool.match(held, {
      onTrue: () => Effect.void,
      onFalse: () => Effect.andThen(Effect.sleep(CACHE_WAIT), waitForCache(out)),
    }),
  );

export const holdCache = (
  out: string,
): Effect.Effect<
  void,
  PlatformError | CacheEscapes,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (yield* tryHoldCache(out)) return;
    yield* Effect.log(`render.cache.waiting folder=${out}`);
    yield* waitForCache(out);
  });

export interface CachedSegment {
  readonly key: string;
  readonly bytes: number;
  readonly used: number;
}

export interface SegmentCache {
  readonly segments: ReadonlyArray<CachedSegment>;
  readonly drawing: ReadonlyArray<{ readonly key: string; readonly bytes: number }>;
}

export const cacheBytes = (cache: SegmentCache): number =>
  [...cache.segments, ...cache.drawing].reduce((sum, s) => sum + s.bytes, 0);

const bytesUnder = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<number, PlatformError | CacheEscapes> =>
  Effect.gen(function* () {
    const names = yield* fs.readDirectory(dir);
    const sizes = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* () {
        const entry = path.join(dir, name);
        yield* notLink(fs, entry);
        const info = yield* fs.stat(entry);
        if (info.type === 'Directory') return yield* bytesUnder(fs, path, entry);
        if (info.type !== 'File') return 0;
        return Number(info.size);
      }),
    );
    return sizes.reduce((sum, n) => sum + n, 0);
  });

interface Scanned {
  readonly root: Option.Option<string>;
  readonly cache: SegmentCache;
}

const scan = (
  out: string,
): Effect.Effect<Scanned, PlatformError | CacheEscapes, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = segmentsFolder(out);
    if (!(yield* fs.exists(folder)))
      return { root: Option.none(), cache: { segments: [], drawing: [] } };
    const root = yield* ownPath(fs, folder, yield* ownedPath(fs, path, out, 'segments'));
    const names = (yield* fs.readDirectory(root)).filter(isSegment).toSorted();
    const read = yield* Effect.forEach(names, (key) =>
      Effect.gen(function* () {
        const dir = yield* ownPath(fs, path.join(root, key), path.join(root, key));
        if ((yield* fs.stat(dir)).type !== 'Directory') return [];
        const bytes = yield* bytesUnder(fs, path, dir);
        if (!(yield* isKept(fs, path, root, key)))
          return [{ key, bytes, used: Option.none<number>() }];
        return [{ key, bytes, used: Option.some(yield* lastUsed(fs, path, root, key)) }];
      }),
    );
    const all = read.flat();
    return {
      root: Option.some(root),
      cache: {
        segments: all.flatMap((s) =>
          Option.toArray(Option.map(s.used, (used) => ({ ...s, used }))),
        ),
        drawing: all
          .filter((s) => Option.isNone(s.used))
          .map((s) => ({ key: s.key, bytes: s.bytes })),
      },
    };
  });

export const readCache = (
  out: string,
): Effect.Effect<SegmentCache, PlatformError | CacheEscapes, FileSystem.FileSystem | Path.Path> =>
  Effect.map(scan(out), (s) => s.cache);

const RenderRecordJson = Schema.fromJsonString(
  Schema.Struct({ target: Schema.String, at: Schema.Finite, keys: Schema.Array(Schema.String) }),
);

const recordFile = (path: Path.Path, dir: string, target: string) =>
  path.join(dir, `${sha256Hex(path.resolve(target)).slice(0, 16)}.json`);

const ownRenders = (fs: FileSystem.FileSystem, path: Path.Path, out: string) =>
  Effect.gen(function* () {
    const renders = path.join(yield* ownCache(fs, path, out), 'renders');
    yield* fs.makeDirectory(renders, { recursive: true });
    return yield* ownPath(fs, renders, renders);
  });

const writeRecord = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  record: { readonly target: string; readonly at: number; readonly keys: ReadonlyArray<string> },
) =>
  Effect.gen(function* () {
    const json = yield* Schema.encodeEffect(RenderRecordJson)(record);
    const file = recordFile(path, dir, record.target);
    yield* writeWhole(fs, file, (partial) => fs.writeFileString(partial, json));
  });

const keysOf = (fs: FileSystem.FileSystem, path: Path.Path, dir: string, target: string) =>
  Effect.gen(function* () {
    const file = recordFile(path, dir, target);
    yield* notLink(fs, file);
    if (!(yield* fs.exists(file))) return [];
    return Option.match(Schema.decodeOption(RenderRecordJson)(yield* fs.readFileString(file)), {
      onNone: () => [],
      onSome: (record) => record.keys,
    });
  });

export const recordRender = (
  out: string,
  target: string,
  at: number,
  keys: ReadonlyArray<string>,
): Effect.Effect<
  void,
  PlatformError | CacheEscapes | Schema.SchemaError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* writeRecord(fs, path, yield* ownRenders(fs, path, out), { target, at, keys });
  });

export const widenRecord = (
  out: string,
  target: string,
  others: ReadonlyArray<string>,
  at: number,
  keys: ReadonlyArray<string>,
): Effect.Effect<
  void,
  PlatformError | CacheEscapes | Schema.SchemaError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* ownRenders(fs, path, out);
    const before = yield* Effect.forEach([target, ...others], (file) =>
      keysOf(fs, path, dir, file),
    );
    yield* writeRecord(fs, path, dir, {
      target,
      at,
      keys: Arr.dedupe([...before.flat(), ...keys]),
    });
  });

export const forgetRender = (
  out: string,
  target: string,
): Effect.Effect<void, PlatformError | CacheEscapes, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const renders = path.join(cacheOf(path, out), 'renders');
    if (!(yield* fs.exists(renders))) return;
    const dir = yield* ownPath(fs, renders, yield* ownedPath(fs, path, out, 'renders'));
    yield* fs.remove(recordFile(path, dir, target), { force: true });
  });

interface Recorded {
  readonly any: boolean;
  readonly keys: ReadonlySet<string>;
  readonly targets: ReadonlySet<string>;
}

const recorded = (out: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const renders = path.join(cacheOf(path, out), 'renders');
    if (!(yield* fs.exists(renders))) {
      const none: Recorded = { any: false, keys: new Set(), targets: new Set() };
      return none;
    }
    const dir = yield* ownPath(fs, renders, yield* ownedPath(fs, path, out, 'renders'));
    const names = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith('.json'));
    const records = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* () {
        const file = path.join(dir, name);
        yield* notLink(fs, file);
        return Option.toArray(
          Schema.decodeOption(RenderRecordJson)(yield* fs.readFileString(file)),
        );
      }),
    );
    const read = records.flat();
    const found: Recorded = {
      any: read.length > 0,
      keys: new Set(read.flatMap((r) => r.keys)),
      targets: new Set(read.map((r) => path.resolve(r.target))),
    };
    return found;
  });

const cataloguedVideos = (out: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(out, CATALOGUE_FILE);
    yield* notLink(fs, file);
    if (!(yield* fs.exists(file))) return [];
    const catalogue = yield* Schema.decodeEffect(CatalogueJson)(yield* fs.readFileString(file));
    const clips = catalogue.renders
      .filter((render) => render.kind === 'video')
      .flatMap((render) =>
        Option.toArray(Option.orElse(render.files.clip, () => render.files.share)),
      );
    return Arr.dedupe(clips.map((clip) => path.resolve(out, clip)));
  });

interface PruneRule {
  readonly now: number;
  readonly days: number;
  readonly keep: ReadonlySet<string>;
}

export interface Pruned {
  readonly found: SegmentCache;
  readonly removed: ReadonlyArray<CachedSegment>;
  readonly freed: number;
}

type PruneError =
  | PlatformError
  | Schema.SchemaError
  | CacheEscapes
  | CacheUnrecorded
  | CacheOutputUnrecorded;

export const pruneHeld = (
  out: string,
  rule: PruneRule,
  dry: boolean,
): Effect.Effect<Pruned, PruneError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { root, cache } = yield* scan(out);
    const named = yield* recorded(out);
    if (rule.days === 0 && cache.segments.length > 0) {
      if (!named.any) return yield* CacheUnrecorded.make({ folder: segmentsFolder(out) });
      const unrecorded = (yield* cataloguedVideos(out)).filter((clip) => !named.targets.has(clip));
      if (Arr.isArrayNonEmpty(unrecorded))
        return yield* CacheOutputUnrecorded.make({ outputs: unrecorded });
    }
    const before = rule.now - rule.days * DAY_MS;
    const unused = (s: CachedSegment) => rule.days === 0 || s.used < before;
    const stale = cache.segments.filter(
      (s) => unused(s) && !rule.keep.has(s.key) && !named.keys.has(s.key),
    );
    const freed = stale.reduce((sum, s) => sum + s.bytes, 0);
    if (dry) return { found: cache, removed: stale, freed };
    for (const dir of Option.toArray(root))
      yield* Effect.forEach(stale, (s) => fs.remove(path.join(dir, s.key), { recursive: true }));
    return { found: cache, removed: stale, freed };
  });

export const pruneIdle = (
  out: string,
  rule: PruneRule,
  dry: boolean,
): Effect.Effect<Pruned, PruneError | CacheBusy, FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (!dry && !(yield* tryHoldCache(out)))
        return yield* CacheBusy.make({ folder: cacheOf(path, out) });
      return yield* pruneHeld(out, rule, dry);
    }),
  );
