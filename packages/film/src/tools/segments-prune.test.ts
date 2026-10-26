// A film's kept segments pruned: each no render has used for the days given
// goes, for good; one the pruning render used, one the newest render used,
// a folder a render is still drawing (no record) and everything outside the
// segments folder stay. Explicit times over a project folder in memory.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';
import { memoryFileSystem, text } from './host/testing.ts';
import { keepSegment, pruneSegments, readCache } from './segments.ts';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const folder = '/out/f/cache/segments';

/** Segment `key` kept whole, `bytes` in its one chunk, last used `daysAgo` days before NOW. */
const kept = (key: string, daysAgo: number, bytes = 100) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(`${folder}/${key}`, { recursive: true });
    yield* fs.writeFile(`${folder}/${key}/0-10.mp4`, new Uint8Array(bytes));
    yield* keepSegment(
      fs,
      path,
      folder,
      key,
      [{ from: 0, to: 10, share: false }],
      NOW - daysAgo * DAY,
    );
  });

/** The film's segments pruned at NOW: unused past 7 days, keeping none, unless `rule` says otherwise. */
const prune = (
  rule: { readonly days?: number; readonly keep?: ReadonlySet<string> } = {},
  dry = false,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* pruneSegments(
      fs,
      path,
      folder,
      { now: NOW, days: 7, keep: new Set(), ...rule },
      dry,
    );
  });

/** The segment folders left under the segments folder, by key. */
const left = (files: Map<string, Uint8Array>) =>
  [
    ...new Set(
      [...files.keys()]
        .filter((f) => f.startsWith(`${folder}/`))
        .map((f) => f.slice(folder.length + 1).split('/')[0]),
    ),
  ].toSorted();

const over = (files: Map<string, Uint8Array>, mtimes: ReadonlyMap<string, number> = new Map()) =>
  Effect.provide([memoryFileSystem(files, new Set(), mtimes), Path.layer]);

describe('pruning a film’s segments', () => {
  it.effect(
    'deletes one unused past the days, its whole folder, and keeps one used within them',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        yield* kept('old', 8, 300);
        yield* kept('recent', 6);
        yield* kept('newest', 0);
        const pruned = yield* prune();
        expect(pruned.removed.map((s) => s.key)).toEqual(['old']);
        expect(pruned.freed).toBeGreaterThan(300);
        expect(left(files)).toEqual(['newest', 'recent']);
      }).pipe(over(files));
    },
  );

  it.effect('keeps a segment the pruning render used, however old its mark', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('used', 30);
      yield* kept('unused', 30);
      yield* kept('newest', 0);
      const pruned = yield* prune({ keep: new Set(['used']) });
      expect(pruned.removed.map((s) => s.key)).toEqual(['unused']);
      expect(left(files)).toEqual(['newest', 'used']);
    }).pipe(over(files));
  });

  it.effect('with 0 days keeps only the segments the newest render used', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('older', 1 / 24);
      yield* kept('a', 0);
      yield* kept('b', 0);
      const pruned = yield* prune({ days: 0 });
      expect(pruned.removed.map((s) => s.key)).toEqual(['older']);
      expect(left(files)).toEqual(['a', 'b']);
    }).pipe(over(files));
  });

  it.effect('never takes the newest render’s segments, however long ago it ran', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* kept('earlier', 40);
      yield* kept('last', 30);
      const pruned = yield* prune();
      expect(pruned.removed.map((s) => s.key)).toEqual(['earlier']);
      expect(left(files)).toEqual(['last']);
    }).pipe(over(files));
  });

  it.effect('leaves a folder with no record, one a render is drawing, and counts it', () => {
    const files = new Map<string, Uint8Array>([[`${folder}/drawing/0-10.mp4`, new Uint8Array(50)]]);
    return Effect.gen(function* () {
      yield* kept('newest', 0);
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
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const found = yield* readCache(fs, path, folder);
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
});
