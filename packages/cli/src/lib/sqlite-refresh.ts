import { Effect, FileSystem } from 'effect';
import { checkSqliteRefresh } from '@manna/core/corpus-supply/bun';

export const withSqliteRefresh = <A, E, R>(
  destination: string,
  refresh: boolean,
  operation: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (refresh || !(yield* fs.exists(destination))) yield* checkSqliteRefresh(destination);
    return yield* operation;
  });
