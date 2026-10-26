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
// - A render, once done, records the keys it used, one record for each file
//   it writes (`renders/<id>.json`, `recordRender`), so the newest render of
//   each file is known by what it wrote, never guessed from times.
// - A segment goes when no render used it for the days given and no record
//   names it; `--days 0` keeps exactly what the records name, and is refused
//   on a cache no render has recorded (`CacheUnrecorded`).
// - Every read and delete goes through the segments folder's real path,
//   proven to be `<out>/cache/segments` itself, and each segment's, proven
//   to be its own folder in it: a link is refused (`CacheEscapes`), never
//   followed. A folder is deleted whole, and a link inside it is deleted as
//   a link, never through.

import { Boolean as Bool, Effect, FileSystem, Option, Path, Schema, type Scope } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { isSegment } from '../core/segment.ts';
import { writeWhole } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { CacheBusy, CacheEscapes, CacheUnrecorded } from './errors.ts';
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

/** The film's cache lock file: `.segments.lock` in its cache folder (`lockFile`). */
const lockOf = (path: Path.Path, out: string) => path.join(cacheOf(path, out), 'segments');

/** Where the renders' records are kept: `cache/renders/`. */
const rendersOf = (path: Path.Path, out: string) => path.join(cacheOf(path, out), 'renders');

/**
 * Whether the film's cache is now held, let go when the scope closes (the
 * render's or the prune's: done, failed or interrupted): false, tried once,
 * while another holder (of this process or any other) has it.
 */
export const tryHoldCache = (
  out: string,
): Effect.Effect<boolean, PlatformError, Scope.Scope | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(cacheOf(path, out), { recursive: true });
    const lock = yield* ManifestLock;
    const held = yield* Effect.acquireRelease(lock.take(lockOf(path, out)), (release) =>
      Option.getOrElse(release, () => Effect.void),
    );
    return Option.isSome(held);
  });

/** The film's cache held as `tryHoldCache` holds it, tried every CACHE_WAIT until it is free. */
const waitForCache = (
  out: string,
): Effect.Effect<void, PlatformError, Scope.Scope | FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(tryHoldCache(out), (held) =>
    Bool.match(held, {
      onTrue: () => Effect.void,
      onFalse: () => Effect.andThen(Effect.sleep(CACHE_WAIT), waitForCache(out)),
    }),
  );

/** The film's cache held for the scope, waiting while another render holds it (`render.cache.waiting`, once). */
export const holdCache = (
  out: string,
): Effect.Effect<void, PlatformError, Scope.Scope | FileSystem.FileSystem | Path.Path> =>
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

/** The bytes of every file at or under `dir`. */
const bytesUnder = (fs: FileSystem.FileSystem, path: Path.Path, dir: string) =>
  Effect.gen(function* () {
    const names = yield* fs.readDirectory(dir, { recursive: true });
    const sizes = yield* Effect.forEach(names, (name) =>
      Effect.map(fs.stat(path.join(dir, name)), (info) => {
        if (info.type !== 'File') return 0;
        return Number(info.size);
      }),
    );
    return sizes.reduce((sum, n) => sum + n, 0);
  });

/** `dir` as it is on disk, refused when its real path is another (a link, or a folder through one). */
const ownPath = (fs: FileSystem.FileSystem, dir: string, own: string) =>
  Effect.gen(function* () {
    const real = yield* fs.realPath(dir);
    if (real !== own) return yield* CacheEscapes.make({ folder: dir, real });
    return real;
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
    const root = yield* ownPath(
      fs,
      folder,
      path.join(yield* fs.realPath(out), 'cache', 'segments'),
    );
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

/**
 * The render that wrote `target`, begun at `at`, recorded as having used
 * `keys`: `renders/<id>.json`, its id the hash of `target`, written whole
 * over the record of the render of that file before it.
 */
export const recordRender = (
  out: string,
  target: string,
  at: number,
  keys: ReadonlyArray<string>,
): Effect.Effect<void, PlatformError | Schema.SchemaError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = rendersOf(path, out);
    yield* fs.makeDirectory(dir, { recursive: true });
    const file = path.join(dir, `${sha256Hex(target).slice(0, 16)}.json`);
    const record = yield* Schema.encodeEffect(RenderRecordJson)({ target, at, keys });
    yield* writeWhole(fs, file, (partial) => fs.writeFileString(partial, record));
  });

/** The keys the renders' records name, and whether there is any record; one that does not read names none. */
const recorded = (out: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = rendersOf(path, out);
    if (!(yield* fs.exists(dir))) return { any: false, keys: new Set<string>() };
    const names = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith('.json'));
    const records = yield* Effect.forEach(names, (name) =>
      Effect.map(fs.readFileString(path.join(dir, name)), (text) =>
        Option.toArray(Schema.decodeOption(RenderRecordJson)(text)),
      ),
    );
    const read = records.flat();
    return { any: read.length > 0, keys: new Set(read.flatMap((r) => r.keys)) };
  });

/** What a prune keeps and removes by. */
export interface PruneRule {
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

/**
 * The film's segments pruned by `rule`, the caller holding its cache
 * (`holdCache`, or `pruneIdle`): each last used more than `days` before
 * `now`, in no render's record and not in `keep`, deleted for good, its
 * folder whole, as build output is. `days` 0 keeps exactly what the records
 * name, so it is refused on a cache with none (`CacheUnrecorded`). `dry`
 * removes nothing and answers what it would remove.
 */
export const pruneHeld = (
  out: string,
  rule: PruneRule,
  dry: boolean,
): Effect.Effect<
  Pruned,
  PlatformError | CacheEscapes | CacheUnrecorded,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { root, cache } = yield* scan(out);
    const named = yield* recorded(out);
    if (rule.days === 0 && !named.any && cache.segments.length > 0)
      return yield* CacheUnrecorded.make({ folder: segmentsFolder(out) });
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
): Effect.Effect<
  Pruned,
  PlatformError | CacheEscapes | CacheUnrecorded | CacheBusy,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (!dry && !(yield* tryHoldCache(out)))
        return yield* CacheBusy.make({ folder: cacheOf(path, out) });
      return yield* pruneHeld(out, rule, dry);
    }),
  );
