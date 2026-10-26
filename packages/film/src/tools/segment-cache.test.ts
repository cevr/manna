// A film's render cache pruned: each segment no render used for the days
// given and no render's record names goes, for good; one the pruning render
// used, one a record names, a folder a render is still drawing (no record)
// and everything outside the segments folder stay. `--days 0` keeps exactly
// what the records name, and is refused on a cache with none. A prune by
// hand is refused while a render holds the cache, and nothing is read or
// deleted through a link. Explicit times, over a project folder in memory,
// and on disk where a link must be real.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Cause, Effect, Exit, FileSystem, Option, Path, Schema, type Scope } from 'effect';
import { CacheBusy, CacheEscapes, CacheUnrecorded } from './errors.ts';
import { memoryFileSystem, memoryManifestLock, text } from './host/testing.ts';
import { ManifestLock } from './manifest-lock.ts';
import {
  type PruneRule,
  pruneHeld,
  pruneIdle,
  readCache,
  recordRender,
  tryHoldCache,
} from './segment-cache.ts';
import { keepSegment, reuseSegment } from './segments.ts';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const out = '/out/f';
const folder = `${out}/cache/segments`;

/** Segment `key` kept whole under `segments`, `bytes` in its one chunk, last used `daysAgo` days before NOW. */
const kept = (key: string, daysAgo: number, bytes = 100, segments = folder) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(`${segments}/${key}`, { recursive: true });
    yield* fs.writeFile(`${segments}/${key}/0-10.mp4`, new Uint8Array(bytes));
    yield* keepSegment(
      fs,
      path,
      segments,
      key,
      [{ from: 0, to: 10, share: false }],
      NOW - daysAgo * DAY,
    );
  });

/** The rule at NOW: unused past 7 days, keeping none, unless `rule` says otherwise. */
const ruleOf = (rule: Partial<PruneRule>): PruneRule => ({
  now: NOW,
  days: 7,
  keep: new Set(),
  ...rule,
});

/** `film cache --prune` on the film at `at` (`/out/f`, unless given). */
const prune = (rule: Partial<PruneRule> = {}, dry = false, at = out) =>
  pruneIdle(at, ruleOf(rule), dry);

/** The segment folders left under the segments folder, by key. */
const left = (files: Map<string, Uint8Array>) =>
  [
    ...new Set(
      [...files.keys()]
        .filter((f) => f.startsWith(`${folder}/`))
        .map((f) => f.slice(folder.length + 1).split('/')[0]),
    ),
  ].toSorted();

/** Over `files` in memory, its locks in memory and shared by everything the test runs. */
const over =
  (files: Map<string, Uint8Array>, mtimes: ReadonlyMap<string, number> = new Map()) =>
  <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    effect.pipe(
      Effect.provideService(ManifestLock, memoryManifestLock()),
      Effect.provide([memoryFileSystem(files, new Set(), mtimes), Path.layer]),
    );

/** The typed failure a run ended with, if it failed. */
const failure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.match(exit, { onSuccess: () => Option.none<E>(), onFailure: Cause.findErrorOption });

describe('pruning a film’s render cache', () => {
  it.effect(
    'deletes one unused past the days, its whole folder, and keeps one used within them',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        yield* kept('old', 8, 300);
        yield* kept('recent', 6);
        const pruned = yield* prune();
        expect(pruned.removed.map((s) => s.key)).toEqual(['old']);
        expect(pruned.freed).toBeGreaterThan(300);
        expect(left(files)).toEqual(['recent']);
      }).pipe(over(files));
    },
  );

  it.effect('keeps a segment the pruning render used, however old its mark', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('used', 30);
      yield* kept('unused', 30);
      const pruned = yield* prune({ keep: new Set(['used']) });
      expect(pruned.removed.map((s) => s.key)).toEqual(['unused']);
      expect(left(files)).toEqual(['used']);
    }).pipe(over(files));
  });

  it.effect('keeps a segment a render’s record names, however old its mark', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('final', 30);
      yield* kept('draft', 30);
      yield* recordRender(out, '/out/f/film/main.mp4', NOW - 30 * DAY, ['final']);
      expect((yield* prune()).removed.map((s) => s.key)).toEqual(['draft']);
      expect(left(files)).toEqual(['final']);
    }).pipe(over(files));
  });

  it.effect('with 0 days keeps exactly what the newest render of each file used', () => {
    const files = new Map<string, Uint8Array>();
    const record = (key: string) => `${folder}/${key}/segment.json`;
    // a and b written before renders marked them, a millisecond apart.
    const mtimes = new Map([
      [record('a'), NOW - 2],
      [record('b'), NOW - 1],
    ]);
    return Effect.gen(function* () {
      for (const key of ['a', 'b']) files.set(record(key), text('{"chunks":[]}'));
      yield* kept('act', 0);
      yield* kept('earlier', 0);
      yield* kept('stray', 0);
      yield* recordRender(out, '/out/f/film/main.mp4', NOW - 10, ['earlier', 'a']);
      // The film rendered again: its record now names what this render used.
      yield* recordRender(out, '/out/f/film/main.mp4', NOW, ['a', 'b']);
      yield* recordRender(out, '/out/f/acts/one/main.mp4', NOW, ['act']);
      const pruned = yield* prune({ days: 0 });
      expect(pruned.removed.map((s) => s.key)).toEqual(['earlier', 'stray']);
      expect(left(files)).toEqual(['a', 'act', 'b']);
    }).pipe(over(files, mtimes));
  });

  it.effect('with 0 days on a cache no render has recorded refuses, and deletes nothing', () => {
    const record = (key: string) => `${folder}/${key}/segment.json`;
    const files = new Map([
      [record('a'), text('{"chunks":[]}')],
      [record('b'), text('{"chunks":[]}')],
    ]);
    const mtimes = new Map([
      [record('a'), NOW - 2],
      [record('b'), NOW - 1],
    ]);
    return Effect.gen(function* () {
      const failed = failure(yield* Effect.exit(prune({ days: 0 })));
      expect(Option.filter(failed, Schema.is(CacheUnrecorded))).toEqual(
        Option.some(CacheUnrecorded.make({ folder })),
      );
      expect(left(files)).toEqual(['a', 'b']);
    }).pipe(over(files, mtimes));
  });

  it.effect('leaves a folder with no record, one a render is drawing, and counts it', () => {
    const files = new Map<string, Uint8Array>([[`${folder}/drawing/0-10.mp4`, new Uint8Array(50)]]);
    return Effect.gen(function* () {
      yield* kept('newest', 0);
      yield* recordRender(out, '/out/f/film/main.mp4', NOW, ['newest']);
      const pruned = yield* prune({ days: 0 });
      expect(pruned.removed).toEqual([]);
      expect(pruned.found.drawing).toEqual([{ key: 'drawing', bytes: 50 }]);
      expect(left(files)).toEqual(['drawing', 'newest']);
    }).pipe(over(files));
  });

  it.effect('touches nothing outside the segments folder, nor a file in it', () => {
    const outside = [
      '/out/f/cache/other/segment.json',
      '/out/f/cache/old.mp4',
      '/out/f/film/main.mp4',
      `${folder}/notes.txt`,
    ];
    const files = new Map(outside.map((f) => [f, text('{"chunks":[],"used":0}')]));
    const mtimes = new Map(outside.map((f) => [f, 0]));
    return Effect.gen(function* () {
      yield* kept('old', 30);
      yield* kept('newest', 0);
      yield* recordRender(out, '/out/f/film/main.mp4', NOW, ['newest']);
      const pruned = yield* prune({ days: 0 });
      expect(pruned.removed.map((s) => s.key)).toEqual(['old']);
      for (const f of outside) expect(files.has(f)).toBe(true);
    }).pipe(over(files, mtimes));
  });

  it.effect('dry, names what it would delete and deletes nothing', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('old', 8);
      yield* kept('newest', 0);
      const pruned = yield* prune({}, true);
      expect(pruned.removed.map((s) => s.key)).toEqual(['old']);
      expect(left(files)).toEqual(['newest', 'old']);
    }).pipe(over(files));
  });

  it.effect('reads a record with no mark by its file’s mtime', () => {
    const record = (key: string) => `${folder}/${key}/segment.json`;
    const files = new Map([
      [record('stale'), text('{"chunks":[]}')],
      [record('fresh'), text('{"chunks":[]}')],
    ]);
    const mtimes = new Map([
      [record('stale'), NOW - 10 * DAY],
      [record('fresh'), NOW - DAY],
    ]);
    return Effect.gen(function* () {
      const found = yield* readCache(out);
      expect(found.segments.map((s) => [s.key, s.used])).toEqual([
        ['fresh', NOW - DAY],
        ['stale', NOW - 10 * DAY],
      ]);
      expect((yield* prune()).removed.map((s) => s.key)).toEqual(['stale']);
    }).pipe(over(files, mtimes));
  });

  it.effect('finds nothing in a film that has no cache', () =>
    Effect.gen(function* () {
      const pruned = yield* prune();
      expect(pruned).toEqual({ found: { segments: [], drawing: [] }, removed: [], freed: 0 });
    }).pipe(over(new Map())),
  );

  it.effect(
    'never moves a mark back: a render that began earlier and reuses later leaves the later mark',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* kept('shared', 0);
        yield* reuseSegment(fs, path, folder, 'shared', NOW + 5);
        yield* reuseSegment(fs, path, folder, 'shared', NOW + 1);
        expect((yield* readCache(out)).segments.map((s) => s.used)).toEqual([NOW + 5]);
      }).pipe(over(files));
    },
  );

  it.effect('by hand is refused while a render holds the cache, and deletes nothing', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('old', 30);
      const busy = yield* Effect.scoped(
        Effect.gen(function* () {
          expect(yield* tryHoldCache(out)).toBe(true);
          return failure(yield* Effect.exit(prune()));
        }),
      );
      expect(busy).toEqual(Option.some(CacheBusy.make({ folder: '/out/f/cache' })));
      expect(left(files)).toEqual(['old']);
      // Let go, the cache is pruned.
      expect((yield* prune()).removed.map((s) => s.key)).toEqual(['old']);
    }).pipe(over(files));
  });
});

describe('pruning a film’s render cache through a link', () => {
  /** A film's outputs under a temp folder, and a folder elsewhere holding an old segment and a sentinel. */
  const linked = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const film = path.join(root, 'out', 'f');
    const elsewhere = path.join(root, 'elsewhere');
    yield* fs.makeDirectory(film, { recursive: true });
    yield* kept('old', 30, 100, elsewhere);
    yield* fs.writeFileString(path.join(elsewhere, 'sentinel.txt'), 'keep me');
    return { fs, path, film, elsewhere };
  });

  /** What the prune failed with, and whether the old segment and the sentinel elsewhere are still there. */
  const pruneThrough = (film: string, elsewhere: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exit = yield* Effect.exit(prune({ days: 7 }, false, film));
      return {
        escaped: Option.isSome(Option.filter(failure(exit), Schema.is(CacheEscapes))),
        old: yield* fs.exists(`${elsewhere}/old/segment.json`),
        sentinel: yield* fs.exists(`${elsewhere}/sentinel.txt`),
      };
    });

  const onDisk = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>,
  ) =>
    effect.pipe(
      Effect.scoped,
      Effect.provideService(ManifestLock, memoryManifestLock()),
      Effect.provide(BunServices.layer),
    );

  it.live('refuses a segments folder that is a link, and deletes nothing it leads to', () =>
    Effect.gen(function* () {
      const { fs, film, elsewhere } = yield* linked;
      yield* fs.makeDirectory(`${film}/cache`);
      yield* fs.symlink(elsewhere, `${film}/cache/segments`);
      expect(yield* pruneThrough(film, elsewhere)).toEqual({
        escaped: true,
        old: true,
        sentinel: true,
      });
    }).pipe(onDisk),
  );

  it.live('refuses a cache folder that is a link', () =>
    Effect.gen(function* () {
      const { fs, path, film, elsewhere } = yield* linked;
      const cache = path.join(path.dirname(elsewhere), 'cache-elsewhere');
      yield* fs.makeDirectory(cache);
      yield* fs.symlink(elsewhere, path.join(cache, 'segments'));
      yield* fs.symlink(cache, `${film}/cache`);
      expect(yield* pruneThrough(film, elsewhere)).toEqual({
        escaped: true,
        old: true,
        sentinel: true,
      });
    }).pipe(onDisk),
  );

  it.live('refuses a segment that is a link, and deletes nothing it leads to', () =>
    Effect.gen(function* () {
      const { fs, film, elsewhere } = yield* linked;
      yield* fs.makeDirectory(`${film}/cache/segments`, { recursive: true });
      yield* fs.symlink(`${elsewhere}/old`, `${film}/cache/segments/old`);
      expect(yield* pruneThrough(film, elsewhere)).toEqual({
        escaped: true,
        old: true,
        sentinel: true,
      });
    }).pipe(onDisk),
  );

  it.live('prunes a real cache on disk', () =>
    Effect.gen(function* () {
      const { fs, film } = yield* linked;
      yield* kept('old', 30, 100, `${film}/cache/segments`);
      expect((yield* prune({}, false, film)).removed.map((s) => s.key)).toEqual(['old']);
      expect(yield* fs.exists(`${film}/cache/segments/old`)).toBe(false);
    }).pipe(onDisk),
  );
});

// A segment pruned by a render runs holding the cache (`pruneHeld`): its own hold is not refused.
describe('pruning held', () => {
  it.effect('runs while the caller holds the cache', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('old', 30);
      const pruned = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* tryHoldCache(out);
          return yield* pruneHeld(out, ruleOf({}), false);
        }),
      );
      expect(pruned.removed.map((s) => s.key)).toEqual(['old']);
    }).pipe(over(files));
  });
});
