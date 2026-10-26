import type { Database } from 'bun:sqlite';
import { Effect } from 'effect';

import { WebsterError } from './model.js';
import { WEBSTER_SCHEMA_VERSION, WEBSTER_SOURCE } from './source.js';

export const websterMetadata = (db: Database): ReadonlyMap<string, string> =>
  new Map(
    db
      .query<{ key: string; value: string }, []>('SELECT key, value FROM meta')
      .all()
      .map((row) => [row.key, row.value]),
  );

/** Cheap reader check. Full census and integrity run before installation. */
export const checkWebsterSchema = Effect.fn('Webster.checkSchema')(function* (db: Database) {
  const meta = yield* Effect.try({
    try: () => {
      const values = websterMetadata(db);
      db.query('SELECT id, headword, key, source_html, definition FROM entries LIMIT 0').all();
      db.query('SELECT rowid FROM entries_fts WHERE entries_fts MATCH ? LIMIT 0').all(
        'definition : "webster"',
      );
      return values;
    },
    catch: (cause) =>
      WebsterError.make({
        operation: 'schema',
        message:
          'Unreadable Webster database. Rebuild with bun run build:webster, then run manna init --force.',
        cause,
      }),
  });
  if (
    meta.get('schema_version') !== WEBSTER_SCHEMA_VERSION ||
    meta.get('edition') !== WEBSTER_SOURCE.edition
  )
    return yield* WebsterError.make({
      operation: 'schema',
      message:
        'Unsupported Webster schema or edition. Rebuild with bun run build:webster, then run manna init --force.',
    });
  return meta;
});
