/**
 * EGW Paragraph Database Service using Effect SQL
 *
 * Stores EGW books, paragraphs, Bible references, and sync status in a SQLite
 * database. The service depends only on `SqlClient.SqlClient`, so any
 * driver-specific layer (sqlite-bun, sqlite-node) can satisfy it.
 *
 * Schema:
 * - books: normalized book metadata (book_id PK, book_code, book_title, ...)
 * - paragraphs: per-paragraph content with pre-computed navigation fields
 *   (page_number, paragraph_number, is_chapter_heading)
 * - paragraph_bible_refs: indexed Bible reference lookup for commentary
 * - paragraphs_fts: FTS5 virtual table backed by paragraphs.content +
 *   refcode_short
 * - sync_status: incremental sync bookkeeping
 */

import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';
import * as SqlClient from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';
import type * as Statement from 'effect/sql/Statement';

import { EGW_SCOPE_AUTHORS, type CorpusScope } from '../writings/corpus-scope.js';
import {
  APPARATUS_AUTHORS,
  APPARATUS_TYPES,
  EXCLUDED_SUBTYPES,
  isBookSubtype,
  isApparatus,
  isBookType,
  isCorpusSection,
  type CorpusFilter,
} from '../writings/corpus-class.js';

import { SqlAtomic } from '../db/atomic.js';
import {
  ensureSchemaVersionsTable,
  readSchemaVersion,
  writeSchemaVersion,
} from '../db/schema-version.js';
import * as EGWSchemas from '../egw/schemas.js';
import { Node, nodesToText } from '../egw/ast.js';
import { headingLevel, isChapterHeading, isFurniture } from '../egw/parse.js';
import {
  type ArchiveChapter,
  collectPublication,
  type PublicationArchive,
  type PublicationStream,
} from '../writings/archive.js';
import type { CorpusProvenance } from '../corpus-supply/model.js';

const SCHEMA_VERSION = 3;
const SCHEMA_NAME = 'egw_paragraphs';

/**
 * A refcode as typed, reduced to the form `idx_paragraphs_refcode_key`
 * indexes: lower case, whitespace runs collapsed to one space.
 *
 * The corpus stores periodical refcodes with two spaces after the day's
 * comma (`PTUK February 4,  1897, page 70.2`) and nobody types them that way.
 * The SQL side, `REFCODE_KEY_SQL`, collapses only a double space: no stored
 * refcode has a longer run (checked over all 3,012,004 paragraphs).
 */
const refcodeKey = (refcode: string): string => refcode.trim().replace(/\s+/g, ' ').toLowerCase();

const REFCODE_KEY_SQL = `lower(replace(refcode_short, '  ', ' '))`;

const REFCODE_KEY_END = '\u{10FFFF}';

/** The separators that end a refcode's parent: `PP 351` → `PP 351.1`,
 *  `11LtMs, Lt 1a, 1896` → `11LtMs, Lt 1a, 1896, par. 3`. */
const REFCODE_CHILD_SEPARATORS = ['.', ', '] as const;

interface RefcodeRow {
  readonly bookId: number;
  readonly paragraph: EGWSchemas.Paragraph;
}

class ParagraphDataIntegrityError extends Schema.TaggedError<ParagraphDataIntegrityError>()(
  'ParagraphDataIntegrityError',
  {
    cause: Schema.Unknown,
    location: Schema.String,
  },
) {}

/** Errors emitted by the Effect SQL persistence adapter. */
export type ParagraphDatabaseError = SqlError | ParagraphDataIntegrityError;

export const BookRow = Schema.Struct({
  book_id: Schema.Finite,
  book_code: Schema.String,
  book_title: Schema.String,
  book_author: Schema.String,
  paragraph_count: Schema.Finite,
  created_at: Schema.String,
  book_type: Schema.optional(Schema.NullOr(Schema.String)),
  book_subtype: Schema.optional(Schema.NullOr(Schema.String)),
  folder_id: Schema.optional(Schema.NullOr(Schema.Finite)),
  section: Schema.optional(Schema.NullOr(Schema.String)),
});

export type BookRow = Schema.Schema.Type<typeof BookRow>;

const { refcode_long, puborder, element_type, element_subtype } = EGWSchemas.Paragraph.fields;

const ParagraphRow = Schema.Struct({
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_long,
  nodes_json: Schema.String,
  content_text: Schema.String,
  puborder,
  element_type,
  element_subtype,
  book_id: Schema.Finite,
  ref_code: Schema.String,
  page_number: Schema.NullOr(Schema.Finite),
  paragraph_number: Schema.NullOr(Schema.Finite),
  is_chapter_heading: Schema.Finite,
  created_at: Schema.String,
  updated_at: Schema.String,
});

type ParagraphRow = Schema.Schema.Type<typeof ParagraphRow>;

export const BibleRefRow = Schema.Struct({
  para_book_id: Schema.Finite,
  para_ref_code: Schema.String,
  bible_book: Schema.Finite,
  bible_chapter: Schema.Finite,
  bible_verse: Schema.NullOr(Schema.Finite),
});

export type BibleRefRow = Schema.Schema.Type<typeof BibleRefRow>;

const MaxPageRow = Schema.Struct({
  max_page: Schema.NullOr(Schema.Finite),
});
type MaxPageRow = Schema.Schema.Type<typeof MaxPageRow>;

const CommentaryVerseRow = Schema.Struct({
  bible_verse: Schema.NullOr(Schema.Finite),
});
type CommentaryVerseRow = Schema.Schema.Type<typeof CommentaryVerseRow>;

const wireNull = Option.getOrNull(Option.none<never>());

const SyncStatus = Schema.Literals(['pending', 'success', 'failed']);
type SyncStatus = typeof SyncStatus.Type;

const SyncStatusRow = Schema.Struct({
  book_id: Schema.Finite,
  book_code: Schema.String,
  status: SyncStatus,
  error_message: Schema.NullOr(Schema.String),
  last_attempt: Schema.String,
  paragraph_count: Schema.Finite,
  source: Schema.optional(Schema.NullOr(Schema.String)),
  revision: Schema.optional(Schema.NullOr(Schema.String)),
  digest: Schema.optional(Schema.NullOr(Schema.String)),
});

type SyncStatusRow = Schema.Schema.Type<typeof SyncStatusRow>;

const ParagraphChangeKind = Schema.Literals(['added', 'removed', 'edited']);

/** One paragraph a reinstall changed: its text before and after, by its
 *  `ref_code`. A first install records none, so every row is a change to a
 *  book that was already there. */
export const ParagraphChangeRow = Schema.Struct({
  book_id: Schema.Finite,
  ref_code: Schema.String,
  para_id: Schema.NullOr(Schema.String),
  refcode_short: Schema.NullOr(Schema.String),
  kind: ParagraphChangeKind,
  before_text: Schema.NullOr(Schema.String),
  after_text: Schema.NullOr(Schema.String),
  puborder: Schema.Finite,
  from_revision: Schema.NullOr(Schema.String),
  to_revision: Schema.String,
  recorded_at: Schema.String,
});

export interface ParagraphChangeRow extends Schema.Schema.Type<typeof ParagraphChangeRow> {}

interface RefcodeNumbers {
  readonly page: Option.Option<number>;
  readonly paragraph: Option.Option<number>;
}

const parseInteger = (digits: Option.Option<string>): Option.Option<number> =>
  digits.pipe(Option.map((value) => Number.parseInt(value, 10)));

function parseRefcodeNumbers(refcode: Option.Option<string>): RefcodeNumbers {
  if (Option.isNone(refcode)) return { page: Option.none(), paragraph: Option.none() };
  const match = refcode.value.match(/\s(\d+)\.(\d+)$/);
  if (match) {
    return {
      page: parseInteger(Option.fromNullishOr(match[1])),
      paragraph: parseInteger(Option.fromNullishOr(match[2])),
    };
  }
  const pageMatch = refcode.value.match(/\s(\d+)$/);
  if (pageMatch) {
    return { page: parseInteger(Option.fromNullishOr(pageMatch[1])), paragraph: Option.none() };
  }
  return { page: Option.none(), paragraph: Option.none() };
}

/** One paragraph in the in-memory double, plus the two things a real corpus
 *  supplies that an array cannot.
 *
 *  `ftsRank` is the FTS5 relevance the double has no index to compute. A test
 *  about §9.3's strong-BM25 short-circuit has to *state* that the top hit is
 *  strong and clearly separated — that is its premise — and without this field
 *  it could only be stated against a real SQLite corpus whose scores happened
 *  to land in the right regime. Optional, so every existing configuration is
 *  unchanged and reads as the weak default. */
export type TestParagraph = EGWSchemas.Paragraph & {
  readonly bookCode: string;
  readonly ftsRank?: number;
};

/** The terms an FTS5 MATCH string asks for, as the double reads them.
 *
 *  Quoted runs and bare words both reduce to lower-cased words. It is not FTS5
 *  syntax — there is no NEAR, no prefix, no boolean — because the double is not
 *  an FTS engine and pretending otherwise would invite tests to depend on
 *  behavior it does not have. What it does model is the one property every
 *  caller relies on: *a search returns rows that contain the query's words*. */
const testQueryTerms = (query: string): readonly string[] =>
  query
    .toLowerCase()
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter((term) => term.length > 0);

/** One row's relevance to one query, as the double models it.
 *
 *  A configured `ftsRank` is a *rank for a query the paragraph actually
 *  answers*, so it applies in proportion to how much of the query the paragraph
 *  contains. Without that proportioning the field would be a rank the paragraph
 *  carries against every query, which is not what a rank is: the strongest row
 *  in a fixture would lead every search, including searches it matched on
 *  nothing but the word "the".
 *
 *  The proportion is the share of the query's terms present, which is the one
 *  BM25 property this matters for — a document containing more of what was
 *  asked scores better than one containing less. It is not BM25: there is no
 *  IDF, no length normalization, and a test that needs those needs a real
 *  corpus. Negative, matching FTS5. */
const testRank = (paragraph: TestParagraph, terms: readonly string[], text: string): number => {
  const configured = paragraph.ftsRank ?? -1;
  if (terms.length === 0) return configured;
  const present = terms.filter((term) => text.includes(term)).length;
  return configured * (present / terms.length);
};

/** Whether one paragraph matches the query, as an **AND** over its terms —
 *  `FTS_TERM_CONJUNCTION`'s contract, applied by the double.
 *
 *  AND, not OR. The earlier comment here claimed OR was "FTS5's default for a
 *  bare term list", and it is not: FTS5 has no bare term list in the query
 *  `ftsQuery` builds. Every term is emitted quoted and space-separated, and
 *  FTS5's implicit operator between two quoted phrases is AND. Measured against
 *  an in-memory SQLite FTS5 table over three rows — one containing `alpha`, one
 *  containing `beta`, one containing both — `"alpha" "beta"` returns 1 row and
 *  `"alpha" OR "beta"` returns 3.
 *
 *  A double that ORs where production ANDs is worse than a double with no
 *  filter at all: every multi-word fixture query returns a superset of the real
 *  result set, so a test can state a premise about a top hit that the live
 *  corpus would never have produced, and the difference only appears against
 *  SQLite. */
const testMatchesQuery = (terms: readonly string[], text: string): boolean => {
  if (terms.length === 0) return true;
  return terms.every((term) => text.includes(term));
};

/** The classification filters as a predicate over one book.
 *
 *  One function per side of the seam, deliberately: `searchFilters` builds SQL
 *  and this builds a predicate, and they are close enough that a reader can
 *  check them against each other line by line. The rule both implement is that
 *  a `null` column passes every clause, `excludeApparatus` included — an
 *  unclassified book is never excluded by a filter the reader set about a
 *  classification it does not have. `excludeApparatus` also reads the author,
 *  which is never null.
 *
 *  Exported because the vector leg needs the same answer *before* it scans.
 *  The lexical leg gets this for free from its `WHERE`, but a vector scan has
 *  no join to push a predicate into: it walks a flat buffer. Resolving which
 *  books a filter admits, and scanning only their ranges, is what keeps it from
 *  scoring 367,726 vectors whose rows the very next step would discard. */
export const bookMatchesFilter = (book: BookRow, filter?: CorpusFilter): boolean => {
  const classified = <A extends string>(
    // oxlint-disable-next-line effect/noNullish -- see above
    value: string | null | undefined,
    is: (input: string) => input is A,
  ): Option.Option<A> => Option.filter(Option.fromNullishOr(value), is);

  const subtype = classified(book.book_subtype, isBookSubtype);

  if (Option.exists(subtype, (value) => EXCLUDED_SUBTYPES.has(value))) return false;
  if (Predicate.isUndefined(filter)) return true;

  /** One axis, both signs — the double of the `signed` clauses in
   *  `identityFilters`.
   *
   *  An empty selection narrows nothing. `include` is a *positive* choice, so
   *  an unclassified book fails it: asking for dictionaries and being handed a
   *  book nobody has classified is not an answer to the question. `exclude` is
   *  the mirror: an unclassified book passes, because it is not *known* to be
   *  the thing the reader removed. */
  const allowed = <A extends string>(
    selection: { readonly include: readonly A[]; readonly exclude: readonly A[] },
    value: Option.Option<A>,
  ): boolean => {
    const included =
      selection.include.length === 0 || Option.exists(value, (v) => selection.include.includes(v));
    const excluded = Option.exists(value, (v) => selection.exclude.includes(v));
    return included && !excluded;
  };

  const type = classified(book.book_type, isBookType);

  return (
    allowed(filter.section, classified(book.section, isCorpusSection)) &&
    allowed(filter.type, type) &&
    allowed(filter.subtype, subtype) &&
    (!filter.excludeApparatus || !isApparatus({ type, author: book.book_author }))
  );
};

const testSearchMatches = (
  config: {
    readonly books?: readonly BookRow[];
    readonly paragraphs?: readonly TestParagraph[];
  },
  query: string,
  options?: {
    readonly bookCode?: string;
    readonly scope?: CorpusScope;
    readonly filter?: CorpusFilter;
  },
) => {
  const terms = testQueryTerms(query);
  return (config.paragraphs ?? [])
    .flatMap((paragraph) => {
      const book = config.books?.find((candidate) => candidate.book_code === paragraph.bookCode);
      if (Predicate.isUndefined(book)) return [];
      return [{ ...paragraph, bookId: book.book_id, bookTitle: book.book_title, book }];
    })
    .flatMap((row) => {
      const bookCode = options?.bookCode;
      if (Predicate.isNotUndefined(bookCode) && row.bookCode !== bookCode) return [];
      const isEgw = EGW_SCOPE_AUTHORS.includes(row.book.book_author);
      if (options?.scope === 'egw' && !isEgw) return [];
      if (options?.scope === 'pioneer' && isEgw) return [];
      if (!bookMatchesFilter(row.book, options?.filter)) return [];
      const text = nodesToText(row.nodes).toLowerCase();
      if (!testMatchesQuery(terms, text)) return [];
      return [{ ...row, rank: testRank(row, terms, text) }];
    })
    .sort((left, right) => left.rank - right.rank);
};

/** How a multi-term search combines its terms, written down once (round-2 B4).
 *
 *  The producer (`search/service.ts`'s `ftsQuery`) emits each term quoted and
 *  joins them with this separator; the in-memory double's `testMatchesQuery`
 *  applies the matching predicate. They used to disagree — the producer joined
 *  with a space, which FTS5 reads as **AND** between two quoted phrases, while
 *  the double matched any term, which is OR. A double looser than production
 *  admits fixture results the live corpus would never return, and the
 *  divergence surfaces only against real SQLite.
 *
 *  The value is a single space rather than the literal `AND`, because that is
 *  what FTS5 accepts as its implicit conjunction and what the shipped queries
 *  have always emitted. Measured on an in-memory FTS5 table: `"alpha" "beta"`
 *  matches only the row containing both; `"alpha" OR "beta"` matches all three.
 *
 *  The test that holds the double to live FTS5 builds its query with
 *  `ftsTermQuery`, so changing the contract is one edit and cannot leave the
 *  double behind. */
const FTS_TERM_CONJUNCTION = ' ';

/** Reader text as an FTS5 MATCH string: the one sanitizer every caller shares.
 *
 *  FTS5 reads its argument as a *query expression*, so a `.`, a `"`, a bare
 *  `NEAR` or a `-` in reader text is syntax rather than text, and the engine
 *  answers with `fts5: syntax error` rather than with results. `ftsQuery`'s
 *  hybrid branch has always tokenized that away; `WritingsService.search` did
 *  not, so every caller that hands it raw text — the CLI's `localSearch` and
 *  `egw study`, the wiki's lookup panel, the web API's `search` handler — died
 *  on a refcode like `PP 45.3`. Same engine, same untrusted input, two
 *  behaviors; this is the one definition both sides now import.
 *
 *  Each term is stripped to letters, digits, apostrophes and hyphens, then
 *  quoted, then joined with {@link FTS_TERM_CONJUNCTION} — quoting is what
 *  demotes a surviving `NEAR` from operator to word. Terms rather than one
 *  phrase because the callers want an AND over words; a caller that means an
 *  exact phrase quotes it itself (the wiki's `ftsPhrase`), which is a different
 *  operation and deliberately not this one.
 *
 *  Returns `None` when nothing survives — `"..."` asks for no terms at all, and
 *  an empty MATCH is a second syntax error. The caller decides what an
 *  unanswerable query means; this function does not invent a result for it. */
export const ftsTermQuery = (text: string): Option.Option<string> => {
  const terms = text
    .split(/\s+/u)
    .map((term) => term.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter((term) => term.length > 0);
  if (terms.length === 0) return Option.none();
  return Option.some(terms.map((term) => `"${term}"`).join(FTS_TERM_CONJUNCTION));
};

/** §9.2's join key, spelled once for every producer and every consumer.
 *
 *  `${bookCode}:${para_id}`, book-qualified rather than bare `para_id`. The
 *  corpus makes `para_id` globally unique today — 3,012,004 rows, 3,012,004
 *  distinct values — but that is a property of the current import rather than a
 *  declared constraint, and qualifying by the book makes the key unique under
 *  the weaker guarantee the schema actually gives (unique within a book). It
 *  costs one string concatenation and removes a whole class of silent
 *  cross-book collision.
 *
 *  A paragraph with no `para_id` gets `${bookCode}:#${refCode}`, which the `#`
 *  keeps disjoint from every real key. No row in the shipped corpus takes this
 *  branch; it exists because the column is nullable in the schema and an
 *  identity function that could return an empty string would fuse every such
 *  row onto one another.
 */
export const paragraphIdentity = (
  bookCode: string,
  paraId: Option.Option<string>,
  refCode = '',
): string =>
  Option.match(
    Option.filter(paraId, (value) => value.length > 0),
    {
      onNone: () => `${bookCode}:#${refCode}`,
      onSome: (value) => `${bookCode}:${value}`,
    },
  );

/** One `h1`–`h3` heading of a book's outline, in the order the book prints it.
 *
 *  What `backMatterClassifier` walks to decide whether a paragraph sits under
 *  an appendix, an index or a table of contents. */
export interface SectionHeading {
  readonly publicationId: number;
  readonly puborder: number;
  /** 1–6, from the `h1`–`h6` element type. */
  readonly level: number;
  readonly title: string;
}

/** A paragraph's position, and the heading of any level closest above it. */
export interface NearestHeading {
  readonly publicationId: number;
  readonly puborder: number;
  readonly heading: SectionHeading;
}

export interface ScoredParagraphRow {
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly bookAuthor: string;
  /** The publication's numeric id — `books.book_id`, which is the same value
   *  `WritingsReference.paragraph` takes as its `publicationId`.
   *
   *  Carried because a search hit has to become a *link*, and the reader route
   *  is `/writings/<numeric-publication-id>/p/<raw-para_id>`. The UI used to
   *  build `/writings/<bookCode>?paragraph=<qualified-key>` out of the two
   *  fields it had, and the route decoder rejects every part of that: the first
   *  segment must parse as a positive integer, the paragraph lives in a `/p/`
   *  segment rather than a query parameter, and the id must be the corpus's own
   *  `para_id` rather than the `bookCode:para_id` join key. Every paragraph and
   *  locate link in §9's result was therefore a 404 (round-2 B2).
   *
   *  The fix is to carry what the route needs rather than to reconstruct it:
   *  `bookCode` is not a publication id and no amount of formatting turns it
   *  into one. */
  readonly publicationId: number;
  /** The paragraph's position in its book (`paragraphs.puborder`), which is
   *  what places it under a heading of the book's outline. */
  readonly puborder: number;
  /** Whether this row is a chapter or section heading rather than prose.
   *
   *  `paragraphs.is_chapter_heading`, written at ingest from `isChapterHeading`
   *  (any `h1`-`h6`, or an explicit `chapter`/`heading`/`title` element type).
   *  **534,286 rows — 17.7% of the corpus.**
   *
   *  Carried on a search row because BM25 normalizes by document length, so a
   *  two-word title containing a two-word query scores near-perfectly: 32 of
   *  the top 40 production results for `latter rain` are headings, and within
   *  one book the order is strictly shortest-first (TM 506 heading at 62 bytes,
   *  then TM 506.2 at 353, then TM 506.1 at 1067). A reader cannot tell "The
   *  Loud Cry" the chapter title from "The Loud Cry" the sentence, because both
   *  arrive as a refcode and a line of text. This field is what lets a surface
   *  say which one it is. */
  readonly isHeading: boolean;
  /** Whether this row frames the text rather than says anything: a letter's
   *  date or signature, a picture's caption, the scripture at the head of a
   *  reading (`isFurniture`, from `paragraphs.element_subtype`). */
  readonly isFurniture: boolean;
  /** The corpus's own `para_id`, unqualified — the value
   *  `WritingsReference.paragraph` addresses a paragraph by.
   *
   *  Distinct from `para_id` below, which is the *join key* the vector index and
   *  the fusion share. `None` for the rows whose `para_id` column is NULL, which
   *  is also exactly the set of rows that have no paragraph route. */
  readonly rawParaId: Option.Option<string>;
  /** The corpus's own paragraph identity, and §9.2's join key.
   *
   *  Unique across the whole `paragraphs` table — 3,012,004 rows, 3,012,004
   *  distinct values, none null — which `(book_code, refcode_short)` is not: the
   *  EGW/White-Estate partition alone has 961,750 non-empty rows sharing only
   *  944,672 distinct `book:refcode` pairs, so 17,078 paragraphs would collide
   *  onto another paragraph's vector. The vector index, the lexical leg and the
   *  fusion all key on this column for that reason.
   */
  readonly para_id: string;
  readonly ref_code: string;
  readonly refcode_short: Option.Option<string>;
  /** The paragraph's decoded AST, for the caller to flatten into a snippet. */
  readonly nodes: readonly Node[];
  /** FTS5's `rank`: negative, more-negative-is-better. */
  readonly rank: number;
}

export interface EGWParagraphDatabaseService {
  /** Atomically replaces one publication with its chapters as they are read:
   *  each is staged as it arrives, so the publication is never held whole.
   *  A chapter that fails to read fails the install with its own error, and
   *  leaves the publication as it was. */
  readonly installPublication: <E>(
    publication: PublicationStream<E>,
    provenance?: CorpusProvenance,
  ) => Effect.Effect<number, E | ParagraphDatabaseError>;

  readonly storeBook: (book: EGWSchemas.Book) => Effect.Effect<void, ParagraphDatabaseError>;
  /** Set a book's top-level section (see the implementation). */
  readonly setBookSection: (
    bookCode: string,
    section: string,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly getBookById: (
    bookId: number,
  ) => Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError>;
  readonly getBookByCode: (
    bookCode: string,
  ) => Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError>;
  readonly getBooksByCode: (
    bookCode: string,
  ) => Effect.Effect<readonly BookRow[], ParagraphDatabaseError>;
  readonly getBooksByAuthor: (author: string) => Stream.Stream<BookRow, ParagraphDatabaseError>;
  readonly getAllBooks: Stream.Stream<BookRow, ParagraphDatabaseError>;
  readonly updateBookCount: (bookId: number) => Effect.Effect<void, ParagraphDatabaseError>;

  readonly storeParagraph: (
    paragraph: EGWSchemas.Paragraph,
    book: EGWSchemas.Book,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly storeParagraphsBatch: (
    paragraphs: readonly EGWSchemas.Paragraph[],
    book: EGWSchemas.Book,
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getParagraph: (
    bookId: number,
    refCode: string,
  ) => Effect.Effect<Option.Option<EGWSchemas.Paragraph>, ParagraphDatabaseError>;
  readonly getParagraphsByBook: (
    bookId: number,
  ) => Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError>;
  /**
   * Every paragraph, in any publication, cited by `refcode` or by a refcode
   * under it — see `refcodeKey` for how the match is made. `PP 351.1` names a
   * paragraph; `PP 351` a page, `PTUK February 4, 1897, page 70` an issue
   * page, `11LtMs, Lt 1a, 1896` a letter (its heading and every paragraph).
   * In publication order.
   */
  readonly getParagraphsByRefcode: (
    refcode: string,
  ) => Effect.Effect<readonly RefcodeRow[], ParagraphDatabaseError>;
  readonly getParagraphsByAuthor: (
    author: string,
  ) => Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError>;
  readonly getParagraphsByPage: (
    bookId: number,
    pageNumber: number,
  ) => Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError>;
  readonly getChapterHeadings: (
    bookId: number,
  ) => Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError>;
  /**
   * The `h1`–`h3` outline of each named book, in one statement.
   *
   * Search reads it to demote back matter: whether a hit sits under an
   * appendix or an index is a property of the headings above it, not of the
   * row. Only the three outline levels, because deeper headings (the `A`, `B`,
   * `C` letters of an index) never open a new part of a book.
   */
  readonly getSectionHeadings: (
    publicationIds: readonly number[],
  ) => Effect.Effect<readonly SectionHeading[], ParagraphDatabaseError>;
  /**
   * For each paragraph position, the closest heading of any level at or
   * before it, in one statement. A position before its book's first heading
   * has none and is left out.
   *
   * The outline alone cannot say whether a deeper heading intervenes between
   * a section heading and a paragraph, and every level of a dictionary's
   * outline is tens of thousands of rows; one seek per position is not.
   */
  readonly getNearestHeadings: (
    positions: readonly { readonly publicationId: number; readonly puborder: number }[],
  ) => Effect.Effect<readonly NearestHeading[], ParagraphDatabaseError>;
  /**
   * Full-text search over `paragraphs_fts`, in FTS5 relevance order.
   *
   * `scope` narrows the search to one half of the corpus by `books.book_author`
   * (§6.4) — the indexed column, so the filter costs an index probe rather than
   * a scan. It defaults to `'all'`, which is exactly what every caller written
   * before the scope existed meant.
   */
  readonly searchParagraphs: (
    query: string,
    options?: {
      readonly limit?: number;
      readonly bookCode?: string;
      readonly scope?: CorpusScope;
      readonly filter?: CorpusFilter;
    },
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & {
      bookCode: string;
      bookTitle: string;
      bookId: number;
    })[],
    ParagraphDatabaseError
  >;
  /**
   * The same search as `searchParagraphs`, carrying each hit's FTS5 `rank`.
   *
   * A second method rather than a field added to `searchParagraphs`'s rows,
   * because the two callers want different things and the difference is not
   * cosmetic: §6's sections and §7's panel want paragraphs, and decoding a
   * relevance score they never read onto every row would be work no caller
   * asked for. §9.3's strong-BM25 short-circuit wants the *scores* — it decides
   * whether to pay for a query embedding by how strong the top hit is and how
   * far clear of the runner-up it sits — and that decision is unavailable from
   * a list whose ordering is all that survived.
   *
   * `rank` is FTS5's own value: negative, more-negative-is-better. It is passed
   * through unflipped so this method reports what SQLite said, and the one
   * place that prefers larger-is-better flips it where its thresholds are
   * written.
   */
  readonly searchScoredParagraphs: (
    query: string,
    options?: {
      readonly limit?: number;
      readonly bookCode?: string;
      readonly scope?: CorpusScope;
      readonly filter?: CorpusFilter;
    },
  ) => Effect.Effect<readonly ScoredParagraphRow[], ParagraphDatabaseError>;
  /**
   * The rows behind a set of `paragraphIdentity` keys, in one statement.
   *
   * §9.4's fusion ranks ids from two legs, and the vector leg returns ids the
   * lexical leg never saw — that is the recall hybrid search exists to buy. The
   * rows for those ids have to come from somewhere, and a per-id round trip for
   * the tail of a 30-candidate list is 30 statements where one `IN (...)` does.
   *
   * Returns `ScoredParagraphRow` with `rank = 0`: these rows have no BM25 score
   * because FTS did not match them, and 0 is the value the score flip
   * (`-rank`) maps to "no lexical evidence". The caller never reads it — the
   * fused score comes from the RRF ranks — but the shape stays one shape.
   *
   * Rows are returned in whatever order SQLite yields; the caller re-orders by
   * the fused ranking, so imposing an order here would be work the caller
   * discards.
   */
  readonly findParagraphsByIdentity: (
    identities: readonly string[],
    options?: {
      readonly scope?: CorpusScope;
      readonly filter?: CorpusFilter;
    },
  ) => Effect.Effect<readonly ScoredParagraphRow[], ParagraphDatabaseError>;
  /**
   * How many paragraphs `searchParagraphs` matches under the same query and the
   * same filters, ignoring `limit`.
   *
   * A separate call rather than a number returned beside the rows, because the
   * two have different costs and not every caller wants both: the row query
   * pays `rowToParagraph` per hit, and a caller asking only "how long is the
   * tail" should not. Both statements are built from the same `searchFilters`,
   * so the count and the rows can never be counting different things.
   */
  readonly countSearchParagraphs: (
    query: string,
    options?: {
      readonly bookCode?: string;
      readonly scope?: CorpusScope;
      readonly filter?: CorpusFilter;
    },
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  /** How many paragraphs a query matches, over the FTS index alone.
   *
   *  Deliberately *not* `countSearchParagraphs`: that one joins `paragraphs`
   *  and `books` so its count agrees with the scoped row query, and those joins
   *  cost 20-30x what the bare count does — 562 ms against 25 ms for `the`,
   *  45 ms against 1 ms for `sabbath`. A caller that wants a cheap *estimate*
   *  of how much work a query implies cannot pay that, because the estimate
   *  would cost more than the queries it is meant to protect.
   *
   *  The number is therefore an upper bound, ignoring scope and filters. That
   *  is the right shape for a selectivity gate — a term matching half the
   *  corpus matches half of any scope within it — and the wrong shape for
   *  anything a reader is shown. For a count that agrees with the results on
   *  screen, use `countSearchParagraphs`. */
  readonly estimateMatchCount: (query: string) => Effect.Effect<number, ParagraphDatabaseError>;
  /**
   * Exact-match lookup by `refcode_short` (e.g. "PP 351.1"). Returns the
   * paragraph together with its book metadata so callers can navigate without
   * a second query. NOCASE so "pp 351.1" works too. Returns up to N matches —
   * the same refcode may appear in multiple books (rare; bumped to a small
   * limit so the caller can disambiguate).
   */
  readonly findByRefcodeShort: (
    refcodeShort: string,
    limit?: number,
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & {
      bookCode: string;
      bookTitle: string;
      bookId: number;
    })[],
    ParagraphDatabaseError
  >;
  readonly getMaxPage: (bookId: number) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getPageNumbers: (
    bookId: number,
  ) => Effect.Effect<readonly number[], ParagraphDatabaseError>;

  readonly storeBibleRef: (
    bookId: number,
    refCode: string,
    bibleBook: number,
    bibleChapter: number,
    bibleVerse: Option.Option<number>,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly storeBibleRefsBatch: (
    refs: readonly {
      bookId: number;
      refCode: string;
      bibleBook: number;
      bibleChapter: number;
      bibleVerse: Option.Option<number>;
    }[],
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getBibleRefsByBook: (
    bookId: number,
  ) => Effect.Effect<readonly BibleRefRow[], ParagraphDatabaseError>;
  /**
   * Every paragraph whose `paragraph_bible_refs` row points at this verse.
   *
   * `bookAuthor` rides along with the code and title because the reverse lookup
   * spans the *whole* library, not the EGW half of it: Dan 7:25 alone answers
   * with 431 rows of which only 10 are White-Estate published. A caller that
   * has to scope the result by author (§8.4's "parallel EGW") can only do so
   * from the same `books.book_author` column §6.4's `CorpusScope` filters on,
   * and re-reading `books` per row to recover it would be one query per
   * paragraph for a column the join already visits.
   */
  readonly getParagraphsByBibleRef: (
    bibleBook: number,
    bibleChapter: number,
    bibleVerse?: number,
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & {
      bookId: number;
      bookCode: string;
      bookTitle: string;
      bookAuthor: string;
    })[],
    ParagraphDatabaseError
  >;
  /**
   * Distinct verse numbers in (bibleBook, bibleChapter) that have at least
   * one cached EGW paragraph referencing them. Used by the Bible reader to
   * mark verses with a superscript anchor in one round-trip per chapter,
   * mirroring the margin-notes `getVersesWithNotes` pattern.
   */
  readonly getBibleVersesWithCommentary: (
    bibleBook: number,
    bibleChapter: number,
  ) => Effect.Effect<readonly number[], ParagraphDatabaseError>;
  /**
   * One-shot population of `paragraph_bible_refs` from already-indexed
   * paragraphs. Skips when the table is non-empty (so a healthy install pays
   * a single COUNT(*) on boot, nothing more). When empty, streams every
   * paragraph through `extract` (extractor lives in the caller — typically
   * `extractScriptureRefs` from `@manna/core/egw`) and inserts the produced
   * rows in per-book batches.
   *
   * Exists because `storeBibleRefsBatch` was added after `storeParagraphsBatch`
   * was already populating the cache for users in the wild; without this they
   * would never see EGW commentary on Bible verses until they re-fetched
   * every chapter.
   *
   * Returns `{ scanned, inserted }` so callers can log throughput.
   */
  readonly backfillBibleRefs: (
    extract: (
      paragraphs: readonly EGWSchemas.Paragraph[],
      bookId: number,
    ) => readonly {
      bookId: number;
      refCode: string;
      bibleBook: number;
      bibleChapter: number;
      bibleVerse: Option.Option<number>;
    }[],
  ) => Effect.Effect<{ scanned: number; inserted: number }, ParagraphDatabaseError>;

  readonly setSyncStatus: (
    bookId: number,
    bookCode: string,
    status: SyncStatus,
    paragraphCount: number,
    errorMessage?: string,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly getSyncStatus: (
    bookId: number,
  ) => Effect.Effect<Option.Option<SyncStatusRow>, ParagraphDatabaseError>;
  readonly getBooksByStatus: (
    status: SyncStatus,
  ) => Effect.Effect<readonly SyncStatusRow[], ParagraphDatabaseError>;
  readonly getAllSyncStatus: Effect.Effect<readonly SyncStatusRow[], ParagraphDatabaseError>;
  readonly needsSync: (
    bookId: number,
    expected?: CorpusProvenance,
  ) => Effect.Effect<boolean, ParagraphDatabaseError>;
  /** The paragraphs the install of `revision` changed in a book, in reading
   *  order: none for a first install, or for a revision whose text is the
   *  same as the one it replaced. */
  readonly paragraphChanges: (
    bookId: number,
    revision: string,
  ) => Effect.Effect<readonly ParagraphChangeRow[], ParagraphDatabaseError>;
  /** Deletes at most `limit` change rows recorded before `recordedBefore`
   *  (an ISO time), and says how many went. A caller deletes in rounds until
   *  a round takes fewer than `limit`, so no one statement grows with the
   *  table. */
  readonly pruneParagraphChanges: (
    recordedBefore: string,
    limit: number,
  ) => Effect.Effect<number, ParagraphDatabaseError>;

  readonly rebuildFtsIndex: Effect.Effect<void, ParagraphDatabaseError>;
}

type FullParagraphRow = ParagraphRow & {
  book_code: string;
  book_title: string;
  book_author?: string;
};

const NodesJson = Schema.fromJsonString(Schema.Array(Node));
const decodeNodes = Schema.decodeUnknownSync(NodesJson);
const encodeNodes = Schema.encodeSync(NodesJson);
/** `getNearestHeadings`'s positions as one JSON parameter: `[book_id, puborder]` pairs. */
const encodePositions = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(Schema.Tuple([Schema.Finite, Schema.Finite]))),
);
/** A list of keys as one JSON parameter, read back with `json_each`.
 *
 *  One bound value however long the list is. An `IN (?, ?, ...)` binds one
 *  parameter per key, and D1 refuses a statement with more than 100 — a
 *  600-candidate identity lookup binds each key twice. */
const encodeKeys = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));
const encodeIds = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.Finite)));

/** A staged chunk of rows as one JSON parameter, unpacked with `json_each`. */
const encodeIncomingParagraphs = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(ParagraphRow)),
);
const IncomingBibleRef = Schema.Struct({
  para_ref_code: Schema.String,
  bible_book: Schema.Finite,
  bible_chapter: Schema.Finite,
  bible_verse: Schema.NullOr(Schema.Finite),
});
type IncomingBibleRef = typeof IncomingBibleRef.Type;
const encodeIncomingBibleRefs = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(IncomingBibleRef)),
);

const D1_BOUND_VALUE_CAP_BYTES = 2_000_000;

/** How many bytes of JSON one staged chunk carries.
 *
 *  D1 caps a bound value at 2 MB, and the chunk is one bound value. Half
 *  of that leaves room for whatever the measure below misses, and a chunk
 *  that size inserts in well under D1's 30 s per query. */
const INCOMING_CHUNK_BYTES = D1_BOUND_VALUE_CAP_BYTES / 2;

/** `items` in order, cut into runs whose summed `size` stays within `budget`
 *  (a single item larger than the budget is a run of its own). */
const utf8 = new TextEncoder();

/** A row's size in its chunk: its JSON, escapes and all, in UTF-8 bytes,
 *  plus the comma that separates it from the next. */
const incomingRowBytes = (row: ParagraphRow): number =>
  utf8.encode(encodeIncomingParagraphs([row])).length - 1;

/** The tables an install stages a publication in before it swaps it in.
 *
 *  Shaped like `paragraphs` and `paragraph_bible_refs`, with the same keys
 *  and no full-text index: a staged row is invisible to every reader until
 *  the swap copies it across. Created on first install rather than by
 *  `ensureParagraphSchema`, so a host that only reads (the Worker over D1)
 *  never pays for them and a host that writes always has them. */
const ensureIncomingTables = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError> =>
  Effect.gen(function* () {
    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS paragraphs_incoming (
        book_id INTEGER NOT NULL,
        ref_code TEXT NOT NULL,
        para_id TEXT,
        refcode_short TEXT,
        refcode_long TEXT,
        nodes_json TEXT NOT NULL,
        content_text TEXT NOT NULL,
        puborder INTEGER NOT NULL,
        element_type TEXT,
        element_subtype TEXT,
        page_number INTEGER,
        paragraph_number INTEGER,
        is_chapter_heading INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (book_id, ref_code)
      )
    `);
    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS paragraph_bible_refs_incoming (
        para_book_id INTEGER NOT NULL,
        para_ref_code TEXT NOT NULL,
        bible_book INTEGER NOT NULL,
        bible_chapter INTEGER NOT NULL,
        bible_verse INTEGER,
        PRIMARY KEY (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse)
      )
    `);
    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS paragraph_changes (
        book_id INTEGER NOT NULL,
        ref_code TEXT NOT NULL,
        para_id TEXT,
        refcode_short TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('added', 'removed', 'edited')),
        before_text TEXT,
        after_text TEXT,
        puborder INTEGER NOT NULL,
        from_revision TEXT,
        to_revision TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (book_id, to_revision, kind, ref_code)
      )
    `);
  });

const paragraphToRow = (
  paragraph: EGWSchemas.Paragraph,
  bookId: number,
  createdAt: string,
  updatedAt: string,
): ParagraphRow => {
  const refcodeShort = Option.getOrNull(paragraph.refcode_short);
  const paraId = Option.getOrNull(paragraph.para_id);
  const refCode =
    refcodeShort ?? paragraph.refcode_long ?? paraId ?? `book-${bookId}-para-${paragraph.puborder}`;

  const { page, paragraph: paraNum } = parseRefcodeNumbers(
    paragraph.refcode_short.pipe(Option.orElse(() => Option.fromNullishOr(paragraph.refcode_long))),
  );
  const chapterHeading = isChapterHeading(Option.fromNullishOr(paragraph.element_type));
  let chapterHeadingValue = 0;
  if (chapterHeading) chapterHeadingValue = 1;

  return {
    para_id: paraId,
    refcode_short: refcodeShort,
    refcode_long: Option.getOrNull(Option.fromNullishOr(paragraph.refcode_long)),
    nodes_json: encodeNodes(paragraph.nodes),
    content_text: nodesToText(paragraph.nodes),
    puborder: paragraph.puborder,
    element_type: Option.getOrNull(Option.fromNullishOr(paragraph.element_type)),
    element_subtype: Option.getOrNull(Option.fromNullishOr(paragraph.element_subtype)),
    book_id: bookId,
    ref_code: refCode,
    page_number: Option.getOrNull(page),
    paragraph_number: Option.getOrNull(paraNum),
    is_chapter_heading: chapterHeadingValue,
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const archivedParagraphToRow = (
  archived: PublicationArchive['paragraphs'][number],
  bookId: number,
  createdAt: string,
): ParagraphRow => {
  let chapterHeading = 0;
  if (archived.isHeading) chapterHeading = 1;
  return {
    para_id: archived.paragraph.reference.paragraphId,
    refcode_short: Option.getOrNull(archived.paragraph.refcode),
    refcode_long: wireNull,
    nodes_json: encodeNodes(archived.paragraph.nodes),
    content_text: nodesToText(archived.paragraph.nodes),
    puborder: archived.paragraph.order,
    element_type: Option.getOrNull(archived.paragraph.elementType),
    element_subtype: Option.getOrNull(archived.paragraph.elementSubtype),
    book_id: bookId,
    ref_code: archived.refcode,
    page_number: Option.getOrNull(archived.paragraph.page),
    paragraph_number: Option.getOrNull(archived.paragraph.number),
    is_chapter_heading: chapterHeading,
    created_at: createdAt,
    updated_at: createdAt,
  };
};

/** Checks one chapter against its publication and the chapters before it:
 *  every paragraph is the publication's and new, and every reference names a
 *  paragraph seen so far. `refcodes` gains the chapter's paragraphs. */
const validateChapter = (
  publication: PublicationArchive['publication'],
  chapter: ArchiveChapter,
  refcodes: Set<string>,
) =>
  Effect.gen(function* () {
    const publicationId = publication.id;
    for (const archived of chapter.paragraphs) {
      if (archived.paragraph.reference.publicationId !== publicationId) {
        return yield* ParagraphDataIntegrityError.make({
          cause: archived.paragraph.reference,
          location: `publication(${String(publicationId)}).paragraph-publication`,
        });
      }
      if (archived.paragraph.publicationCode !== publication.code) {
        return yield* ParagraphDataIntegrityError.make({
          cause: archived.paragraph.publicationCode,
          location: `publication(${String(publicationId)}).paragraph-code`,
        });
      }
      if (refcodes.has(archived.refcode)) {
        return yield* ParagraphDataIntegrityError.make({
          cause: archived.refcode,
          location: `publication(${String(publicationId)}).duplicate-refcode`,
        });
      }
      refcodes.add(archived.refcode);
    }

    for (const reference of chapter.bibleReferences) {
      if (!refcodes.has(reference.paragraphRefcode)) {
        return yield* ParagraphDataIntegrityError.make({
          cause: reference.paragraphRefcode,
          location: `publication(${String(publicationId)}).bible-reference`,
        });
      }
    }
  });

const rowToParagraph = (row: ParagraphRow) =>
  Effect.try({
    try: (): EGWSchemas.Paragraph => ({
      para_id: Option.fromNullishOr(row.para_id),
      id_prev: wireNull,
      id_next: wireNull,
      refcode_1: wireNull,
      refcode_2: wireNull,
      refcode_3: wireNull,
      refcode_4: wireNull,
      refcode_short: Option.fromNullishOr(row.refcode_short),
      refcode_long: Option.getOrNull(Option.fromNullishOr(row.refcode_long)),
      element_type: Option.getOrNull(Option.fromNullishOr(row.element_type)),
      element_subtype: Option.getOrNull(Option.fromNullishOr(row.element_subtype)),
      nodes: decodeNodes(row.nodes_json),
      puborder: row.puborder,
    }),
    catch: (cause) =>
      ParagraphDataIntegrityError.make({
        cause,
        location: `paragraphs(${row.book_id}:${row.ref_code}).nodes_json`,
      }),
  });

/** The paragraph database's schema, created or migrated in place.
 *
 *  Idempotent, and run by every host that writes: the CLI, the sync and the
 *  Bun server open a file that may be fresh or a version behind. A host that
 *  only reads an installed corpus (the Worker over D1) skips it: the import
 *  created the schema, and twenty DDL statements on every cold start are cost
 *  with nothing to show for it. */
const ensureParagraphSchema = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError> =>
  Effect.gen(function* () {
    yield* ensureSchemaVersionsTable(sql);
    const currentVersion = yield* readSchemaVersion(sql, SCHEMA_NAME);
    if (currentVersion !== 0 && currentVersion !== SCHEMA_VERSION) {
      yield* sql.unsafe(`DROP TABLE IF EXISTS paragraphs_fts`);
      yield* sql.unsafe(`DROP TABLE IF EXISTS paragraph_bible_refs`);
      yield* sql.unsafe(`DROP TABLE IF EXISTS paragraphs`);
      yield* sql
        .unsafe(`UPDATE sync_status SET status = 'pending'`)
        .pipe(Effect.catch(() => Effect.void));
    }

    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS books (
        book_id INTEGER PRIMARY KEY,
        book_code TEXT NOT NULL,
        book_title TEXT NOT NULL,
        book_author TEXT NOT NULL,
        paragraph_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    const bookColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(books)`;
    const bookColumnNames = new Set(bookColumns.map((column) => column.name));
    if (!bookColumnNames.has('book_type'))
      yield* sql.unsafe(`ALTER TABLE books ADD COLUMN book_type TEXT`);
    if (!bookColumnNames.has('book_subtype'))
      yield* sql.unsafe(`ALTER TABLE books ADD COLUMN book_subtype TEXT`);
    if (!bookColumnNames.has('folder_id'))
      yield* sql.unsafe(`ALTER TABLE books ADD COLUMN folder_id INTEGER`);
    if (!bookColumnNames.has('section'))
      yield* sql.unsafe(`ALTER TABLE books ADD COLUMN section TEXT`);

    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_books_author ON books(book_author)`);
    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_books_code ON books(book_code)`);
    yield* sql.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_books_classification ON books(section, book_type, book_subtype)`,
    );

    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS paragraphs (
        book_id INTEGER NOT NULL,
        ref_code TEXT NOT NULL,
        para_id TEXT,
        refcode_short TEXT,
        refcode_long TEXT,
        nodes_json TEXT NOT NULL,
        content_text TEXT NOT NULL,
        puborder INTEGER NOT NULL,
        element_type TEXT,
        element_subtype TEXT,
        page_number INTEGER,
        paragraph_number INTEGER,
        is_chapter_heading INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (book_id, ref_code),
        FOREIGN KEY (book_id) REFERENCES books(book_id)
      )
    `);
    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_paragraphs_book_id ON paragraphs(book_id)`);
    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_paragraphs_ref_code ON paragraphs(ref_code)`);
    yield* sql.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_paragraphs_puborder ON paragraphs(book_id, puborder)`,
    );
    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_paragraphs_para_id ON paragraphs(para_id)`);
    yield* sql.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_paragraphs_refcode_key ON paragraphs(${REFCODE_KEY_SQL})`,
    );
    yield* sql.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_paragraphs_page ON paragraphs(book_id, page_number)`,
    );
    yield* sql.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter ON paragraphs(book_id, is_chapter_heading) WHERE is_chapter_heading = 1`,
    );

    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS paragraph_bible_refs (
        para_book_id INTEGER NOT NULL,
        para_ref_code TEXT NOT NULL,
        bible_book INTEGER NOT NULL,
        bible_chapter INTEGER NOT NULL,
        bible_verse INTEGER,
        PRIMARY KEY (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse),
        FOREIGN KEY (para_book_id, para_ref_code) REFERENCES paragraphs(book_id, ref_code)
      )
    `);
    yield* sql.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_pbr_bible ON paragraph_bible_refs(bible_book, bible_chapter, bible_verse)`,
    );

    yield* sql.unsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs_fts USING fts5(
        content_text,
        refcode_short,
        book_id UNINDEXED,
        content=paragraphs,
        content_rowid=rowid
      )
    `);
    yield* sql.unsafe(`
      CREATE TRIGGER IF NOT EXISTS paragraphs_fts_after_insert
      AFTER INSERT ON paragraphs BEGIN
        INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
        VALUES (new.rowid, new.content_text, new.refcode_short, new.book_id);
      END
    `);
    yield* sql.unsafe(`
      CREATE TRIGGER IF NOT EXISTS paragraphs_fts_after_delete
      AFTER DELETE ON paragraphs BEGIN
        INSERT INTO paragraphs_fts(
          paragraphs_fts, rowid, content_text, refcode_short, book_id
        ) VALUES (
          'delete', old.rowid, old.content_text, old.refcode_short, old.book_id
        );
      END
    `);
    yield* sql.unsafe(`
      CREATE TRIGGER IF NOT EXISTS paragraphs_fts_after_update
      AFTER UPDATE ON paragraphs BEGIN
        INSERT INTO paragraphs_fts(
          paragraphs_fts, rowid, content_text, refcode_short, book_id
        ) VALUES (
          'delete', old.rowid, old.content_text, old.refcode_short, old.book_id
        );
        INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
        VALUES (new.rowid, new.content_text, new.refcode_short, new.book_id);
      END
    `);

    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS sync_status (
        book_id INTEGER PRIMARY KEY,
        book_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        last_attempt TEXT NOT NULL,
        paragraph_count INTEGER DEFAULT 0,
        source TEXT,
        revision TEXT,
        digest TEXT
      )
    `);
    const syncColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(sync_status)`;
    const syncColumnNames = new Set(syncColumns.map((column) => column.name));
    if (!syncColumnNames.has('source'))
      yield* sql.unsafe(`ALTER TABLE sync_status ADD COLUMN source TEXT`);
    if (!syncColumnNames.has('revision'))
      yield* sql.unsafe(`ALTER TABLE sync_status ADD COLUMN revision TEXT`);
    if (!syncColumnNames.has('digest'))
      yield* sql.unsafe(`ALTER TABLE sync_status ADD COLUMN digest TEXT`);
    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_status(status)`);

    yield* writeSchemaVersion(sql, SCHEMA_NAME, SCHEMA_VERSION);
  });

const layerParagraphSchema: Layer.Layer<never, SqlError, SqlClient.SqlClient> = Layer.effectDiscard(
  SqlClient.SqlClient.pipe(Effect.flatMap(ensureParagraphSchema)),
);

export class EGWParagraphDatabase extends Context.Service<
  EGWParagraphDatabase,
  EGWParagraphDatabaseService
>()('@manna/core/egw-db/book-database/EGWParagraphDatabase') {
  /**
   * Driver-agnostic layer over a database whose schema is already in place:
   * requires `SqlClient.SqlClient` and `SqlAtomic`, and runs no DDL until a
   * publication is installed. For a host whose driver has no interactive
   * transactions (the Worker over D1, which supplies `SqlAtomic` as a batch);
   * every SQLite host takes `layerCore`.
   */
  static layerExisting: Layer.Layer<EGWParagraphDatabase, never, SqlClient.SqlClient | SqlAtomic> =
    Layer.effect(
      EGWParagraphDatabase,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const atomic = yield* SqlAtomic;
        const incomingTables = yield* Effect.cached(ensureIncomingTables(sql));

        const storeBook = (book: EGWSchemas.Book) =>
          Effect.gen(function* () {
            const createdAt = DateTime.formatIso(yield* DateTime.now);
            const subtype = Option.getOrNull(
              Option.filter(
                Option.map(Option.fromNullishOr(book.subtype), (value) => value.trim()),
                (value) => value !== '',
              ),
            );
            yield* sql`
          INSERT INTO books (
            book_id, book_code, book_title, book_author, paragraph_count, created_at,
            book_type, book_subtype, folder_id
          )
          VALUES (
            ${book.book_id}, ${book.code}, ${book.title}, ${book.author}, 0, ${createdAt},
            ${book.type}, ${subtype}, ${book.folder_id}
          )
          ON CONFLICT(book_id) DO UPDATE SET
            book_code = excluded.book_code,
            book_title = excluded.book_title,
            book_author = excluded.book_author,
            book_type = excluded.book_type,
            book_subtype = excluded.book_subtype,
            folder_id = excluded.folder_id
        `;
          });

        /** Set a book's section, which the book DTO alone cannot supply.
         *
         *  `type` and `subtype` come down with the book; the section does not —
         *  it is the name of the top-level folder the book's `folder_id` sits
         *  under, which is only knowable by walking the folder tree. So it is
         *  written separately, by whatever has the tree in hand, rather than
         *  guessed from the book record. */
        const setBookSection = (bookCode: string, section: string) =>
          sql`UPDATE books SET section = ${section} WHERE book_code = ${bookCode} COLLATE NOCASE`.pipe(
            Effect.asVoid,
          );

        const getBookById = (bookId: number) =>
          sql<BookRow>`SELECT * FROM books WHERE book_id = ${bookId}`.pipe(
            Effect.map((rows) => Option.fromNullishOr(rows[0])),
          );

        const getBookByCode = (bookCode: string) =>
          sql<BookRow>`SELECT * FROM books WHERE book_code = ${bookCode} COLLATE NOCASE`.pipe(
            Effect.map((rows) => Option.fromNullishOr(rows[0])),
          );

        const getBooksByCode = (bookCode: string) =>
          sql<BookRow>`SELECT * FROM books WHERE book_code = ${bookCode} COLLATE NOCASE ORDER BY book_id`;

        const getBooksByAuthor = (author: string) =>
          Stream.fromIterableEffect(
            sql<BookRow>`SELECT * FROM books WHERE book_author = ${author} ORDER BY book_id`,
          );

        const getAllBooks = Stream.fromIterableEffect(
          sql<BookRow>`SELECT * FROM books ORDER BY book_author, book_title`,
        );

        const updateBookCount = (bookId: number) =>
          sql`
          UPDATE books SET paragraph_count = (
            SELECT COUNT(*) FROM paragraphs WHERE book_id = ${bookId}
          ) WHERE book_id = ${bookId}
        `.pipe(Effect.asVoid);

        const insertParagraphRow = (row: ParagraphRow) =>
          sql`
          INSERT INTO paragraphs (
            book_id, ref_code, para_id, refcode_short, refcode_long,
            nodes_json, content_text, puborder, element_type, element_subtype,
            page_number, paragraph_number, is_chapter_heading,
            created_at, updated_at
          ) VALUES (
            ${row.book_id}, ${row.ref_code}, ${row.para_id}, ${row.refcode_short}, ${row.refcode_long},
            ${row.nodes_json}, ${row.content_text}, ${row.puborder}, ${row.element_type}, ${row.element_subtype},
            ${row.page_number}, ${row.paragraph_number}, ${row.is_chapter_heading},
            ${row.created_at}, ${row.updated_at}
          )
          ON CONFLICT(book_id, ref_code) DO UPDATE SET
            para_id = excluded.para_id,
            refcode_short = excluded.refcode_short,
            refcode_long = excluded.refcode_long,
            nodes_json = excluded.nodes_json,
            content_text = excluded.content_text,
            puborder = excluded.puborder,
            element_type = excluded.element_type,
            element_subtype = excluded.element_subtype,
            page_number = excluded.page_number,
            paragraph_number = excluded.paragraph_number,
            is_chapter_heading = excluded.is_chapter_heading,
            updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

        /** The publication's `books` row. A classification the archive
         *  carries replaces the row's; an archive with none (a packaged one)
         *  leaves the row's classification as it was, so installing it
         *  never erases what a backfill or an earlier sync wrote. */
        const upsertPublicationBook = (
          publication: PublicationArchive['publication'],
          paragraphCount: number,
          now: string,
        ) =>
          Option.match(Option.fromUndefinedOr(publication.classification), {
            onNone: () => sql`
              INSERT INTO books (
                book_id, book_code, book_title, book_author, paragraph_count, created_at
              ) VALUES (
                ${publication.id}, ${publication.code}, ${publication.title},
                ${publication.author}, ${paragraphCount}, ${now}
              )
              ON CONFLICT(book_id) DO UPDATE SET
                book_code = excluded.book_code,
                book_title = excluded.book_title,
                book_author = excluded.book_author,
                paragraph_count = excluded.paragraph_count
            `,
            onSome: (classification) => sql`
              INSERT INTO books (
                book_id, book_code, book_title, book_author, paragraph_count, created_at,
                book_type, book_subtype, folder_id, section
              ) VALUES (
                ${publication.id}, ${publication.code}, ${publication.title},
                ${publication.author}, ${paragraphCount}, ${now},
                ${classification.type}, ${Option.getOrNull(classification.subtype)},
                ${classification.folderId}, ${Option.getOrNull(classification.section)}
              )
              ON CONFLICT(book_id) DO UPDATE SET
                book_code = excluded.book_code,
                book_title = excluded.book_title,
                book_author = excluded.book_author,
                paragraph_count = excluded.paragraph_count,
                book_type = excluded.book_type,
                book_subtype = excluded.book_subtype,
                folder_id = excluded.folder_id,
                section = excluded.section
            `,
          });

        /** The statement that records what replacing a book's paragraphs
         *  with its staged ones changes: an edited text, a paragraph removed,
         *  or one added to a book that was already there.
         *
         *  A paragraph is matched by its `para_id`, the library's own id, and
         *  by `ref_code` only when it has none: an older import keyed
         *  `ref_code` by refcode (`AA v.1`) where this one keys it by
         *  `para_id` (`127.8`), so matching by `ref_code` would report every
         *  paragraph of such a book removed and added again. The primary key
         *  makes a retried install record each change once.
         *
         *  Each side is one book, materialized with its match key as a plain
         *  column, so SQLite joins them through an automatic index. Joined on
         *  the `COALESCE` itself, no index applies and the cost grows with
         *  the square of the book: The Desire of Ages (2,705 paragraphs) took
         *  1.6 s locally that way, and over D1's limit on the library. */
        const recordParagraphChanges = (bookId: number, revision: string, now: string) => sql`
          WITH
            before AS MATERIALIZED (
              SELECT COALESCE(para_id, ref_code) AS match_key, ref_code, para_id, refcode_short,
                content_text, puborder
              FROM paragraphs WHERE book_id = ${bookId}
            ),
            after AS MATERIALIZED (
              SELECT COALESCE(para_id, ref_code) AS match_key, ref_code, para_id, refcode_short,
                content_text, puborder
              FROM paragraphs_incoming WHERE book_id = ${bookId}
            ),
            previous AS (SELECT revision FROM sync_status WHERE book_id = ${bookId})
          INSERT OR IGNORE INTO paragraph_changes (
            book_id, ref_code, para_id, refcode_short, kind,
            before_text, after_text, puborder, from_revision, to_revision, recorded_at
          )
          SELECT
            ${bookId}, a.ref_code, a.para_id, a.refcode_short, 'edited',
            b.content_text, a.content_text, a.puborder,
            (SELECT revision FROM previous), ${revision}, ${now}
          FROM before b
          JOIN after a ON a.match_key = b.match_key
          WHERE b.content_text <> a.content_text
          UNION ALL
          SELECT
            ${bookId}, b.ref_code, b.para_id, b.refcode_short, 'removed',
            b.content_text, NULL, b.puborder,
            (SELECT revision FROM previous), ${revision}, ${now}
          FROM before b
          WHERE NOT EXISTS (SELECT 1 FROM after a WHERE a.match_key = b.match_key)
          UNION ALL
          SELECT
            ${bookId}, a.ref_code, a.para_id, a.refcode_short, 'added',
            NULL, a.content_text, a.puborder,
            (SELECT revision FROM previous), ${revision}, ${now}
          FROM after a
          WHERE EXISTS (SELECT 1 FROM before)
            AND NOT EXISTS (SELECT 1 FROM before b WHERE b.match_key = a.match_key)
        `;

        const paragraphChanges = (bookId: number, revision: string) =>
          incomingTables.pipe(
            Effect.andThen(
              sql`
                SELECT * FROM paragraph_changes
                WHERE book_id = ${bookId} AND to_revision = ${revision}
                ORDER BY puborder, ref_code
              `,
            ),
            Effect.flatMap((rows) =>
              Schema.decodeUnknownEffect(Schema.Array(ParagraphChangeRow))(rows).pipe(
                Effect.mapError((cause) =>
                  ParagraphDataIntegrityError.make({
                    cause,
                    location: `publication(${String(bookId)}).changes`,
                  }),
                ),
              ),
            ),
          );

        const pruneParagraphChanges = (recordedBefore: string, limit: number) =>
          incomingTables.pipe(
            Effect.andThen(
              sql`
                DELETE FROM paragraph_changes
                WHERE rowid IN (
                  SELECT rowid FROM paragraph_changes
                  WHERE recorded_at < ${recordedBefore}
                  LIMIT ${limit}
                )
                RETURNING book_id
              `,
            ),
            Effect.map((rows) => rows.length),
          );

        const stageParagraphs = (publicationId: number, rows: readonly ParagraphRow[]) => sql`
          INSERT INTO paragraphs_incoming (
            book_id, ref_code, para_id, refcode_short, refcode_long,
            nodes_json, content_text, puborder, element_type, element_subtype,
            page_number, paragraph_number, is_chapter_heading,
            created_at, updated_at
          )
          SELECT
            ${publicationId},
            json_extract(value, '$.ref_code'),
            json_extract(value, '$.para_id'),
            json_extract(value, '$.refcode_short'),
            json_extract(value, '$.refcode_long'),
            json_extract(value, '$.nodes_json'),
            json_extract(value, '$.content_text'),
            json_extract(value, '$.puborder'),
            json_extract(value, '$.element_type'),
            json_extract(value, '$.element_subtype'),
            json_extract(value, '$.page_number'),
            json_extract(value, '$.paragraph_number'),
            json_extract(value, '$.is_chapter_heading'),
            json_extract(value, '$.created_at'),
            json_extract(value, '$.updated_at')
          FROM json_each(${encodeIncomingParagraphs(rows)})
        `;

        const stageReferences = (publicationId: number, references: readonly IncomingBibleRef[]) =>
          sql`
            INSERT INTO paragraph_bible_refs_incoming (
              para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
            )
            SELECT
              ${publicationId},
              json_extract(value, '$.para_ref_code'),
              json_extract(value, '$.bible_book'),
              json_extract(value, '$.bible_chapter'),
              json_extract(value, '$.bible_verse')
            FROM json_each(${encodeIncomingBibleRefs(references)})
          `;

        /** A live paragraph differs from its staged row `i` in a column a
         *  reader sees. `IS NOT` so that a null equals a null. */
        const paragraphDiffers = sql.literal(
          [
            'para_id',
            'refcode_short',
            'refcode_long',
            'nodes_json',
            'content_text',
            'puborder',
            'element_type',
            'element_subtype',
            'page_number',
            'paragraph_number',
            'is_chapter_heading',
          ]
            .map((column) => `paragraphs.${column} IS NOT i.${column}`)
            .join(' OR '),
        );

        /** The staged reference equal to a live one, by every column of
         *  the key; `IS` so that two verseless references match. */
        const sameStagedReference = sql.literal(`
          SELECT 1 FROM paragraph_bible_refs_incoming i
          WHERE i.para_book_id = paragraph_bible_refs.para_book_id
            AND i.para_ref_code = paragraph_bible_refs.para_ref_code
            AND i.bible_book = paragraph_bible_refs.bible_book
            AND i.bible_chapter = paragraph_bible_refs.bible_chapter
            AND i.bible_verse IS paragraph_bible_refs.bible_verse
        `);

        /** The live reference equal to a staged one `i`. */
        const sameLiveReference = sql.literal(`
          SELECT 1 FROM paragraph_bible_refs p
          WHERE p.para_book_id = i.para_book_id
            AND p.para_ref_code = i.para_ref_code
            AND p.bible_book = i.bible_book
            AND p.bible_chapter = i.bible_chapter
            AND p.bible_verse IS i.bible_verse
        `);

        const installPublication = Effect.fn('EGWParagraphDatabase.installPublication')(function* <
          E,
        >(stream: PublicationStream<E>, provenance?: CorpusProvenance) {
          yield* incomingTables;

          const publication = stream.publication;
          const publicationId = publication.id;
          const now = DateTime.formatIso(yield* DateTime.now);

          yield* sql`DELETE FROM paragraphs_incoming WHERE book_id = ${publicationId}`;
          yield* sql`DELETE FROM paragraph_bible_refs_incoming WHERE para_book_id = ${publicationId}`;

          const refcodes = new Set<string>();
          let rows: ParagraphRow[] = [];
          let rowBytes = 0;
          let references: IncomingBibleRef[] = [];
          let staged = 0;
          const flushRows = Effect.suspend(() => {
            if (rows.length === 0) return Effect.void;
            const chunk = rows;
            rows = [];
            rowBytes = 0;
            return Effect.asVoid(stageParagraphs(publicationId, chunk));
          });
          const flushReferences = Effect.suspend(() => {
            if (references.length === 0) return Effect.void;
            const chunk = references;
            references = [];
            return Effect.asVoid(stageReferences(publicationId, chunk));
          });
          yield* Stream.runForEach(stream.chapters, (chapter) =>
            Effect.gen(function* () {
              yield* validateChapter(publication, chapter, refcodes);
              for (const archived of chapter.paragraphs) {
                const row = archivedParagraphToRow(archived, publicationId, now);
                const cost = incomingRowBytes(row);
                if (rowBytes + cost > INCOMING_CHUNK_BYTES) yield* flushRows;
                rows.push(row);
                rowBytes += cost;
                staged += 1;
              }
              for (const reference of chapter.bibleReferences) {
                let verse = Option.none<number>();
                if (reference.scripture._tag === 'verse')
                  verse = Option.some(reference.scripture.verse);
                references.push({
                  para_ref_code: reference.paragraphRefcode,
                  bible_book: reference.scripture.book,
                  bible_chapter: reference.scripture.chapter,
                  bible_verse: Option.getOrNull(verse),
                });
                if (references.length >= 5_000) yield* flushReferences;
              }
            }),
          );
          yield* flushRows;
          yield* flushReferences;

          const counted = yield* sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM paragraphs_incoming WHERE book_id = ${publicationId}
          `;
          const stagedCount = counted[0]?.count ?? -1;
          if (stagedCount !== staged) {
            return yield* ParagraphDataIntegrityError.make({
              cause: { expected: staged, actual: stagedCount },
              location: `publication(${String(publicationId)}).staged-count`,
            });
          }

          const provenanceOption = Option.fromNullishOr(provenance);
          const changes = Option.match(provenanceOption, {
            onNone: () => [],
            onSome: ({ revision }) => [recordParagraphChanges(publicationId, revision, now)],
          });
          yield* atomic.run([
            ...changes,
            sql`
              DELETE FROM paragraph_bible_refs
              WHERE para_book_id = ${publicationId}
                AND NOT EXISTS (${sameStagedReference})
            `,
            sql`
              DELETE FROM paragraphs
              WHERE book_id = ${publicationId}
                AND NOT EXISTS (
                  SELECT 1 FROM paragraphs_incoming i
                  WHERE i.book_id = paragraphs.book_id AND i.ref_code = paragraphs.ref_code
                )
            `,
            upsertPublicationBook(publication, staged, now),
            sql`
              UPDATE paragraphs SET
                para_id = i.para_id,
                refcode_short = i.refcode_short,
                refcode_long = i.refcode_long,
                nodes_json = i.nodes_json,
                content_text = i.content_text,
                puborder = i.puborder,
                element_type = i.element_type,
                element_subtype = i.element_subtype,
                page_number = i.page_number,
                paragraph_number = i.paragraph_number,
                is_chapter_heading = i.is_chapter_heading,
                updated_at = i.updated_at
              FROM paragraphs_incoming i
              WHERE paragraphs.book_id = ${publicationId}
                AND i.book_id = paragraphs.book_id
                AND i.ref_code = paragraphs.ref_code
                AND (${paragraphDiffers})
            `,
            sql`
              INSERT INTO paragraphs (
                book_id, ref_code, para_id, refcode_short, refcode_long,
                nodes_json, content_text, puborder, element_type, element_subtype,
                page_number, paragraph_number, is_chapter_heading,
                created_at, updated_at
              )
              SELECT
                book_id, ref_code, para_id, refcode_short, refcode_long,
                nodes_json, content_text, puborder, element_type, element_subtype,
                page_number, paragraph_number, is_chapter_heading,
                created_at, updated_at
              FROM paragraphs_incoming i
              WHERE book_id = ${publicationId}
                AND NOT EXISTS (
                  SELECT 1 FROM paragraphs p
                  WHERE p.book_id = i.book_id AND p.ref_code = i.ref_code
                )
              ORDER BY puborder
            `,
            sql`
              INSERT INTO paragraph_bible_refs (
                para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
              )
              SELECT para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
              FROM paragraph_bible_refs_incoming i
              WHERE para_book_id = ${publicationId}
                AND NOT EXISTS (${sameLiveReference})
            `,
            sql`
              INSERT INTO sync_status (
                book_id, book_code, status, error_message, last_attempt, paragraph_count,
                source, revision, digest
              ) VALUES (
                ${publicationId}, ${publication.code}, 'success', NULL, ${now}, ${staged},
                ${Option.getOrNull(Option.map(provenanceOption, (value) => value.source))},
                ${Option.getOrNull(Option.map(provenanceOption, (value) => value.revision))},
                ${Option.getOrNull(Option.flatMap(provenanceOption, (value) => value.digest))}
              )
              ON CONFLICT(book_id) DO UPDATE SET
                book_code = excluded.book_code,
                status = excluded.status,
                error_message = NULL,
                last_attempt = excluded.last_attempt,
                paragraph_count = excluded.paragraph_count,
                source = excluded.source,
                revision = excluded.revision,
                digest = excluded.digest
            `,
            sql`DELETE FROM paragraphs_incoming WHERE book_id = ${publicationId}`,
            sql`DELETE FROM paragraph_bible_refs_incoming WHERE para_book_id = ${publicationId}`,
          ]);
          return staged;
        });

        const storeParagraph = (paragraph: EGWSchemas.Paragraph, book: EGWSchemas.Book) =>
          Effect.gen(function* () {
            const now = DateTime.formatIso(yield* DateTime.now);

            yield* storeBook(book);

            const refCode =
              Option.getOrNull(paragraph.refcode_short) ??
              paragraph.refcode_long ??
              Option.getOrNull(paragraph.para_id) ??
              `book-${book.book_id}-para-${paragraph.puborder}`;

            const existing = yield* sql<{ created_at: string }>`
            SELECT created_at FROM paragraphs
            WHERE book_id = ${book.book_id} AND ref_code = ${refCode}
          `;
            const createdAt = existing[0]?.created_at ?? now;
            const row = paragraphToRow(paragraph, book.book_id, createdAt, now);
            yield* insertParagraphRow(row);
          });

        const storeParagraphsBatch = (
          paragraphs: readonly EGWSchemas.Paragraph[],
          book: EGWSchemas.Book,
        ) =>
          sql.withTransaction(
            Effect.gen(function* () {
              const now = DateTime.formatIso(yield* DateTime.now);
              yield* storeBook(book);
              for (const paragraph of paragraphs) {
                const row = paragraphToRow(paragraph, book.book_id, now, now);
                yield* insertParagraphRow(row);
              }
              return paragraphs.length;
            }),
          );

        const getParagraph = (bookId: number, refCode: string) =>
          sql<ParagraphRow>`
          SELECT * FROM paragraphs WHERE book_id = ${bookId} AND ref_code = ${refCode}
        `.pipe(
            Effect.flatMap((rows) =>
              Option.fromNullishOr(rows[0]).pipe(
                Option.match({
                  onNone: () => Effect.succeed(Option.none<EGWSchemas.Paragraph>()),
                  onSome: (row) => rowToParagraph(row).pipe(Effect.asSome),
                }),
              ),
            ),
          );

        const toRefcodeRows = (rows: readonly ParagraphRow[]) =>
          Effect.forEach(rows, (row) =>
            rowToParagraph(row).pipe(
              Effect.map((paragraph): RefcodeRow => ({ bookId: row.book_id, paragraph })),
            ),
          );

        const refcodeKeyColumn = sql.literal(REFCODE_KEY_SQL);
        const getParagraphsByRefcode = (refcode: string) =>
          Effect.gen(function* () {
            const key = refcodeKey(refcode);
            if (key.length === 0) return [];
            const [dot, comma] = REFCODE_CHILD_SEPARATORS.map((separator) => key + separator);
            const rows = yield* sql<ParagraphRow>`
            SELECT * FROM paragraphs
            WHERE ${refcodeKeyColumn} = ${key}
               OR (${refcodeKeyColumn} >= ${dot} AND ${refcodeKeyColumn} < ${dot + REFCODE_KEY_END})
               OR (${refcodeKeyColumn} >= ${comma} AND ${refcodeKeyColumn} < ${comma + REFCODE_KEY_END})
            ORDER BY book_id, puborder
          `;
            return yield* toRefcodeRows(rows);
          });

        const getParagraphsByBook = (bookId: number) =>
          Stream.fromIterableEffect(
            sql<ParagraphRow>`
            SELECT * FROM paragraphs WHERE book_id = ${bookId} ORDER BY puborder
          `,
          ).pipe(Stream.mapEffect(rowToParagraph));

        const getParagraphsByAuthor = (author: string) =>
          Stream.fromIterableEffect(
            sql<ParagraphRow>`
            SELECT p.* FROM paragraphs p
            JOIN books b ON p.book_id = b.book_id
            WHERE b.book_author = ${author}
            ORDER BY p.book_id, p.puborder
          `,
          ).pipe(Stream.mapEffect(rowToParagraph));

        const getParagraphsByPage = (bookId: number, pageNumber: number) =>
          sql<ParagraphRow>`
          SELECT * FROM paragraphs
          WHERE book_id = ${bookId} AND page_number = ${pageNumber}
          ORDER BY puborder
        `.pipe(Effect.flatMap((rows) => Effect.forEach(rows, rowToParagraph)));

        const getChapterHeadings = (bookId: number) =>
          sql<ParagraphRow>`
          SELECT * FROM paragraphs
          WHERE book_id = ${bookId} AND is_chapter_heading = 1
          ORDER BY puborder
        `.pipe(Effect.flatMap((rows) => Effect.forEach(rows, rowToParagraph)));

        /** Served by `idx_paragraphs_chapter`, the partial index over headings:
         *  60 books' outlines read in ~8 ms against the 4.5 GB corpus. */
        const getSectionHeadings = (publicationIds: readonly number[]) => {
          if (publicationIds.length === 0) return Effect.succeed<readonly SectionHeading[]>([]);
          return sql<{
            readonly book_id: number;
            readonly puborder: number;
            readonly element_type: string;
            readonly content_text: string;
          }>`
          SELECT book_id, puborder, element_type, content_text FROM paragraphs
          WHERE book_id IN (SELECT value FROM json_each(${encodeIds(publicationIds)}))
            AND is_chapter_heading = 1
            AND element_type IN ('h1', 'h2', 'h3')
        `.pipe(
            Effect.map((rows) =>
              rows.map((row): SectionHeading => ({
                publicationId: row.book_id,
                puborder: row.puborder,
                level: headingLevel(Option.some(row.element_type)),
                title: row.content_text,
              })),
            ),
          );
        };

        /** One backward seek per position on `idx_paragraphs_puborder`: 120
         *  positions read in ~5 ms against the 4.5 GB corpus. The positions go
         *  in as one JSON parameter rather than a `VALUES` list per call. */
        const getNearestHeadings = (
          positions: readonly { readonly publicationId: number; readonly puborder: number }[],
        ) => {
          if (positions.length === 0) return Effect.succeed<readonly NearestHeading[]>([]);
          const encoded = encodePositions(
            positions.map((position) => [position.publicationId, position.puborder] as const),
          );
          return sql<{
            readonly book_id: number;
            readonly puborder: number;
            readonly heading_puborder: number;
            readonly element_type: string;
            readonly content_text: string;
          }>`
          WITH pos AS (
            SELECT json_extract(value, '$[0]') AS book_id, json_extract(value, '$[1]') AS puborder
            FROM json_each(${encoded})
          )
          SELECT pos.book_id, pos.puborder, h.puborder AS heading_puborder,
                 h.element_type, h.content_text
          FROM pos
          JOIN paragraphs h ON h.rowid = (
            SELECT p.rowid FROM paragraphs p
            WHERE p.book_id = pos.book_id AND p.puborder <= pos.puborder
              AND p.is_chapter_heading = 1
            ORDER BY p.puborder DESC
            LIMIT 1
          )
        `.pipe(
            Effect.map((rows) =>
              rows.map((row): NearestHeading => ({
                publicationId: row.book_id,
                puborder: row.puborder,
                heading: {
                  publicationId: row.book_id,
                  puborder: row.heading_puborder,
                  level: headingLevel(Option.some(row.element_type)),
                  title: row.content_text,
                },
              })),
            ),
          );
        };

        /** Every predicate over `books` that a search applies, without the
         *  `MATCH` clause.
         *
         *  Split out from `searchFilters` because two statements need it: the FTS
         *  search, which adds the MATCH, and the by-identity lookup the vector
         *  leg's candidates come back through, which has no query to match on but
         *  must honour exactly the same scope and classification rules. They were
         *  one function and the identity path simply had no filters, which made it
         *  a hole every filter leaked through. */
        const identityFilters = (options?: {
          readonly bookCode?: string;
          readonly scope?: CorpusScope;
          readonly filter?: CorpusFilter;
        }): (string | Statement.Fragment)[] => {
          const bookCode = options?.bookCode;
          const filters: (string | Statement.Fragment)[] = [];
          if (Predicate.isNotUndefined(bookCode)) {
            filters.push(sql`b.book_code = ${bookCode} COLLATE NOCASE`);
          }
          if (options?.scope === 'egw') {
            filters.push(sql.in('b.book_author', [...EGW_SCOPE_AUTHORS]));
          }
          if (options?.scope === 'pioneer') {
            filters.push(sql`NOT ${sql.in('b.book_author', [...EGW_SCOPE_AUTHORS])}`);
          }

          filters.push(
            sql`(b.book_subtype IS NULL OR NOT ${sql.in('b.book_subtype', [...EXCLUDED_SUBTYPES])})`,
          );

          const filter = options?.filter;
          if (Predicate.isNotUndefined(filter)) {
            if (filter.section.include.length > 0) {
              filters.push(sql.in('b.section', [...filter.section.include]));
            }
            if (filter.section.exclude.length > 0) {
              filters.push(
                sql`(b.section IS NULL OR NOT ${sql.in('b.section', [...filter.section.exclude])})`,
              );
            }

            if (filter.type.include.length > 0) {
              filters.push(sql.in('b.book_type', [...filter.type.include]));
            }
            if (filter.type.exclude.length > 0) {
              filters.push(
                sql`(b.book_type IS NULL OR NOT ${sql.in('b.book_type', [...filter.type.exclude])})`,
              );
            }

            if (filter.subtype.include.length > 0) {
              filters.push(sql.in('b.book_subtype', [...filter.subtype.include]));
            }
            if (filter.subtype.exclude.length > 0) {
              filters.push(
                sql`(b.book_subtype IS NULL OR NOT ${sql.in('b.book_subtype', [...filter.subtype.exclude])})`,
              );
            }

            if (filter.excludeApparatus) {
              filters.push(
                sql`(b.book_type IS NULL OR NOT ${sql.in('b.book_type', [...APPARATUS_TYPES])})`,
                sql`NOT ${sql.in('b.book_author', [...APPARATUS_AUTHORS])}`,
              );
            }
          }
          return filters;
        };

        /** The FTS search's predicates: the MATCH, plus everything above. */
        const searchFilters = (
          query: string,
          options?: {
            readonly bookCode?: string;
            readonly scope?: CorpusScope;
            readonly filter?: CorpusFilter;
          },
        ): (string | Statement.Fragment)[] => [
          sql`paragraphs_fts MATCH ${query}`,
          ...identityFilters(options),
        ];

        /** The whole match count, which the row query's `LIMIT` cannot report.
         *
         *  `searchParagraphs` pushes the caller's cap into SQL, so its result
         *  length saturates at the cap and a caller computing "how many matched"
         *  from it can never see past the cap. §6.1's `total` means the pre-cap
         *  count, so it needs its own statement — one that runs the same MATCH
         *  and the same joins but selects a count and drops the `ORDER BY`, which
         *  FTS5 does not need in order to count. */
        const countSearchParagraphs = (
          query: string,
          options?: {
            readonly bookCode?: string;
            readonly scope?: CorpusScope;
            readonly filter?: CorpusFilter;
          },
        ) =>
          sql<{ readonly total: number }>`
              SELECT count(*) AS total
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE ${sql.and(searchFilters(query, options))}
            `.pipe(Effect.map((rows) => rows[0]?.total ?? 0));

        /** The bare FTS count — see `estimateMatchCount` on the interface for why
         *  this exists beside `countSearchParagraphs` rather than reusing it. No
         *  `searchFilters`, because the joins those imply are the whole cost. */
        const estimateMatchCount = (query: string) =>
          sql<{ readonly total: number }>`
              SELECT count(*) AS total
              FROM paragraphs_fts
              WHERE paragraphs_fts MATCH ${query}
            `.pipe(Effect.map((rows) => rows[0]?.total ?? 0));

        const searchParagraphs = (
          query: string,
          options?: {
            readonly limit?: number;
            readonly bookCode?: string;
            readonly scope?: CorpusScope;
            readonly filter?: CorpusFilter;
          },
        ) => {
          const limit = options?.limit ?? 50;
          const filters = searchFilters(query, options);
          return sql<FullParagraphRow>`
              SELECT p.*, b.book_code, b.book_title, b.book_author
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE ${sql.and(filters)}
              ORDER BY bm25(paragraphs_fts)
              LIMIT ${limit}
            `.pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) =>
                rowToParagraph(row).pipe(
                  Effect.map((paragraph) => ({
                    ...paragraph,
                    bookCode: row.book_code,
                    bookTitle: row.book_title,
                    bookId: row.book_id,
                  })),
                ),
              ),
            ),
          );
        };

        /** The same statement as `searchParagraphs`, selecting `fts.rank` and the
         *  four columns §9 renders instead of the whole row.
         *
         *  It shares `searchFilters` with the other two statements for the reason
         *  they share it with each other: three MATCH-and-scope predicates
         *  written three times is three chances for the scope filter to mean
         *  something slightly different, and a search whose scoring query and
         *  whose counting query disagree about scope is a search whose
         *  short-circuit fires on a hit the reader cannot be shown. */
        const searchScoredParagraphs = (
          query: string,
          options?: {
            readonly limit?: number;
            readonly bookCode?: string;
            readonly scope?: CorpusScope;
            readonly filter?: CorpusFilter;
          },
        ) => {
          const limit = options?.limit ?? 30;
          const filters = searchFilters(query, options);
          return sql<{
            readonly book_code: string;
            readonly book_title: string;
            readonly book_author: string;
            readonly ref_code: string;
            // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
            readonly refcode_short: string | null;
            // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
            readonly para_id: string | null;
            readonly nodes_json: string;
            readonly rank: number;
            readonly book_id: number;
            readonly puborder: number;
            /** SQLite has no boolean; `is_chapter_heading` is the 0/1 integer the
             *  ingest wrote from `isChapterHeading`. Translated at this boundary
             *  like every other storage-shaped column here. */
            readonly is_chapter_heading: number;
            // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
            readonly element_subtype: string | null;
          }>`
              SELECT b.book_id, b.book_code, b.book_title, b.book_author,
                     p.ref_code, p.refcode_short, p.para_id, p.nodes_json,
                     p.puborder, p.is_chapter_heading, p.element_subtype, fts.rank
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE ${sql.and(filters)}
              ORDER BY bm25(paragraphs_fts)
              LIMIT ${limit}
            `.pipe(
            Effect.map((rows) =>
              rows.map((row): ScoredParagraphRow => ({
                bookCode: row.book_code,
                bookTitle: row.book_title,
                bookAuthor: row.book_author,
                publicationId: row.book_id,
                puborder: row.puborder,
                rawParaId: Option.fromNullishOr(row.para_id),
                para_id: paragraphIdentity(
                  row.book_code,
                  Option.fromNullishOr(row.para_id),
                  row.ref_code,
                ),
                ref_code: row.ref_code,
                refcode_short: Option.fromNullishOr(row.refcode_short),
                nodes: decodeNodes(row.nodes_json),
                rank: row.rank,
                isHeading: row.is_chapter_heading === 1,
                isFurniture: isFurniture(Option.fromNullishOr(row.element_subtype)),
              })),
            ),
          );
        };

        /** The rows behind a set of identity keys, in one `IN (...)`.
         *
         *  Matched on `b.book_code || ':' || p.para_id`, which is exactly what
         *  `paragraphIdentity` builds — the key is composed in SQL rather than
         *  decomposed in TypeScript so the two spellings cannot drift, and so a
         *  key this build did not produce simply matches nothing.
         *
         *  Rows whose `para_id` is NULL are unreachable by this lookup, which is
         *  correct: `paragraphIdentity` gives them a `#`-prefixed key that no
         *  concatenation of a NULL can equal, and SQLite's `||` yields NULL for
         *  them anyway. */
        const findParagraphsByIdentity = (
          identities: readonly string[],
          options?: {
            readonly scope?: CorpusScope;
            readonly filter?: CorpusFilter;
          },
        ) => {
          if (identities.length === 0) {
            return Effect.succeed<readonly ScoredParagraphRow[]>([]);
          }
          const predicates = identityFilters(options);
          return sql<{
            readonly book_code: string;
            readonly book_title: string;
            readonly book_author: string;
            readonly ref_code: string;
            // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
            readonly refcode_short: string | null;
            // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
            readonly para_id: string | null;
            readonly nodes_json: string;
            readonly book_id: number;
            readonly puborder: number;
            readonly is_chapter_heading: number;
            // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
            readonly element_subtype: string | null;
          }>`
              WITH wanted AS (
                SELECT DISTINCT value AS identity,
                       substr(value, instr(value, ':') + 1) AS para_id
                FROM json_each(${encodeKeys(identities)})
              )
              SELECT b.book_id, b.book_code, b.book_title, b.book_author,
                     p.ref_code, p.refcode_short, p.para_id, p.nodes_json,
                     p.puborder, p.is_chapter_heading, p.element_subtype
              FROM wanted w
              CROSS JOIN paragraphs p ON p.para_id = w.para_id
              CROSS JOIN books b ON p.book_id = b.book_id
              WHERE b.book_code || ':' || p.para_id = w.identity
                AND ${sql.and(predicates)}
            `.pipe(
            Effect.map((rows) =>
              rows.map((row): ScoredParagraphRow => ({
                bookCode: row.book_code,
                bookTitle: row.book_title,
                bookAuthor: row.book_author,
                publicationId: row.book_id,
                puborder: row.puborder,
                rawParaId: Option.fromNullishOr(row.para_id),
                para_id: paragraphIdentity(
                  row.book_code,
                  Option.fromNullishOr(row.para_id),
                  row.ref_code,
                ),
                ref_code: row.ref_code,
                refcode_short: Option.fromNullishOr(row.refcode_short),
                nodes: decodeNodes(row.nodes_json),
                rank: 0,
                isHeading: row.is_chapter_heading === 1,
                isFurniture: isFurniture(Option.fromNullishOr(row.element_subtype)),
              })),
            ),
          );
        };

        const getMaxPage = (bookId: number) =>
          sql<MaxPageRow>`
          SELECT MAX(page_number) as max_page FROM paragraphs WHERE book_id = ${bookId}
        `.pipe(Effect.map((rows) => rows[0]?.max_page ?? 1));

        const getPageNumbers = (bookId: number) =>
          sql<{ page_number: number }>`
          SELECT DISTINCT page_number FROM paragraphs
          WHERE book_id = ${bookId} AND page_number IS NOT NULL
          ORDER BY page_number
        `.pipe(Effect.map((rows) => rows.map((row) => row.page_number)));

        const findByRefcodeShort = (refcodeShort: string, limit = 5) => {
          const trimmed = refcodeShort.trim();
          const spaceAt = trimmed.indexOf(' ');
          let head = trimmed;
          let tail = '';
          if (spaceAt !== -1) {
            head = trimmed.slice(0, spaceAt);
            tail = trimmed.slice(spaceAt + 1).trim();
          }
          head = head.trim();
          const codePrefix = `${head}%`;
          return sql<FullParagraphRow>`
          SELECT p.*, b.book_code, b.book_title
          FROM paragraphs p
          JOIN books b ON p.book_id = b.book_id
          WHERE b.book_code LIKE ${codePrefix} COLLATE NOCASE
            AND (
              ${tail === ''}
              OR p.refcode_short LIKE ${`% ${tail}`} COLLATE NOCASE
              OR p.refcode_short LIKE ${`% ${tail}.%`} COLLATE NOCASE
            )
          ORDER BY b.book_code, p.puborder
          LIMIT ${limit}
        `.pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) =>
                rowToParagraph(row).pipe(
                  Effect.map((paragraph) => ({
                    ...paragraph,
                    bookCode: row.book_code,
                    bookTitle: row.book_title,
                    bookId: row.book_id,
                  })),
                ),
              ),
            ),
          );
        };

        const storeBibleRef = (
          bookId: number,
          refCode: string,
          bibleBook: number,
          bibleChapter: number,
          bibleVerse: Option.Option<number>,
        ) =>
          sql`
          INSERT OR IGNORE INTO paragraph_bible_refs
          (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse)
          VALUES (${bookId}, ${refCode}, ${bibleBook}, ${bibleChapter}, ${Option.getOrNull(bibleVerse)})
        `.pipe(Effect.asVoid);

        const storeBibleRefsBatch = (
          refs: readonly {
            bookId: number;
            refCode: string;
            bibleBook: number;
            bibleChapter: number;
            bibleVerse: Option.Option<number>;
          }[],
        ) => {
          if (refs.length === 0) return Effect.succeed(0);
          return sql.withTransaction(
            Effect.gen(function* () {
              for (const ref of refs) {
                yield* storeBibleRef(
                  ref.bookId,
                  ref.refCode,
                  ref.bibleBook,
                  ref.bibleChapter,
                  ref.bibleVerse,
                );
              }
              return refs.length;
            }),
          );
        };

        const getBibleRefsByBook = (bookId: number) =>
          sql<BibleRefRow>`
          SELECT para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
          FROM paragraph_bible_refs WHERE para_book_id = ${bookId}
        `;

        const getBibleVersesWithCommentary = (bibleBook: number, bibleChapter: number) =>
          sql<CommentaryVerseRow>`
          SELECT DISTINCT bible_verse FROM paragraph_bible_refs
          WHERE bible_book = ${bibleBook}
            AND bible_chapter = ${bibleChapter}
            AND bible_verse IS NOT NULL
          ORDER BY bible_verse
        `.pipe(
            Effect.map((rows) => {
              const out: number[] = [];
              for (const r of rows) {
                if (Predicate.isNotNull(r.bible_verse)) out.push(r.bible_verse);
              }
              return out;
            }),
          );

        const getParagraphsByBibleRef = (
          bibleBook: number,
          bibleChapter: number,
          bibleVerse?: number,
        ) => {
          let query = sql<FullParagraphRow>`
                SELECT p.*, b.book_code, b.book_title, b.book_author
                FROM paragraphs p
                JOIN paragraph_bible_refs pbr
                  ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
                JOIN books b ON p.book_id = b.book_id
                WHERE pbr.bible_book = ${bibleBook}
                  AND pbr.bible_chapter = ${bibleChapter}
                ORDER BY b.book_code, p.puborder
              `;
          if (Predicate.isNotUndefined(bibleVerse)) {
            query = sql<FullParagraphRow>`
                SELECT p.*, b.book_code, b.book_title, b.book_author
                FROM paragraphs p
                JOIN paragraph_bible_refs pbr
                  ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
                JOIN books b ON p.book_id = b.book_id
                WHERE pbr.bible_book = ${bibleBook}
                  AND pbr.bible_chapter = ${bibleChapter}
                  AND pbr.bible_verse = ${bibleVerse}
                ORDER BY b.book_code, p.puborder
              `;
          }
          return query.pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) =>
                rowToParagraph(row).pipe(
                  Effect.map((paragraph) => ({
                    ...paragraph,
                    bookId: row.book_id,
                    bookCode: row.book_code,
                    bookTitle: row.book_title,
                    bookAuthor: Option.getOrElse(Option.fromNullishOr(row.book_author), () => ''),
                  })),
                ),
              ),
            ),
          );
        };

        const setSyncStatus = (
          bookId: number,
          bookCode: string,
          status: SyncStatus,
          paragraphCount: number,
          errorMessage?: string,
        ) =>
          Effect.gen(function* () {
            const lastAttempt = DateTime.formatIso(yield* DateTime.now);
            yield* sql`
          INSERT INTO sync_status (book_id, book_code, status, error_message, last_attempt, paragraph_count)
          VALUES (${bookId}, ${bookCode}, ${status}, ${Option.getOrNull(Option.fromNullishOr(errorMessage))}, ${lastAttempt}, ${paragraphCount})
          ON CONFLICT(book_id) DO UPDATE SET
            status = excluded.status,
            error_message = excluded.error_message,
            last_attempt = excluded.last_attempt,
            paragraph_count = excluded.paragraph_count
        `;
          });

        const getSyncStatus = (bookId: number) =>
          sql<SyncStatusRow>`SELECT * FROM sync_status WHERE book_id = ${bookId}`.pipe(
            Effect.map((rows) => Option.fromNullishOr(rows[0])),
          );

        const getBooksByStatus = (status: SyncStatus) =>
          sql<SyncStatusRow>`SELECT * FROM sync_status WHERE status = ${status}`;

        const getAllSyncStatus = sql<SyncStatusRow>`SELECT * FROM sync_status ORDER BY book_code`;

        const needsSync = (bookId: number, expected?: CorpusProvenance) =>
          getSyncStatus(bookId).pipe(
            Effect.map((optStatus) => {
              if (Option.isNone(optStatus) || optStatus.value.status !== 'success') return true;
              if (Predicate.isUndefined(expected)) return false;
              const status = optStatus.value;
              if (status.source !== expected.source || status.revision !== expected.revision)
                return true;
              if (Option.isNone(expected.digest)) return false;
              return status.digest !== expected.digest.value;
            }),
          );

        const rebuildFtsIndex = sql
          .unsafe(`INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('rebuild')`)
          .pipe(Effect.asVoid);

        const backfillBibleRefs = (
          extract: (
            paragraphs: readonly EGWSchemas.Paragraph[],
            bookId: number,
          ) => readonly {
            bookId: number;
            refCode: string;
            bibleBook: number;
            bibleChapter: number;
            bibleVerse: Option.Option<number>;
          }[],
        ) =>
          Effect.gen(function* () {
            const existing = yield* sql<{ n: number }>`
            SELECT COUNT(*) AS n FROM paragraph_bible_refs LIMIT 1
          `;
            if ((existing[0]?.n ?? 0) > 0) {
              return { scanned: 0, inserted: 0 };
            }

            let scanned = 0;
            let inserted = 0;
            const books = yield* Stream.runCollect(getAllBooks);
            for (const book of books) {
              const paragraphs = yield* Stream.runCollect(getParagraphsByBook(book.book_id));
              const arr = Array.from(paragraphs);
              scanned += arr.length;
              const refs = extract(arr, book.book_id);
              if (refs.length > 0) {
                const wrote = yield* storeBibleRefsBatch(refs);
                inserted += wrote;
              }
            }
            return { scanned, inserted };
          });

        return EGWParagraphDatabase.of({
          installPublication,
          storeBook,
          setBookSection,
          getBookById,
          getBookByCode,
          getBooksByCode,
          getBooksByAuthor,
          getAllBooks,
          updateBookCount,
          storeParagraph,
          storeParagraphsBatch,
          getParagraph,
          getParagraphsByBook,
          getParagraphsByRefcode,
          getParagraphsByAuthor,
          getParagraphsByPage,
          getChapterHeadings,
          getSectionHeadings,
          getNearestHeadings,
          searchParagraphs,
          searchScoredParagraphs,
          findParagraphsByIdentity,
          countSearchParagraphs,
          estimateMatchCount,
          findByRefcodeShort,
          getMaxPage,
          getPageNumbers,
          storeBibleRef,
          storeBibleRefsBatch,
          getBibleRefsByBook,
          getParagraphsByBibleRef,
          getBibleVersesWithCommentary,
          setSyncStatus,
          getSyncStatus,
          getBooksByStatus,
          getAllSyncStatus,
          needsSync,
          paragraphChanges,
          pruneParagraphChanges,
          rebuildFtsIndex,
          backfillBibleRefs,
        });
      }),
    );

  /**
   * Driver-agnostic layer: requires `SqlClient.SqlClient`. Initializes the
   * schema (idempotent) and exposes all CRUD/query operations. Compose with
   * a SQLite driver layer (sqlite-bun, sqlite-node) via `Layer.provide`.
   */
  static layerCore: Layer.Layer<EGWParagraphDatabase, SqlError, SqlClient.SqlClient> =
    EGWParagraphDatabase.layerExisting.pipe(
      Layer.provide(Layer.merge(layerParagraphSchema, SqlAtomic.layerTransaction)),
    );

  /**
   * Test implementation with in-memory data.
   */
  static Test = (
    config: {
      books?: readonly BookRow[];
      paragraphs?: readonly TestParagraph[];
      bibleRefs?: readonly BibleRefRow[];
      syncStatuses?: readonly SyncStatusRow[];
      /** Sees each install's publication, collected whole. */
      installPublication?: (archive: PublicationArchive, provenance?: CorpusProvenance) => number;
      needsSync?: (bookId: number, expected?: CorpusProvenance) => boolean;
      paragraphChanges?: readonly ParagraphChangeRow[];
    } = {},
  ): Layer.Layer<EGWParagraphDatabase> =>
    Layer.succeed(
      EGWParagraphDatabase,
      EGWParagraphDatabase.of({
        installPublication: (stream, provenance) =>
          Effect.map(
            collectPublication(stream),
            (archive) =>
              config.installPublication?.(archive, provenance) ?? archive.paragraphs.length,
          ),
        storeBook: () => Effect.void,
        setBookSection: () => Effect.void,
        getBookById: (bookId) =>
          Effect.succeed(Option.fromNullishOr(config.books?.find((b) => b.book_id === bookId))),
        getBookByCode: (bookCode) =>
          Effect.succeed(
            Option.fromNullishOr(
              config.books?.find((b) => b.book_code.toLowerCase() === bookCode.toLowerCase()),
            ),
          ),
        getBooksByCode: (bookCode) =>
          Effect.succeed(
            config.books?.filter(
              (book) => book.book_code.toLowerCase() === bookCode.toLowerCase(),
            ) ?? [],
          ),
        getBooksByAuthor: (author) =>
          Stream.fromIterable(config.books?.filter((b) => b.book_author === author) ?? []),
        getAllBooks: Stream.suspend(() => Stream.fromIterable(config.books ?? [])),
        updateBookCount: () => Effect.void,
        storeParagraph: () => Effect.void,
        storeParagraphsBatch: (paragraphs) => Effect.succeed(paragraphs.length),
        getParagraph: (bookId, refcode) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Effect.succeed(
            Option.fromNullishOr(
              config.paragraphs?.find(
                (paragraph) =>
                  paragraph.bookCode === bookCode &&
                  (Option.getOrUndefined(paragraph.refcode_short) === refcode ||
                    paragraph.refcode_long === refcode),
              ),
            ),
          );
        },
        getParagraphsByRefcode: (refcode) => {
          const key = refcodeKey(refcode);
          const keyed = (config.paragraphs ?? []).flatMap((paragraph) => {
            const book = config.books?.find(
              (candidate) => candidate.book_code === paragraph.bookCode,
            );
            const stored = Option.getOrUndefined(paragraph.refcode_short);
            if (Predicate.isUndefined(book) || Predicate.isUndefined(stored)) return [];
            const row: RefcodeRow = { bookId: book.book_id, paragraph };
            return [{ row, key: refcodeKey(stored) }];
          });
          if (key.length === 0) return Effect.succeed([]);
          const matches = keyed.filter(
            (entry) =>
              entry.key === key ||
              REFCODE_CHILD_SEPARATORS.some((separator) => entry.key.startsWith(key + separator)),
          );
          return Effect.succeed(matches.map((entry) => entry.row));
        },
        getParagraphsByBook: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Stream.fromIterable(
            config.paragraphs?.filter((paragraph) => paragraph.bookCode === bookCode) ?? [],
          );
        },
        getParagraphsByAuthor: (author) => {
          const bookCodes = new Set(
            config.books
              ?.filter((book) => book.book_author === author)
              .map((book) => book.book_code) ?? [],
          );
          return Stream.fromIterable(
            config.paragraphs?.filter((paragraph) => bookCodes.has(paragraph.bookCode)) ?? [],
          );
        },
        getParagraphsByPage: (bookId, page) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Effect.succeed(
            config.paragraphs?.filter((paragraph) => {
              const refcode =
                Option.getOrUndefined(paragraph.refcode_short) ?? paragraph.refcode_long ?? '';
              return paragraph.bookCode === bookCode && refcode.startsWith(`${bookCode} ${page}.`);
            }) ?? [],
          );
        },
        getSectionHeadings: (publicationIds) => {
          const wanted = new Set(publicationIds);
          return Effect.succeed(
            (config.books ?? [])
              .filter((book) => wanted.has(book.book_id))
              .flatMap((book) =>
                (config.paragraphs ?? []).flatMap((paragraph): readonly SectionHeading[] => {
                  const level = headingLevel(Option.fromNullishOr(paragraph.element_type));
                  if (paragraph.bookCode !== book.book_code || level < 1 || level > 3) return [];
                  return [
                    {
                      publicationId: book.book_id,
                      puborder: paragraph.puborder,
                      level,
                      title: nodesToText(paragraph.nodes),
                    },
                  ];
                }),
              ),
          );
        },
        getNearestHeadings: (positions) =>
          Effect.succeed(
            positions.flatMap((position): readonly NearestHeading[] => {
              const bookCode = config.books?.find(
                (book) => book.book_id === position.publicationId,
              )?.book_code;
              const above = (config.paragraphs ?? []).filter(
                (paragraph) =>
                  paragraph.bookCode === bookCode &&
                  paragraph.puborder <= position.puborder &&
                  isChapterHeading(Option.fromNullishOr(paragraph.element_type)),
              );
              return Arr.match(
                above.toSorted((a, b) => b.puborder - a.puborder),
                {
                  onEmpty: () => [],
                  onNonEmpty: ([closest]) => [
                    {
                      publicationId: position.publicationId,
                      puborder: position.puborder,
                      heading: {
                        publicationId: position.publicationId,
                        puborder: closest.puborder,
                        level: headingLevel(Option.fromNullishOr(closest.element_type)),
                        title: nodesToText(closest.nodes),
                      },
                    },
                  ],
                },
              );
            }),
          ),
        getChapterHeadings: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Effect.succeed(
            config.paragraphs?.filter(
              (paragraph) =>
                paragraph.bookCode === bookCode &&
                (paragraph.element_type === 'chapter' ||
                  paragraph.element_type === 'title' ||
                  paragraph.element_type?.toLowerCase().startsWith('h')),
            ) ?? [],
          );
        },
        searchParagraphs: (query, options) =>
          Effect.succeed(
            testSearchMatches(config, query, options)
              .slice(0, options?.limit)
              .map(({ book: _book, ...row }) => row),
          ),
        searchScoredParagraphs: (query, options) =>
          Effect.succeed(
            testSearchMatches(config, query, options)
              .slice(0, options?.limit)
              .map((row): ScoredParagraphRow => ({
                bookCode: row.bookCode,
                bookTitle: row.bookTitle,
                bookAuthor: row.book.book_author,
                publicationId: row.book.book_id,
                puborder: row.puborder,
                rawParaId: row.para_id,
                para_id: paragraphIdentity(
                  row.bookCode,
                  row.para_id,
                  Option.getOrElse(row.refcode_short, () => row.refcode_long ?? ''),
                ),
                ref_code: Option.getOrElse(row.refcode_short, () => row.refcode_long ?? ''),
                refcode_short: row.refcode_short,
                nodes: row.nodes,
                rank: row.rank,
                isHeading: isChapterHeading(Option.fromNullishOr(row.element_type)),
                isFurniture: isFurniture(Option.fromNullishOr(row.element_subtype)),
              })),
          ),
        findParagraphsByIdentity: (identities, options) => {
          const wanted = new Set(identities);
          return Effect.succeed(
            (config.paragraphs ?? []).flatMap((paragraph): readonly ScoredParagraphRow[] => {
              const refCode = Option.getOrElse(
                paragraph.refcode_short,
                () => paragraph.refcode_long ?? '',
              );
              const identity = paragraphIdentity(paragraph.bookCode, paragraph.para_id, refCode);
              if (!wanted.has(identity)) return [];
              const found = Option.fromNullishOr(
                config.books?.find((row) => row.book_code === paragraph.bookCode),
              );
              if (Option.isNone(found)) return [];
              const book = found.value;
              const isEgw = EGW_SCOPE_AUTHORS.includes(book.book_author);
              if (options?.scope === 'egw' && !isEgw) return [];
              if (options?.scope === 'pioneer' && isEgw) return [];
              if (!bookMatchesFilter(book, options?.filter)) return [];
              return [
                {
                  bookCode: paragraph.bookCode,
                  bookTitle: book.book_title,
                  bookAuthor: book.book_author,
                  publicationId: book.book_id,
                  puborder: paragraph.puborder,
                  rawParaId: paragraph.para_id,
                  para_id: identity,
                  ref_code: refCode,
                  refcode_short: paragraph.refcode_short,
                  nodes: paragraph.nodes,
                  rank: 0,
                  isHeading: isChapterHeading(Option.fromNullishOr(paragraph.element_type)),
                  isFurniture: isFurniture(Option.fromNullishOr(paragraph.element_subtype)),
                },
              ];
            }),
          );
        },
        countSearchParagraphs: (query, options) =>
          Effect.succeed(testSearchMatches(config, query, options).length),
        /** The double's estimate is the unscoped match count, which is exactly
         *  what the real one computes — the double has no joins to skip. No
         *  options argument rather than an explicit empty one, so "unscoped"
         *  is spelled by omission here as it is in the real implementation. */
        estimateMatchCount: (query) => Effect.succeed(testSearchMatches(config, query).length),
        /** The locate leg's lookup, as the double models it.
         *
         *  It used to answer `[]` unconditionally, which made §9.3's locate route
         *  untestable against a fixture: the golden set declares two refcode
         *  queries as `route: 'locate'` and neither could ever produce a jump
         *  target, so no test could see the target's link — the shape round-2 B2
         *  found broken. The rules mirror the live statement: match the book by
         *  code prefix, then the tail exactly, as a child paragraph, or (for a
         *  bare code) any row in that book. */
        findByRefcodeShort: (refcodeShort, limit = 5) => {
          const trimmed = refcodeShort.trim();
          const spaceAt = trimmed.indexOf(' ');
          const split = Option.match(
            Option.liftPredicate(spaceAt, (at) => at !== -1),
            {
              onNone: () => ({ head: trimmed, tail: '' }),
              onSome: (at) => ({ head: trimmed.slice(0, at), tail: trimmed.slice(at + 1) }),
            },
          );
          const head = split.head.trim().toLowerCase();
          const tail = split.tail.trim().toLowerCase();
          return Effect.succeed(
            (config.paragraphs ?? [])
              .flatMap((paragraph) => {
                if (!paragraph.bookCode.toLowerCase().startsWith(head)) return [];
                const short = Option.getOrElse(paragraph.refcode_short, () => '').toLowerCase();
                const matches =
                  tail === '' || short.endsWith(` ${tail}`) || short.includes(` ${tail}.`);
                if (!matches) return [];
                const book = config.books?.find((row) => row.book_code === paragraph.bookCode);
                if (Predicate.isUndefined(book)) return [];
                return [
                  {
                    ...paragraph,
                    bookCode: paragraph.bookCode,
                    bookTitle: book.book_title,
                    bookId: book.book_id,
                  },
                ];
              })
              .slice(0, limit),
          );
        },
        getMaxPage: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          const pages =
            config.paragraphs
              ?.filter((paragraph) => paragraph.bookCode === bookCode)
              .flatMap((paragraph) => {
                const refcode =
                  Option.getOrUndefined(paragraph.refcode_short) ?? paragraph.refcode_long ?? '';
                const match = refcode.match(/\s(\d+)\./);
                if (match?.[1]) return [Number.parseInt(match[1], 10)];
                return [];
              }) ?? [];
          return Effect.succeed(Math.max(0, ...pages));
        },
        getPageNumbers: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          const pages = new Set(
            config.paragraphs
              ?.filter((paragraph) => paragraph.bookCode === bookCode)
              .flatMap((paragraph) => {
                const refcode =
                  Option.getOrUndefined(paragraph.refcode_short) ?? paragraph.refcode_long ?? '';
                const match = refcode.match(/\s(\d+)\./);
                if (match?.[1]) return [Number.parseInt(match[1], 10)];
                return [];
              }) ?? [],
          );
          return Effect.succeed([...pages].sort((left, right) => left - right));
        },
        storeBibleRef: () => Effect.void,
        storeBibleRefsBatch: (refs) => Effect.succeed(refs.length),
        getBibleRefsByBook: (bookId) =>
          Effect.succeed(config.bibleRefs?.filter((row) => row.para_book_id === bookId) ?? []),
        getParagraphsByBibleRef: (bibleBook, bibleChapter, bibleVerse) => {
          const matchingRefs =
            config.bibleRefs?.filter(
              (row) =>
                row.bible_book === bibleBook &&
                row.bible_chapter === bibleChapter &&
                (Predicate.isUndefined(bibleVerse) || row.bible_verse === bibleVerse),
            ) ?? [];
          return Effect.succeed(
            matchingRefs.flatMap((reference) => {
              const book = config.books?.find(
                (candidate) => candidate.book_id === reference.para_book_id,
              );
              const paragraph = config.paragraphs?.find(
                (candidate) =>
                  candidate.bookCode === book?.book_code &&
                  (Option.getOrUndefined(candidate.refcode_short) === reference.para_ref_code ||
                    candidate.refcode_long === reference.para_ref_code),
              );
              if (Predicate.isUndefined(book) || Predicate.isUndefined(paragraph)) return [];
              return [
                {
                  ...paragraph,
                  bookId: book.book_id,
                  bookCode: book.book_code,
                  bookTitle: book.book_title,
                  bookAuthor: book.book_author,
                },
              ];
            }),
          );
        },
        getBibleVersesWithCommentary: () => Effect.succeed([]),
        setSyncStatus: () => Effect.void,
        getSyncStatus: (bookId) =>
          Effect.succeed(
            Option.fromNullishOr(config.syncStatuses?.find((row) => row.book_id === bookId)),
          ),
        getBooksByStatus: (status) =>
          Effect.succeed(config.syncStatuses?.filter((row) => row.status === status) ?? []),
        getAllSyncStatus: Effect.succeed(config.syncStatuses ?? []),
        needsSync: (bookId, expected) =>
          Effect.succeed(config.needsSync?.(bookId, expected) ?? true),
        paragraphChanges: (bookId, revision) =>
          Effect.succeed(
            config.paragraphChanges?.filter(
              (row) => row.book_id === bookId && row.to_revision === revision,
            ) ?? [],
          ),
        pruneParagraphChanges: () => Effect.succeed(0),
        rebuildFtsIndex: Effect.void,
        backfillBibleRefs: () => Effect.succeed({ scanned: 0, inserted: 0 }),
      }),
    );
}
