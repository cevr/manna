import { Array as Arr, Effect, Option, Schema } from 'effect';
import * as SqlClient from 'effect/sql/SqlClient';

import { paragraphIdentity } from '@manna/core/egw-db';
import { type QueryEmbedderUnavailable, vectorDocument } from '@manna/core/search';
import { APPARATUS_AUTHORS, APPARATUS_TYPES, EGW_SCOPE_AUTHORS } from '@manna/core/writings';

import { vectorMetadata } from './vectorize.ts';

export const BOOK_VECTORS_PAGE = 500;

export interface VectorizeUpsert {
  readonly upsert: (
    vectors: {
      id: string;
      values: number[];
      metadata: Record<string, string>;
    }[],
  ) => Promise<unknown>;
}

export type BookVectorsScope = 'book' | 'changed';

export interface BookVectorsPage {
  readonly read: number;
  readonly upserted: number;
  readonly after: number;
}

export class BookVectorsFailed extends Schema.TaggedError<BookVectorsFailed>()(
  'BookVectorsFailed',
  {
    bookId: Schema.Finite,
    reason: Schema.String,
  },
) {}

const Rows = Schema.Array(
  Schema.Struct({
    row_id: Schema.Finite,
    book_code: Schema.String,
    ref_code: Schema.String,
    para_id: Schema.NullOr(Schema.String),
    refcode_short: Schema.NullOr(Schema.String),
    content_text: Schema.String,
    section: Schema.NullOr(Schema.String),
    book_type: Schema.NullOr(Schema.String),
    book_subtype: Schema.NullOr(Schema.String),
  }),
);

const encodeNames = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));

export const bookVectorsPage = Effect.fn('BookVectors.page')(function* (
  page: { readonly bookId: number; readonly after: number; readonly scope: BookVectorsScope },
  embed: (
    texts: readonly string[],
  ) => Effect.Effect<readonly Int8Array[], QueryEmbedderUnavailable>,
  index: VectorizeUpsert,
) {
  const sql = yield* SqlClient.SqlClient;
  const failed = (reason: string) => BookVectorsFailed.make({ bookId: page.bookId, reason });
  const authors = encodeNames(EGW_SCOPE_AUTHORS);
  const apparatusAuthors = encodeNames([...APPARATUS_AUTHORS]);
  const apparatusTypes = encodeNames([...APPARATUS_TYPES]);
  let read = sql`
          SELECT
            p.rowid AS row_id, b.book_code, p.ref_code, p.para_id, p.refcode_short,
            p.content_text, b.section, b.book_type, b.book_subtype
          FROM paragraphs p
          JOIN books b ON b.book_id = p.book_id
          WHERE p.book_id = ${page.bookId}
            AND p.rowid > ${page.after}
            AND b.book_author IN (SELECT value FROM json_each(${authors}))
            AND b.book_author NOT IN (SELECT value FROM json_each(${apparatusAuthors}))
            AND (b.book_type IS NULL OR b.book_type NOT IN (SELECT value FROM json_each(${apparatusTypes})))
          ORDER BY p.rowid
          LIMIT ${BOOK_VECTORS_PAGE}
        `;
  if (page.scope === 'changed')
    read = sql`
          SELECT
            p.rowid AS row_id, b.book_code, p.ref_code, p.para_id, p.refcode_short,
            p.content_text, b.section, b.book_type, b.book_subtype
          FROM paragraphs p
          JOIN books b ON b.book_id = p.book_id
          WHERE p.book_id = ${page.bookId}
            AND p.rowid > ${page.after}
            AND b.book_author IN (SELECT value FROM json_each(${authors}))
            AND b.book_author NOT IN (SELECT value FROM json_each(${apparatusAuthors}))
            AND (b.book_type IS NULL OR b.book_type NOT IN (SELECT value FROM json_each(${apparatusTypes})))
            AND COALESCE(p.para_id, p.ref_code) IN (
              SELECT COALESCE(c.para_id, c.ref_code) FROM paragraph_changes c
              WHERE c.book_id = p.book_id
                AND c.kind IN ('added', 'edited')
                AND c.to_revision = (SELECT revision FROM sync_status WHERE book_id = p.book_id)
            )
          ORDER BY p.rowid
          LIMIT ${BOOK_VECTORS_PAGE}
        `;
  const rows = yield* read.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Rows)),
    Effect.mapError((cause) => failed(`read: ${String(cause)}`)),
  );

  const documents = rows.flatMap((row) =>
    Option.toArray(
      Option.map(
        vectorDocument({
          bookCode: row.book_code,
          refCode: row.ref_code,
          paraId: Option.fromNullishOr(row.para_id),
          refcodeShort: Option.fromNullishOr(row.refcode_short),
          contentText: row.content_text,
        }),
        (document) => ({
          document,
          metadata: vectorMetadata({
            code: row.book_code,
            section: Option.fromNullishOr(row.section),
            type: Option.fromNullishOr(row.book_type),
            subtype: Option.fromNullishOr(row.book_subtype),
          }),
        }),
      ),
    ),
  );

  if (documents.length > 0) {
    const vectors = yield* embed(documents.map(({ document }) => document.text)).pipe(
      Effect.mapError((cause) => failed(`embed: ${cause.reason}`)),
    );
    yield* Effect.tryPromise({
      try: () =>
        index.upsert(
          Arr.zip(documents, vectors).map(([{ document, metadata }, values]) => ({
            id: paragraphIdentity(
              document.bookCode,
              Option.some(document.paraId),
              document.refcode,
            ),
            values: Array.from(values),
            metadata,
          })),
        ),
      catch: (cause) => failed(`upsert: ${String(cause)}`),
    });
  }

  const last = Option.getOrElse(
    Option.map(Option.fromNullishOr(rows.at(-1)), (row) => row.row_id),
    () => page.after,
  );
  return { read: rows.length, upserted: documents.length, after: last } satisfies BookVectorsPage;
});

const RemovedRows = Schema.Array(
  Schema.Struct({
    book_code: Schema.String,
    ref_code: Schema.String,
    para_id: Schema.NullOr(Schema.String),
  }),
);

export const removedVectorIds = Effect.fn('BookVectors.removedIds')(function* (bookId: number) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    SELECT b.book_code, c.ref_code, c.para_id
    FROM paragraph_changes c
    JOIN books b ON b.book_id = c.book_id
    WHERE c.book_id = ${bookId}
      AND c.kind = 'removed'
      AND c.to_revision = (SELECT revision FROM sync_status WHERE book_id = ${bookId})
  `.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(RemovedRows)),
    Effect.mapError((cause) =>
      BookVectorsFailed.make({ bookId, reason: `read: ${String(cause)}` }),
    ),
  );
  return rows.map((row) =>
    paragraphIdentity(row.book_code, Option.fromNullishOr(row.para_id), row.ref_code),
  );
});

export const VECTOR_DELETE_LIMIT = 100;

export interface VectorizeDelete {
  readonly deleteByIds: (ids: string[]) => Promise<unknown>;
}

export const deleteVectorIds = Effect.fn('BookVectors.delete')(function* (
  bookId: number,
  ids: readonly string[],
  index: VectorizeDelete,
) {
  for (const chunk of Arr.chunksOf(ids, VECTOR_DELETE_LIMIT)) {
    yield* Effect.tryPromise({
      try: () => index.deleteByIds([...chunk]),
      catch: (cause) => BookVectorsFailed.make({ bookId, reason: `delete: ${String(cause)}` }),
    });
  }
  return ids.length;
});
