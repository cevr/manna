import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Cause, Clock, Effect } from 'effect';
import { SqlClient } from 'effect/sql';

export interface WarmRequest {
  readonly filename: string;
  readonly mmapBytes: number;
}

export type WarmResult =
  | { readonly _tag: 'Warmed'; readonly postingsMs: number; readonly queryMs: number }
  | { readonly _tag: 'Failed'; readonly message: string };

const WARM_TERMS: readonly string[] = [
  'god',
  'lord',
  'jesus',
  'christ',
  'love',
  'heaven',
  'sabbath',
];

const warmThrough = (mmapBytes: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.unsafe(`PRAGMA mmap_size = ${String(mmapBytes)}`);
    const startedAt = yield* Clock.currentTimeMillis;
    yield* sql.unsafe(`SELECT count(*) FROM paragraphs_fts_data`);
    const postingsAt = yield* Clock.currentTimeMillis;
    for (const term of WARM_TERMS) {
      yield* sql.unsafe(`
        SELECT p.ref_code, p.nodes_json
        FROM paragraphs_fts fts
        JOIN paragraphs p ON p.rowid = fts.rowid
        JOIN books b ON p.book_id = b.book_id
        WHERE paragraphs_fts MATCH '${term}'
        ORDER BY bm25(paragraphs_fts)
        LIMIT 60
      `);
    }
    const doneAt = yield* Clock.currentTimeMillis;
    const warmed: WarmResult = {
      _tag: 'Warmed',
      postingsMs: postingsAt - startedAt,
      queryMs: doneAt - postingsAt,
    };
    return warmed;
  });

const warm = (request: WarmRequest): Effect.Effect<WarmResult> =>
  warmThrough(request.mmapBytes).pipe(
    Effect.provide(SqliteBun.layer({ filename: request.filename, readonly: true })),
    Effect.catchCause((cause) =>
      Effect.succeed<WarmResult>({ _tag: 'Failed', message: Cause.pretty(cause) }),
    ),
  );

declare const self: Worker;

self.onmessage = (event: MessageEvent<WarmRequest>) => {
  void Effect.runPromise(warm(event.data)).then((result) => postMessage(result));
};
