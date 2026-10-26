// `film cache <film>` over a project folder in memory: it prints the cache's
// size and segment count; `--prune` deletes the segments no render used for
// `--days` (7), `--dry-run` only names them, `--json` prints one line, and a
// flag that means something only with `--prune` is refused without it. A
// prune while a render holds the cache, or with `--days 0` on a cache no
// render has recorded, is refused and deletes nothing.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import {
  Cause,
  ConfigProvider,
  Console,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  References,
  Schema,
} from 'effect';
import * as Command from 'effect/cli/Command';
import { TestClock } from 'effect/testing';
import { cache } from './cache-cli.ts';
import { CacheBusy, CacheUnrecorded, FlagsConflict } from './errors.ts';
import { FilmFolder } from './film-repo.ts';
import { memoryFileSystem, memoryLocks, printingTo, text } from './host/testing.ts';
import { recordRender, tryHoldCache } from './segment-cache.ts';
import { keepSegment } from './segments.ts';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const folder = '/out/f/cache/segments';

/** The film `f` under `/films`, its outputs under `/out`, over `files`. */
const over = (files: Map<string, Uint8Array>) => {
  files.set('/films/f/scenes/index.ts', text('export default []'));
  return FilmFolder.layer('/films').pipe(
    Layer.provideMerge([
      memoryFileSystem(files),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out' })),
    ]),
  );
};

/** Segment `key` kept, a chunk of `bytes`, last used `daysAgo` days before NOW. */
const kept = (key: string, daysAgo: number, bytes: number) =>
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

/** Three segments: one unused for ten days, one for three, one the newest render's. */
const stocked = Effect.gen(function* () {
  yield* TestClock.setTime(NOW);
  yield* kept('old', 10, 1000);
  yield* kept('week', 3, 2000);
  yield* kept('newest', 0, 4000);
  yield* recordRender('/out/f', '/out/f/film/main.mp4', NOW, ['newest']);
});

/** `film cache …args` run to its end: its exit, and the lines it printed. */
const cli = (...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Command.runWith(cache, { version: '0' })(args).pipe(
      Effect.provideService(Console.Console, printingTo(lines)),
      Effect.provideService(References.MinimumLogLevel, 'None'),
      Effect.exit,
    );
    return { exit, lines: yield* Queue.clear(lines) };
  });

/** The segment folders left, by key. */
const left = (files: Map<string, Uint8Array>) =>
  [
    ...new Set(
      [...files.keys()]
        .filter((f) => f.startsWith(`${folder}/`))
        .map((f) => f.slice(folder.length + 1).split('/')[0]),
    ),
  ].toSorted();

const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

describe('film cache', () => {
  it.effect('prints the cache’s segment count and size, and deletes nothing', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* stocked;
      const { exit, lines } = yield* cli('f');
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^cache film=f segments=3 drawing=0 bytes=7\d{3} size=0\.0MB$/);
      expect(left(files)).toEqual(['newest', 'old', 'week']);
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
  });

  it.effect('--prune deletes the segments unused past 7 days, and prints what it freed', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* stocked;
      const { lines } = yield* cli('f', '--prune');
      expect(lines[1]).toMatch(/^cache\.removed key=old bytes=1\d{3} used=/);
      expect(lines[2]).toMatch(
        /^cache\.pruned count=1 freed=1\d{3} size=0\.0MB days=7 dry_run=false left=2$/,
      );
      expect(left(files)).toEqual(['newest', 'week']);
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
  });

  it.effect('--prune --days 0 keeps only the newest render’s', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* stocked;
      yield* cli('f', '--prune', '--days', '0');
      expect(left(files)).toEqual(['newest']);
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
  });

  it.effect(
    '--dry-run names what it would delete, as JSON with --json, and deletes nothing',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        yield* stocked;
        const { lines } = yield* cli('f', '--prune', '--days', '0', '--dry-run', '--json');
        expect(lines).toHaveLength(1);
        const json = parsed(lines[0]);
        expect(json).toMatchObject({
          film: 'f',
          segments: 3,
          drawing: 0,
          pruned: { days: 0, dryRun: true },
        });
        expect(
          (json as { pruned: { removed: ReadonlyArray<{ key: string }> } }).pruned.removed.map(
            (s) => s.key,
          ),
        ).toEqual(['old', 'week']);
        expect(left(files)).toEqual(['newest', 'old', 'week']);
      }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
    },
  );

  for (const args of [['--days', '0'], ['--dry-run']])
    it.effect(`refuses ${args[0]} without --prune, before it reads the cache`, () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        yield* stocked;
        const { exit, lines } = yield* cli('f', ...args);
        const failed = Exit.match(exit, {
          onSuccess: Option.none,
          onFailure: Cause.findErrorOption,
        });
        expect(Option.getOrUndefined(Option.filter(failed, Schema.is(FlagsConflict)))?.other).toBe(
          'prune',
        );
        expect(lines).toEqual([]);
        expect(left(files)).toEqual(['newest', 'old', 'week']);
      }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
    });

  it.effect(
    '--prune while a render holds the cache fails with CacheBusy, and deletes nothing',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        yield* stocked;
        const { exit, lines } = yield* Effect.scoped(
          Effect.andThen(tryHoldCache('/out/f'), cli('f', '--prune', '--days', '0')),
        );
        const failed = Exit.match(exit, {
          onSuccess: Option.none,
          onFailure: Cause.findErrorOption,
        });
        expect(failed).toEqual(Option.some(CacheBusy.make({ folder: '/out/f/cache' })));
        expect(String(Option.getOrUndefined(failed))).toContain(
          'a render of the film holds its cache',
        );
        expect(lines).toEqual([]);
        expect(left(files)).toEqual(['newest', 'old', 'week']);
      }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
    },
  );

  it.effect(
    '--prune --days 0 on a cache no render recorded is refused, and deletes nothing',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        yield* TestClock.setTime(NOW);
        yield* kept('a', 0, 10);
        yield* kept('b', 1, 10);
        const { exit } = yield* cli('f', '--prune', '--days', '0');
        const failed = Exit.match(exit, {
          onSuccess: Option.none,
          onFailure: Cause.findErrorOption,
        });
        expect(Option.filter(failed, Schema.is(CacheUnrecorded))).toEqual(
          Option.some(CacheUnrecorded.make({ folder })),
        );
        expect(left(files)).toEqual(['a', 'b']);
      }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
    },
  );
});
