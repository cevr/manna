import { Cache, Data, type Effect } from 'effect';
import { cacheKey } from './digest.ts';
import { keptWhenMade } from './film-repo.ts';

/** A file as it stands: its path and its modification time (ms), the key of what is read or made from it. */
export class AtMtime extends Data.Class<{ readonly file: string; readonly mtime: number }> {}

/**
 * A cache of what `lookup` reads from a file, by the file as it stands, the
 * newest `capacity` kept: kept for good once read, a failed read not at all
 * (`keptWhenMade`).
 */
export const fileCache = <A, E, R>(
  lookup: (at: AtMtime) => Effect.Effect<A, E, R>,
  capacity: number,
): Effect.Effect<Cache.Cache<AtMtime, A, E>, never, R> =>
  Cache.makeWith(lookup, { capacity, timeToLive: keptWhenMade });

/** A cache file's name for what is made from the file `at` with `rest` (a time, a width): its path and mtime first. */
export const madeFromName = (at: AtMtime, rest: ReadonlyArray<string | number>): string =>
  cacheKey([at.file, at.mtime, ...rest]);
