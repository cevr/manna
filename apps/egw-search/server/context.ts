/* oxlint-disable effect/noTernary -- one branch mapping a nullable `para_id`
   column to its deep link; `Option.match` here builds a matcher per row of a
   page's context. */
/* oxlint-disable effect/noNullish -- SQLite returns NULL for a paragraph with no short refcode, and the HTTP wire re-encodes it as JSON `null`; both boundaries are fixed by the APIs this module joins. */

import { Effect, Schema } from 'effect';
import { SqlClient } from 'effect/sql';

import { readerUrl, type ContextParagraph } from './api.js';

export interface Surrounding {
  readonly before: readonly ContextParagraph[];
  readonly after: readonly ContextParagraph[];
}

interface WindowRow {
  readonly anchor_para_id: string;
  readonly para_id: string | null;
  readonly refcode_short: string | null;
  readonly content_text: string;
  readonly offset: number;
  readonly is_chapter_heading: number;
}

const EMPTY: Surrounding = { before: [], after: [] };

const encodeKeys = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));

interface Mutable {
  readonly before: ContextParagraph[];
  readonly after: ContextParagraph[];
}

const existingOrNew = (into: Map<string, Mutable>, key: string): Mutable => {
  const found = into.get(key);
  if (found !== undefined) return found;
  const fresh: Mutable = { before: [], after: [] };
  into.set(key, fresh);
  return fresh;
};

export const surroundingParagraphs = (
  paraIds: readonly string[],
  radius: number,
): Effect.Effect<ReadonlyMap<string, Surrounding>, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    if (paraIds.length === 0 || radius <= 0) return new Map<string, Surrounding>();

    const sql = yield* SqlClient.SqlClient;

    const rows = yield* sql<WindowRow>`
      with anchors as (
        select para_id as anchor_para_id, book_id, puborder
        from paragraphs
        where para_id in (select value from json_each(${encodeKeys(paraIds)}))
      )
      select
        a.anchor_para_id,
        p.para_id,
        p.refcode_short,
        p.content_text,
        p.is_chapter_heading,
        p.puborder - a.puborder as offset
      from anchors a
      join paragraphs p
        on p.book_id = a.book_id
       and p.puborder between a.puborder - ${radius} and a.puborder + ${radius}
      where p.puborder <> a.puborder
      order by a.anchor_para_id, p.puborder
    `;

    const grouped = new Map<string, Mutable>();
    for (const row of rows) {
      const entry = existingOrNew(grouped, row.anchor_para_id);
      const paragraph: ContextParagraph = {
        refcode: row.refcode_short,
        text: row.content_text,
        url: row.para_id === null ? null : readerUrl(row.para_id),
        isHeading: row.is_chapter_heading === 1,
      };
      if (row.offset < 0) entry.before.push(paragraph);
      else entry.after.push(paragraph);
    }

    const result: Map<string, Surrounding> = grouped;
    return result;
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning('search.context.failed').pipe(
        Effect.annotateLogs({ cause: String(cause) }),
        Effect.as(new Map<string, Surrounding>()),
      ),
    ),
  );

export const emptySurrounding = EMPTY;
