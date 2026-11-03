import { vectorDocument } from '@manna/core/search';
import { EGW_SCOPE_AUTHORS } from '@manna/core/writings';
import { Database } from 'bun:sqlite';

import type { VectorSourceRow } from './emit.js';
import { Effect, Option, Schema } from 'effect';

export class VectorSourceError extends Schema.TaggedError<VectorSourceError>()(
  'VectorSourceError',
  { message: Schema.String },
) {}

const Rows = Schema.Array(
  Schema.Struct({
    book_code: Schema.String,
    ref_code: Schema.String,
    para_id: Schema.NullOr(Schema.String),
    refcode_short: Schema.NullOr(Schema.String),
    content_text: Schema.String,
  }),
);

const decodeRows = Schema.decodeUnknownEffect(Rows);

export const readVectorSource = (input: {
  readonly filename: string;
  readonly limit: Option.Option<number>;
}): Effect.Effect<readonly VectorSourceRow[], VectorSourceError> =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => new Database(input.filename, { readonly: true }),
      catch: (cause) =>
        VectorSourceError.make({ message: `cannot open ${input.filename}: ${String(cause)}` }),
    }),
    (database) =>
      Effect.gen(function* () {
        const placeholders = EGW_SCOPE_AUTHORS.map(() => '?').join(', ');
        const limit = Option.getOrElse(input.limit, () => -1);
        const rows = yield* Effect.try({
          try: () =>
            database
              .prepare(
                `SELECT b.book_code, p.ref_code, p.para_id, p.refcode_short, p.content_text
                 FROM paragraphs p
                 JOIN books b ON p.book_id = b.book_id
                 WHERE b.book_author IN (${placeholders})
                 ORDER BY b.book_code, p.puborder
                 LIMIT ?`,
              )
              .all(...EGW_SCOPE_AUTHORS, limit),
          catch: (cause) => VectorSourceError.make({ message: `query failed: ${String(cause)}` }),
        });
        const decoded = yield* decodeRows(rows).pipe(
          Effect.mapError((cause) =>
            VectorSourceError.make({
              message: `unexpected paragraphs schema in ${input.filename}: ${String(cause)}`,
            }),
          ),
        );
        return decoded.flatMap((row): readonly VectorSourceRow[] =>
          Option.toArray(
            vectorDocument({
              bookCode: row.book_code,
              refCode: row.ref_code,
              paraId: Option.fromNullishOr(row.para_id),
              refcodeShort: Option.fromNullishOr(row.refcode_short),
              contentText: row.content_text,
            }),
          ),
        );
      }),
    (database) => Effect.sync(() => database.close()),
  );
