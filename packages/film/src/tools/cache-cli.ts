// `film cache <film>`: the film's render cache, the segments its renders keep
// to reuse (`out/<film>/cache/segments`, `segment-cache.ts`).
//
//   film cache <film>                                   its size and segment count
//   film cache <film> --prune [--days 7] [--dry-run]    delete the segments no render used for --days
//
// A render prunes the same way once it is done (PRUNE_DAYS). A segment a
// render's record names is kept, so `--days 0` keeps exactly the segments
// the newest render of each file used; on a cache no render has recorded it
// is refused. A prune while a render of the film holds its cache is refused
// (`CacheBusy`), not waited on: the render prunes once it is done, and a
// prune by hand never hangs. A folder a render is still drawing (no record
// yet) is counted and never removed, and nothing outside the segments folder
// is deleted, nor anything through a link. Deletes are for good: the cache
// is build output. `--json` prints one line of JSON in place of the lines.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { Boolean as Bool, Console, DateTime, Effect, Option, Schema } from 'effect';
import { FilmFolder, filmNamed } from './film-repo.ts';
import { type FlagRule, flagConflicts, givenFlags } from './render-plan.ts';
import {
  type CachedSegment,
  PRUNE_DAYS,
  type Pruned,
  type SegmentCache,
  cacheBytes,
  pruneIdle,
  readCache,
} from './segment-cache.ts';

const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const PRUNE = 'it says how --prune prunes';

/** Flags that mean something only with `--prune`. */
const CACHE_RULES: ReadonlyArray<FlagRule> = [
  ['days', 'needs', 'prune', PRUNE],
  ['dry-run', 'needs', 'prune', PRUNE],
];

/** Bytes as a line says them: `853.6MB`. */
const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)}MB`;

/** When a segment was last used, as an ISO time. */
const usedAt = (segment: CachedSegment) => DateTime.formatIso(DateTime.makeUnsafe(segment.used));

/** The cache as one line: its segments, the folders still drawn, and every byte. */
const cacheLine = (film: string, cache: SegmentCache) => {
  const bytes = cacheBytes(cache);
  return `cache film=${film} segments=${cache.segments.length} drawing=${cache.drawing.length} bytes=${bytes} size=${megabytes(bytes)}`;
};

/** A prune as lines: each segment removed (or, dry, that would be), then what it freed and what is left. */
const prunedLines = (pruned: Pruned, days: number, dry: boolean): ReadonlyArray<string> => {
  const verb = Bool.match(dry, {
    onTrue: () => 'cache.would-remove',
    onFalse: () => 'cache.removed',
  });
  const left = pruned.found.segments.length - pruned.removed.length;
  return [
    ...pruned.removed.map((s) => `${verb} key=${s.key} bytes=${s.bytes} used=${usedAt(s)}`),
    `cache.pruned count=${pruned.removed.length} freed=${pruned.freed} size=${megabytes(pruned.freed)} days=${days} dry_run=${dry} left=${left}`,
  ];
};

/** The cache, and the prune when there was one, as one JSON object. */
const cacheJson = (
  film: string,
  cache: SegmentCache,
  pruned: Option.Option<{ readonly pruned: Pruned; readonly days: number; readonly dry: boolean }>,
) => ({
  film,
  segments: cache.segments.length,
  drawing: cache.drawing.length,
  bytes: cacheBytes(cache),
  ...Option.match(pruned, {
    onNone: () => ({}),
    onSome: (p) => ({
      pruned: {
        days: p.days,
        dryRun: p.dry,
        removed: p.pruned.removed.map((s) => ({ key: s.key, bytes: s.bytes, used: usedAt(s) })),
        freed: p.pruned.freed,
      },
    }),
  }),
});

export const cache = Command.make(
  'cache',
  {
    film: Argument.String('film').pipe(
      Argument.withDescription('the film, a folder under src/films'),
    ),
    prune: Flag.Boolean('prune').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        `delete the segments no render has used for --days (${PRUNE_DAYS}), never one the newest render used`,
      ),
    ),
    days: Flag.Int('days').pipe(
      Flag.withSchema(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
      Flag.optional,
      Flag.withDescription(
        `with --prune: how many days unused a segment is kept (default ${PRUNE_DAYS}; 0 keeps only the newest render's)`,
      ),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('with --prune: print what it would delete, and delete nothing'),
    ),
    json: Flag.Boolean('json').pipe(
      Flag.withDefault(false),
      Flag.withDescription('print the cache, and the prune, as one line of JSON'),
    ),
  },
  Effect.fn('film.cache')(function* (input) {
    yield* Effect.fromResult(
      flagConflicts(
        givenFlags({
          prune: Option.liftPredicate(input.prune, Boolean),
          days: input.days,
          'dry-run': Option.liftPredicate(input.dryRun, Boolean),
        }),
        CACHE_RULES,
      ),
    );
    const film = yield* filmNamed(input.film);
    const out = (yield* FilmFolder).paths(film).out;
    const days = Option.getOrElse(input.days, () => PRUNE_DAYS);
    if (!input.prune) {
      const found = yield* readCache(out);
      if (input.json) return yield* Console.log(jsonOf(cacheJson(film, found, Option.none())));
      return yield* Console.log(cacheLine(film, found));
    }
    const now = yield* DateTime.now;
    const pruned = yield* pruneIdle(
      out,
      { now: DateTime.toEpochMillis(now), days, keep: new Set() },
      input.dryRun,
    );
    if (input.json)
      return yield* Console.log(
        jsonOf(cacheJson(film, pruned.found, Option.some({ pruned, days, dry: input.dryRun }))),
      );
    yield* Console.log(cacheLine(film, pruned.found));
    for (const line of prunedLines(pruned, days, input.dryRun)) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    "Print a film's render cache (its kept segments), and with --prune delete those no render has used for --days",
  ),
);
