import { Cache, Data, type Effect } from 'effect';
import { cacheKey } from './digest.ts';
import { keptWhenMade } from './film-repo.ts';

export class AtMtime extends Data.Class<{ readonly file: string; readonly mtime: number }> {}

export const fileCache = <A, E, R>(
  lookup: (at: AtMtime) => Effect.Effect<A, E, R>,
  capacity: number,
): Effect.Effect<Cache.Cache<AtMtime, A, E>, never, R> =>
  Cache.makeWith(lookup, { capacity, timeToLive: keptWhenMade });

export const madeFromName = (at: AtMtime, rest: ReadonlyArray<string | number>): string =>
  cacheKey([at.file, at.mtime, ...rest]);
