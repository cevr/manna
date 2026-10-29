/**
 * Hymnal Schema Types
 *
 * Domain models for hymnal data using Schema.Class for serialization.
 */

import { Predicate, Schema } from 'effect';

import { CategoryId, HymnId, VerseId } from '../types/ids.js';

// ============================================================================
// Domain Models
// ============================================================================

/**
 * A single verse within a hymn: a stanza, or a refrain (negative id)
 */
export class HymnVerse extends Schema.Class<HymnVerse>('HymnVerse')({
  id: VerseId,
  text: Schema.String,
}) {}

export const isRefrain = (verse: HymnVerse): boolean => verse.id < 0;

/** A hymn's first sung line, from its opening stanza rather than its refrain,
 *  cut to 60 characters for summaries. */
export const hymnFirstLine = (verses: readonly HymnVerse[]): string => {
  const opening = verses.find((verse) => !isRefrain(verse)) ?? verses[0];
  const line = opening?.text.split('\n')[0]?.trim() ?? '';
  if (line.length > 60) return `${line.slice(0, 60)}...`;
  return line;
};

/**
 * A hymn or liturgical reading from the SDA Hymnal; IDs 696–920 are readings.
 */
export class Hymn extends Schema.Class<Hymn>('Hymn')({
  id: HymnId,
  name: Schema.String,
  category: Schema.String,
  categoryId: CategoryId,
  verses: Schema.Array(HymnVerse),
}) {}

/**
 * A category of hymns
 */
export class Category extends Schema.Class<Category>('Category')({
  id: CategoryId,
  name: Schema.String,
}) {}

/**
 * Summary of a hymn (for search results, less verbose)
 */
export class HymnSummary extends Schema.Class<HymnSummary>('HymnSummary')({
  id: HymnId,
  name: Schema.String,
  category: Schema.String,
  firstLine: Schema.String,
}) {}

// ============================================================================
// Back-matter indexes
// ============================================================================

const Positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const VerseSpan = Schema.Struct({ from: Positive, to: Positive });
const Place = Schema.Struct({ chapter: Positive, verse: Positive });

/**
 * A Scripture passage as the printed indexes give it: a book (1-66) and a
 * chapter with its verse pieces (none is the whole chapter), or a passage
 * that crosses chapters, from a place to a place. The shape of
 * `@manna/hymnal/indexes`'s `Passage`: its JSON carries no tag.
 */
export const IndexPassage = Schema.Union([
  Schema.Struct({
    _tag: Schema.tagDefaultOmit('Chapter'),
    book: Positive,
    chapter: Positive,
    verses: Schema.Array(VerseSpan),
  }),
  Schema.Struct({ _tag: Schema.tagDefaultOmit('Span'), book: Positive, from: Place, to: Place }),
]);
export type IndexPassage = typeof IndexPassage.Type;

/** A hymn or reading number, the page that prints it, and the stanza an entry names. */
export const IndexRef = Schema.Struct({
  number: Positive,
  page: Positive,
  stanza: Schema.optionalKey(Schema.String),
});
export interface IndexRef extends Schema.Schema.Type<typeof IndexRef> {}

/** A place in Scripture to look a passage up by: a chapter, or one verse of it. */
export const PassageQuery = Schema.Struct({
  book: Positive,
  chapter: Positive,
  verse: Schema.optionalKey(Positive),
});
export interface PassageQuery extends Schema.Schema.Type<typeof PassageQuery> {}

/** Where one hymn (1-695) stands in each back-matter index, in the printed order. */
export const HymnIndexes = Schema.Struct({
  number: Positive,
  topics: Schema.Array(
    Schema.Struct({ name: Schema.String, parent: Schema.optionalKey(Schema.String) }),
  ),
  passages: Schema.Array(
    Schema.Struct({ passage: IndexPassage, stanza: Schema.optionalKey(Schema.String) }),
  ),
  see: Schema.Array(Positive),
  tunes: Schema.Array(Schema.Struct({ name: Schema.String, alias: Schema.Boolean })),
  metres: Schema.Array(Schema.String),
  authors: Schema.Array(Schema.String),
  composers: Schema.Array(Schema.String),
});
export interface HymnIndexes extends Schema.Schema.Type<typeof HymnIndexes> {}

const placeKey = (chapter: number, verse: number) => chapter * 1000 + verse;

/**
 * Whether a passage reaches a query: a chapter with no pieces covers each of
 * its verses, a piece covers `from..to`, and a span every place from `from`
 * to `to`. With no verse, any passage that touches the chapter reaches it.
 */
export const passageReaches = (passage: IndexPassage, query: PassageQuery): boolean => {
  if (passage.book !== query.book) return false;
  const { chapter, verse } = query;
  if (passage._tag === 'Chapter') {
    if (passage.chapter !== chapter) return false;
    if (Predicate.isUndefined(verse) || passage.verses.length === 0) return true;
    return passage.verses.some((piece) => piece.from <= verse && verse <= piece.to);
  }
  if (Predicate.isUndefined(verse))
    return passage.from.chapter <= chapter && chapter <= passage.to.chapter;
  const at = placeKey(chapter, verse);
  return (
    placeKey(passage.from.chapter, passage.from.verse) <= at &&
    at <= placeKey(passage.to.chapter, passage.to.verse)
  );
};

// ============================================================================
// Database Row Types (internal)
// ============================================================================

/**
 * Raw hymn row from SQLite
 */
export const HymnRow = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  category: Schema.String,
  category_id: Schema.Finite,
  verses: Schema.String, // JSON array
});
export type HymnRow = Schema.Schema.Type<typeof HymnRow>;

/**
 * Raw category row from SQLite
 */
export const CategoryRow = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
});
export type CategoryRow = Schema.Schema.Type<typeof CategoryRow>;
