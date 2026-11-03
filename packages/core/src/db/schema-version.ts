import { Effect } from 'effect';
import type * as SqlClient from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';

export const ensureSchemaVersionsTable = (
  sql: SqlClient.SqlClient,
): Effect.Effect<void, SqlError> =>
  sql
    .unsafe(
      `CREATE TABLE IF NOT EXISTS schema_versions (
         name TEXT PRIMARY KEY,
         version INTEGER NOT NULL
       )`,
    )
    .pipe(Effect.asVoid);

export const readSchemaVersion = (
  sql: SqlClient.SqlClient,
  name: string,
): Effect.Effect<number, SqlError> =>
  sql<{
    version: number;
  }>`SELECT version FROM schema_versions WHERE name = ${name}`.pipe(
    Effect.map((rows) => rows[0]?.version ?? 0),
  );

export const writeSchemaVersion = (
  sql: SqlClient.SqlClient,
  name: string,
  version: number,
): Effect.Effect<void, SqlError> =>
  sql`
    INSERT INTO schema_versions (name, version) VALUES (${name}, ${version})
    ON CONFLICT(name) DO UPDATE SET version = excluded.version
  `.pipe(Effect.asVoid);
