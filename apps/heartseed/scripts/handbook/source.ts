/* oxlint-disable effect/noGlobals -- the generator's writer: JSON.stringify writes each line of the committed files in a fixed key order, so two runs write the same bytes. */

import type { Database } from 'bun:sqlite';
import { Effect, type Option, Schema } from 'effect';

import { handbookOf, type Lists, missingSections, type Node, type Row } from './lists';

/**
 * The public contents page of Haskell's *Bible Handbook* (no sign-in), the
 * one full list of its headings (R1). The generator keeps a committed
 * snapshot of its titles and paragraph ids, so a regeneration needs no
 * network.
 */
export const CONTENTS_URL = 'https://text.egwwritings.org/book/b978';

/** The book the lists come from, as `data/handbook.json` names it. */
export const SOURCE = {
  title: 'Bible Handbook',
  author: 'Stephen N. Haskell',
  year: 1919,
  code: 'BHB',
  contents: CONTENTS_URL,
} as const;

/** The book's id in the EGW paragraph database. */
export const BOOK_ID = 978;

/** One entry of the contents: its paragraph number, its level (1 a section, 2 a sub-heading) and its title as the page writes it. */
export interface Entry {
  readonly para: number;
  readonly level: 1 | 2;
  readonly title: string;
}

const TOKEN =
  /<a href="\/read\/978\.(\d+)" class="book-toc__link[^"]*">([\s\S]*?)<\/a>|<ul class="book-toc__list book-toc__sublist">|<\/ul>/g;

/** R1: every link of the contents page in page order, level 2 inside a sub-list, its title's tags stripped and each run of whitespace one space. */
export const contentsOf = (html: string): readonly Entry[] => {
  const entries: Entry[] = [];
  let level: 1 | 2 = 1;
  for (const [token, para = '', title = ''] of html.matchAll(TOKEN)) {
    if (token.startsWith('<ul')) level = 2;
    else if (token === '</ul>') level = 1;
    else
      entries.push({
        para: Number(para),
        level,
        title: title
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      });
  }
  return entries;
};

/** The snapshot's text: its source, then one entry per line, in page order. */
export const contentsText = (entries: readonly Entry[]): string =>
  [
    '{',
    `"source":${JSON.stringify(CONTENTS_URL)},`,
    '"entries":[',
    entries.map((entry) => JSON.stringify(entry)).join(',\n'),
    ']',
    '}',
    '',
  ].join('\n');

/** The generator would not run: the contents snapshot is malformed, a left-out title is gone, or the database holds no row of the book. */
export class HandbookRefused extends Schema.TaggedError<HandbookRefused>()('HandbookRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `handbook: ${this.reason}`;
  }
}

const Snapshot = Schema.fromJsonString(
  Schema.Struct({
    source: Schema.String,
    entries: Schema.Array(
      Schema.Struct({ para: Schema.Finite, level: Schema.Literals([1, 2]), title: Schema.String }),
    ),
  }),
);

/** The faults of a contents snapshot: a para that is not a whole number, or one two entries share. */
export const contentsFaults = (entries: readonly Entry[]): readonly string[] => {
  const seen = new Set<number>();
  return entries.flatMap((entry) => {
    if (!Number.isInteger(entry.para)) return [`para ${entry.para} is not a whole number`];
    if (seen.has(entry.para)) return [`para ${entry.para} is repeated`];
    seen.add(entry.para);
    return [];
  });
};

/** The snapshot's entries, refused when it does not decode or `contentsFaults` finds a fault. */
export const readContents = Effect.fn('Handbook.readContents')(function* (text: string) {
  const snapshot = yield* Schema.decodeEffect(Snapshot)(text).pipe(
    Effect.mapError((error) =>
      HandbookRefused.make({ reason: `contents snapshot: ${error.message}` }),
    ),
  );
  const faults = contentsFaults(snapshot.entries);
  if (faults.length > 0)
    return yield* HandbookRefused.make({ reason: `contents snapshot: ${faults.join('; ')}` });
  return snapshot.entries;
});

interface LooseNode {
  readonly _tag: string;
  readonly text?: string;
  readonly title?: string;
  readonly children?: readonly LooseNode[];
}

const NodeSchema: Schema.Codec<LooseNode> = Schema.Struct({
  _tag: Schema.String,
  text: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
  children: Schema.optionalKey(
    Schema.Array(Schema.suspend((): Schema.Codec<LooseNode> => NodeSchema)),
  ),
});

const Nodes = Schema.fromJsonString(Schema.Array(NodeSchema));

/** One row as the paragraph database stores it, a missing paragraph id read as empty. */
interface Stored {
  readonly para_id: string;
  readonly element_type: string;
  readonly nodes_json: string;
}

const PARA = /^978\.(\d+)$/;

/** The book's rows with a paragraph id, in publication order, read from the EGW paragraph database; refused when it holds none. */
export const rowsOf = Effect.fn('Handbook.rowsOf')(function* (db: Database) {
  const stored = db
    .query<Stored, [number]>(
      "select coalesce(para_id, '') as para_id, element_type, nodes_json from paragraphs where book_id = ? order by puborder",
    )
    .all(BOOK_ID);
  if (stored.length === 0)
    return yield* HandbookRefused.make({ reason: `the database holds no row of book ${BOOK_ID}` });
  const rows: Row[] = [];
  for (const row of stored) {
    if (!PARA.test(row.para_id)) continue;
    const para = row.para_id.replace(PARA, '$1');
    const nodes: readonly Node[] = yield* Schema.decodeEffect(Nodes)(row.nodes_json).pipe(
      Effect.mapError((error) =>
        HandbookRefused.make({ reason: `row ${row.para_id}: ${error.message}` }),
      ),
    );
    rows.push({ para: Number(para), type: row.element_type, nodes });
  }
  return rows;
});

/** How the KJV names its books (to canon numbers) and how many verses each chapter holds (0 for none). */
export interface Chapters {
  readonly bookOf: (name: string) => Option.Option<number>;
  readonly count: (book: number, chapter: number) => number;
}

/** R2-R7 over the database's rows and the contents, the sections titled in `leftOut` left out; refused when one of them is not a section of the contents. */
export const generate = Effect.fn('Handbook.generate')(function* (
  db: Database,
  entries: readonly Entry[],
  leftOut: readonly string[],
  chapters: Chapters,
) {
  const gone = missingSections(entries, leftOut);
  if (gone.length > 0)
    return yield* HandbookRefused.make({
      reason: `left-out sections not in the contents: ${gone.join(', ')}`,
    });
  const rows = yield* rowsOf(db);
  return handbookOf(rows, entries, chapters.bookOf, chapters.count, leftOut);
});

/** `data/handbook.json`'s text: the source, then each section's head and each of its lists on a line of its own, then each skipped record on one. */
export const handbookText = (lists: Lists): string =>
  [
    '{',
    `"source":${JSON.stringify(SOURCE)},`,
    '"sections":[',
    lists.sections
      .map(
        (section) =>
          `{"id":${JSON.stringify(section.id)},"title":${JSON.stringify(section.title)},"lists":[\n${section.lists
            .map((list) => JSON.stringify({ id: list.id, title: list.title, ranges: list.ranges }))
            .join(',\n')}\n]}`,
      )
      .join(',\n'),
    '],',
    '"skipped":[',
    lists.skipped
      .map((skip) =>
        JSON.stringify({ para: skip.para, ref: skip.ref, title: skip.title, reason: skip.reason }),
      )
      .join(',\n'),
    ']',
    '}',
    '',
  ].join('\n');

/** The counts the CLI prints: sections, lists, ranges, distinct verses and skipped records. */
export const totalsLine = (lists: Lists): string => {
  const all = lists.sections.flatMap((section) => section.lists);
  const ranges = all.flatMap((list) => list.ranges);
  const verses = new Set(
    ranges.flatMap(([book, chapter, first, last]) =>
      Array.from({ length: last - first + 1 }, (_, at) => `${book}.${chapter}.${first + at}`),
    ),
  );
  return `handbook sections=${lists.sections.length} lists=${all.length} ranges=${ranges.length} verses=${verses.size} skipped=${lists.skipped.length}`;
};
