import { Database } from 'bun:sqlite';
import { Effect, Option, Schema } from 'effect';

import type { CatalogLookup, ParagraphLookup } from './compile.js';

const ContentRows = Schema.Array(Schema.Struct({ content_text: Schema.String }));
const IdRows = Schema.Array(Schema.Struct({ id: Schema.String }));
const ValueRows = Schema.Array(Schema.Struct({ value: Schema.String }));

const decodeContent = Schema.decodeUnknownOption(ContentRows);
const decodeIds = Schema.decodeUnknownOption(IdRows);
const decodeValues = Schema.decodeUnknownOption(ValueRows);

export const openParagraphLookup = (filename: string): ParagraphLookup => {
  const database = new Database(filename, { readonly: true });
  const statement = database.prepare(
    'SELECT content_text FROM paragraphs WHERE ref_code = ? OR refcode_short = ?',
  );
  return {
    paragraphsFor: (refcode) =>
      Effect.sync(() => {
        const trimmed = refcode.trim();
        return decodeContent(statement.all(trimmed, trimmed)).pipe(
          Option.map((rows) => rows.map((row) => row.content_text)),
          Option.getOrElse((): readonly string[] => []),
        );
      }),
  };
};

export const openCatalogLookup = (filename: string): CatalogLookup => {
  const database = new Database(filename, { readonly: true });
  const revision = decodeValues(
    database
      .prepare("SELECT value FROM meta WHERE key IN ('corpus_revision', 'topics_source_hash')")
      .all(),
  ).pipe(
    Option.flatMap((rows) => Option.fromNullishOr(rows[0])),
    Option.map((row) => row.value),
    Option.getOrElse(() => 'unknown'),
  );
  const statement = database.prepare('SELECT id FROM topics WHERE lower(name) = lower(?)');
  return {
    revision,
    idsForName: (name) =>
      Effect.sync(() =>
        decodeIds(statement.all(name.trim())).pipe(
          Option.map((rows) => rows.map((row) => row.id)),
          Option.getOrElse((): readonly string[] => []),
        ),
      ),
  };
};
