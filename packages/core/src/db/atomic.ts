import { Context, Effect, Layer } from 'effect';
import * as SqlClient from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';
import type * as Statement from 'effect/sql/Statement';

interface SqlAtomicService {
  readonly run: (
    statements: readonly Statement.Statement<unknown>[],
  ) => Effect.Effect<void, SqlError>;
}

export class SqlAtomic extends Context.Service<SqlAtomic, SqlAtomicService>()(
  '@manna/core/db/SqlAtomic',
) {
  static layerTransaction: Layer.Layer<SqlAtomic, never, SqlClient.SqlClient> = Layer.effect(
    SqlAtomic,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return SqlAtomic.of({
        run: (statements) =>
          sql.withTransaction(
            Effect.forEach(statements, (statement) => statement, { discard: true }),
          ),
      });
    }),
  );
}
