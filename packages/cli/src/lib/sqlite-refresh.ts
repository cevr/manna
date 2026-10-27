import { Effect, FileSystem, Option, Schema } from 'effect';

export class SqliteRefreshRefused extends Schema.TaggedError<SqliteRefreshRefused>()(
  'SqliteRefreshRefused',
  { destination: Schema.String, message: Schema.String },
) {}

// The installer's structured operation survives even if the writer checkpoints
// between activation refusal and the CLI's optional-error boundary.
const activationWalRefusal = Schema.is(
  Schema.TaggedStruct('CorpusInstallationError', {
    cause: Schema.TaggedStruct('FileArtifactStoreError', {
      operation: Schema.Literal('activate-destination-wal'),
    }),
  }),
);

const refusal = (destination: string, reason: string) =>
  SqliteRefreshRefused.make({
    destination,
    message: `Refusing to replace ${destination}: ${destination}-wal ${reason}. Replacement could replay the outgoing WAL and corrupt data. Close the database-using program and let that program/SQLite checkpoint cleanly, then retry.`,
  });

/** Inspect metadata only. The outgoing database and its side files belong to SQLite. */
export const checkSqliteRefresh = Effect.fn('Init.checkSqliteRefresh')(function* (
  destination: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const wal = `${destination}-wal`;
  const details = yield* fs.stat(wal).pipe(
    Effect.asSome,
    Effect.catch((cause) => {
      if (cause.reason._tag === 'NotFound') return Effect.succeedNone;
      return Effect.fail(
        SqliteRefreshRefused.make({
          destination,
          message: `Cannot inspect ${wal}; refresh refused. Close the database-using program and let SQLite checkpoint cleanly, then retry.`,
        }),
      );
    }),
  );
  if (Option.exists(details, (info) => info.size > 0n))
    return yield* refusal(destination, 'is non-empty');
});

/** Recheck failed staging too, so optional-source policies cannot hide a late WAL refusal. */
export const withSqliteRefresh = <A, E, R>(
  destination: string,
  refresh: boolean,
  operation: Effect.Effect<A, E, R>,
) => {
  if (!refresh) return operation;
  return checkSqliteRefresh(destination).pipe(
    Effect.andThen(
      operation.pipe(
        Effect.tapError((error) => {
          if (activationWalRefusal(error))
            return Effect.fail(
              refusal(destination, 'was non-empty or could not be inspected before activation'),
            );
          return checkSqliteRefresh(destination);
        }),
      ),
    ),
  );
};
