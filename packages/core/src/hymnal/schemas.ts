import { Predicate, Schema } from 'effect';

import { CategoryId, HymnId, VerseId } from '../types/ids.js';

export class HymnVerse extends Schema.Class<HymnVerse>('HymnVerse')({
  id: VerseId,
  text: Schema.String,
}) {}

export const isRefrain = (verse: HymnVerse): boolean => verse.id < 0;

export const hymnFirstLine = (verses: readonly HymnVerse[]): string => {
  const opening = verses.find((verse) => !isRefrain(verse)) ?? verses[0];
  const line = opening?.text.split('\n')[0]?.trim() ?? '';
  if (line.length > 60) return `${line.slice(0, 60)}...`;
  return line;
};

export class Hymn extends Schema.Class<Hymn>('Hymn')({
  id: HymnId,
  name: Schema.String,
  category: Schema.String,
  categoryId: CategoryId,
  verses: Schema.Array(HymnVerse),
}) {}

export class Category extends Schema.Class<Category>('Category')({
  id: CategoryId,
  name: Schema.String,
}) {}

export class HymnSummary extends Schema.Class<HymnSummary>('HymnSummary')({
  id: HymnId,
  name: Schema.String,
  category: Schema.String,
  firstLine: Schema.String,
}) {}

const Positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const VerseSpan = Schema.Struct({ from: Positive, to: Positive });
const Place = Schema.Struct({ chapter: Positive, verse: Positive });

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

export const IndexRef = Schema.Struct({
  number: Positive,
  page: Positive,
  stanza: Schema.optionalKey(Schema.String),
});
export interface IndexRef extends Schema.Schema.Type<typeof IndexRef> {}

export const PassageQuery = Schema.Struct({
  book: Positive,
  chapter: Positive,
  verse: Schema.optionalKey(Positive),
});
export interface PassageQuery extends Schema.Schema.Type<typeof PassageQuery> {}

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

export const HymnRow = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  category: Schema.String,
  category_id: Schema.Finite,
  verses: Schema.String,
});
export type HymnRow = Schema.Schema.Type<typeof HymnRow>;

export const CategoryRow = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
});
export type CategoryRow = Schema.Schema.Type<typeof CategoryRow>;
