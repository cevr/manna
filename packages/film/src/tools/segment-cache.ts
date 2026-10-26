// A film's render cache as a whole, `out/<film>/cache`: the segments its
// renders keep (`segments/<key>/`, `segments.ts`), the lock over them, the
// record of what each render used, and the prune.
//
// - The lock (`.segments.lock` in `cache/`, a `ManifestLock`: the operating
//   system's, dropped when its process ends) is held by a render that keeps
//   segments from before it picks them until it is done, its prune included
//   (`holdCache`, waiting its turn), and by `film cache --prune`
//   (`pruneIdle`, refused while a render holds it). So no prune deletes a
//   segment a render reads or draws, and two renders of one film take turns.
// - Each video render records the keys it used for its lead file (its
//   master, else its share copy), none when it keeps no segments
//   (`renders/<id>.json`, `recordRender`). It removes the records of its
//   master's and its share copy's files before it replaces them
//   (`forgetRender`) and writes its own once done, so a record names what
//   the newest render of its file used, or the file has none.
// - A segment goes when no render used it for the days given and no record
//   names it, so a segment the newest render of an output used is kept at
//   every `--days`, past the age prune too, while that render's record names
//   it. `--days 0` keeps exactly what the records name. It is refused on a
//   cache no render has recorded (`CacheUnrecorded`), and while a video the
//   film's catalogue holds has no record (`CacheOutputUnrecorded`): which
//   segments its newest render used is then unknown.
// - The cache folder, the segments folder, each segment, each file in a
//   segment, each segment's record, the renders' records and the catalogue
//   are proven to be themselves, not links, before any is opened, read or
//   deleted, the cache folder before its lock is taken: a link is refused
//   (`CacheEscapes`), never followed. The lock refuses a lock file that is a
//   link itself (`manifest-lock-bun.ts`).

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

/** A day, in ms: `--days` counts in them. */
const DAY_MS = 86_400_000;

/** How many days a segment no render has used is kept, after each render and by default in `film cache --prune`. */
export const PRUNE_DAYS = 7;

/** How long a render waits between tries of a cache another render holds. */
const CACHE_WAIT = '500 millis';

/** The film's cache folder under its outputs `out`. */
const cacheOf = (path: Path.Path, out: string) => path.join(out, 'cache');

/** `file` refused when it is a link (`CacheEscapes`, naming where it leads): nothing is opened through one. */
const notLink = (fs: FileSystem.FileSystem, file: string) =>
  Effect.flatMap(Effect.option(fs.readLink(file)), (to) =>
    Option.match(to, {
      onNone: () => Effect.void,
      onSome: (real) => Effect.fail(CacheEscapes.make({ folder: file, real })),
    }),
  );

/** `dir` as it is on disk, refused when its real path is another (a link, or a folder through one). */
const ownPath = (fs: FileSystem.FileSystem, dir: string, own: string) =>
  Effect.gen(function* () {
    const real = yield* fs.realPath(dir);
    if (real !== own) return yield* CacheEscapes.make({ folder: dir, real });
    return real;
  });

/** `<out>/cache/<names>` as it must be on disk: under the real path of the film's outputs. */
const ownedPath = (fs: FileSystem.FileSystem, path: Path.Path, out: string, names: string) =>
  Effect.map(fs.realPath(out), (real) => path.join(real, 'cache', names));

/**
 * The film's cache folder, made when it is not there, proven to be
 * `<out>/cache` itself (no link, nor under one), and its real path.
 */
const ownCache = (fs: FileSystem.FileSystem, path: Path.Path, out: string) =>
  Effect.gen(function* () {
    yield* fs.makeDirectory(cacheOf(path, out), { recursive: true });
    const real = path.join(yield* fs.realPath(out), 'cache');
    return yield* ownPath(fs, cacheOf(path, out), real);
  });

/**
 * Whether the film's cache is now held, let go when the scope closes (the
 * render's or the prune's: done, failed or interrupted): false, tried once,
 * while another holder (of this process or any other) has it. The cache
 * folder is proven not a link before the lock is taken in it, and the lock
 * refuses a lock file that is one (`manifest-lock-bun.ts`).
 */
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

/** The film's cache held as `tryHoldCache` holds it, tried every CACHE_WAIT until it is free. */
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

/** The film's cache held for the scope, waiting while another render holds it (`render.cache.waiting`, once). */
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

/** A segment kept whole (its record written): its key, the bytes of its folder, and when a render last used it (ms). */
export interface CachedSegment {
  readonly key: string;
  readonly bytes: number;
  readonly used: number;
}

/** What a film's segments folder holds: each segment kept whole, and each folder with no record (a render drawing it). */
export interface SegmentCache {
  readonly segments: ReadonlyArray<CachedSegment>;
  readonly drawing: ReadonlyArray<{ readonly key: string; readonly bytes: number }>;
}

/** Every byte the cache holds, its kept segments and the folders still drawn. */
export const cacheBytes = (cache: SegmentCache): number =>
  [...cache.segments, ...cache.drawing].reduce((sum, s) => sum + s.bytes, 0);

/** The bytes of every file under the folder `dir`, a folder at a time: a link in it is refused, never followed. */
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

/** The cache as read from its real root: none when the film has no segments folder. */
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
        // Counted first: each file in the folder, its record too, is proven not a link before one is read.
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

/**
 * What the film's segments folder under its outputs `out` holds: each
 * folder in it by its name, a segment when its record is there, else one a
 * render is drawing. Nothing else in it (a file, a name no key could be) is
 * read; an absent folder holds nothing; a link is refused.
 */
export const readCache = (
  out: string,
): Effect.Effect<SegmentCache, PlatformError | CacheEscapes, FileSystem.FileSystem | Path.Path> =>
  Effect.map(scan(out), (s) => s.cache);

/** A render's record: the file it wrote, when it began, and the key of every segment it used. */
const RenderRecordJson = Schema.fromJsonString(
  Schema.Struct({ target: Schema.String, at: Schema.Finite, keys: Schema.Array(Schema.String) }),
);

/** The record of the render of `target` in the renders' folder `dir`: its id the hash of `target`. */
const recordFile = (path: Path.Path, dir: string, target: string) =>
  path.join(dir, `${sha256Hex(path.resolve(target)).slice(0, 16)}.json`);

/**
 * The render that wrote `target`, begun at `at`, recorded as having used
 * `keys` (none for a render that keeps no segments): `renders/<id>.json`,
 * written whole over the record of the render of that file before it.
 */
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
    const renders = path.join(yield* ownCache(fs, path, out), 'renders');
    yield* fs.makeDirectory(renders, { recursive: true });
    const dir = yield* ownPath(fs, renders, renders);
    const record = yield* Schema.encodeEffect(RenderRecordJson)({ target, at, keys });
    const file = recordFile(path, dir, target);
    yield* writeWhole(fs, file, (partial) => fs.writeFileString(partial, record));
  });

/**
 * The record of the render of `target` removed, before a render replaces
 * that file: until its new one is written, no prune keeps by what an older
 * render of it used, and `--days 0` is refused (`CacheOutputUnrecorded`).
 */
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

/** What the renders' records say: whether there is any, the keys they name, and the files they are of. */
interface Recorded {
  readonly any: boolean;
  readonly keys: ReadonlySet<string>;
  readonly targets: ReadonlySet<string>;
}

/** The renders' records, each proven not a link; one that does not read names nothing. */
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

/**
 * Each video the film's catalogue (`<out>/catalogue.json`, proven not a link)
 * holds, by the path of its lead file (its master, else its share copy: the
 * file its render's record is of); none without one.
 */
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

/** What a prune keeps and removes by. */
interface PruneRule {
  /** Now, in ms. */
  readonly now: number;
  /** A segment no render used for more than this many days before `now` goes. */
  readonly days: number;
  /** Keys never removed: the segments the render that prunes has just used. */
  readonly keep: ReadonlySet<string>;
}

/** A prune's work: the cache as it found it, and the segments it removed (or, dry, would remove). */
export interface Pruned {
  readonly found: SegmentCache;
  readonly removed: ReadonlyArray<CachedSegment>;
  readonly freed: number;
}

/** Why a prune refuses: a link, a cache with no record, a video with none. */
type PruneError =
  | PlatformError
  | Schema.SchemaError
  | CacheEscapes
  | CacheUnrecorded
  | CacheOutputUnrecorded;

/**
 * The film's segments pruned by `rule`, the caller holding its cache
 * (`holdCache`, or `pruneIdle`): each last used more than `days` before
 * `now`, in no render's record and not in `keep`, deleted for good, its
 * folder whole, as build output is. `days` 0 keeps exactly what the records
 * name, so it is refused on a cache with none (`CacheUnrecorded`) and while
 * a video the catalogue holds has none (`CacheOutputUnrecorded`). `dry`
 * removes nothing and answers what it would remove.
 */
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
      const first = Arr.head(unrecorded);
      if (Option.isSome(first)) return yield* CacheOutputUnrecorded.make({ output: first.value });
    }
    const before = rule.now - rule.days * DAY_MS;
    // With 0 days a segment's age does not count: the records alone keep.
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

/**
 * The film's segments pruned by `rule` (`pruneHeld`) once no render holds
 * its cache: refused (`CacheBusy`) while one does, so a prune by hand never
 * waits on a render, which prunes on its own once done. A dry run deletes
 * nothing and reads without the lock.
 */
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
