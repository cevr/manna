import { Option, Schema } from 'effect';

import { WritingsBookCode } from '../writings/book-code.js';
import { CorpusScope } from '../writings/corpus-scope.js';
import { CorpusFilterSchema, NO_FILTER, type CorpusFilter } from '../writings/corpus-class.js';
import { TopicSlug, TopicStatus } from '../wiki/model.js';

const SearchRoute = Schema.Literals(['phrase', 'locate', 'hybrid']);
export type SearchRoute = typeof SearchRoute.Type;

export const VectorAbsenceReason = Schema.Literals([
  'absent',
  'fingerprint',
  'embedder',
  'short-circuit',
  'route',
  'loading',
]);
export type VectorAbsenceReason = typeof VectorAbsenceReason.Type;

export class VectorLegRan extends Schema.TaggedClass<VectorLegRan>('Search/VectorLegRan')('ran', {
  fingerprint: Schema.NonEmptyString,
  scanned: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
}) {}

export class VectorIndexUnavailable extends Schema.TaggedClass<VectorIndexUnavailable>(
  'Search/VectorIndexUnavailable',
)('unavailable', {
  reason: VectorAbsenceReason,
}) {}

export const VectorLegStatus = Schema.Union([VectorLegRan, VectorIndexUnavailable]);
export type VectorLegStatus = typeof VectorLegStatus.Type;

export const vectorUnavailable = (reason: VectorAbsenceReason): VectorIndexUnavailable =>
  VectorIndexUnavailable.make({ reason });

export class SearchParagraphHit extends Schema.Class<SearchParagraphHit>('Search/ParagraphHit')({
  paragraphId: Schema.NonEmptyString,
  publicationId: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  rawParaId: Schema.Option(Schema.NonEmptyString),
  refcode: Schema.Option(Schema.NonEmptyString),
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  snippet: Schema.String,
  isHeading: Schema.Boolean,
  isFurniture: Schema.Boolean,
  backMatter: Schema.Boolean,
  score: Schema.Finite,
  lexicalRank: Schema.Option(
    Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  ),
  vectorRank: Schema.Option(
    Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  ),
}) {}

export class SearchTopicHit extends Schema.Class<SearchTopicHit>('Search/TopicHit')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  status: TopicStatus,
}) {}

export class SearchLocateTarget extends Schema.Class<SearchLocateTarget>('Search/LocateTarget')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  paragraphId: Schema.NonEmptyString,
  publicationId: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  rawParaId: Schema.Option(Schema.NonEmptyString),
}) {}

export class SearchResult extends Schema.Class<SearchResult>('Search/Result')({
  query: Schema.NonEmptyString,
  route: SearchRoute,
  scope: CorpusScope,
  locate: Schema.Option(SearchLocateTarget),
  paragraphs: Schema.Array(SearchParagraphHit),
  vector: VectorLegStatus,
  nonSelective: Schema.Boolean,
}) {}

export const SearchResultJson = SearchResult;
export type SearchResultJson = typeof SearchResultJson.Encoded;

const SEARCH_HIT_LIMIT = 20;

export const SEARCH_TOPIC_LIMIT = 5;

const SEARCH_CANDIDATE_LIMIT = 30;

export const candidateLimit = (limit: number): number =>
  Math.min(Math.max(SEARCH_CANDIDATE_LIMIT, limit * 3), 600);

const SEARCH_DEFAULT_SCOPE: CorpusScope = 'egw';

export class SearchQuery extends Schema.Class<SearchQuery>('Search/Query')({
  text: Schema.NonEmptyString,
  scope: Schema.Option(CorpusScope),
  bookCode: Schema.Option(WritingsBookCode),
  filter: Schema.optionalKey(CorpusFilterSchema),
  limit: Schema.Option(
    Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  ),
}) {}

export const queryScope = (query: SearchQuery): CorpusScope =>
  Option.getOrElse(query.scope, () => SEARCH_DEFAULT_SCOPE);

export const queryLimit = (query: SearchQuery): number =>
  Option.getOrElse(query.limit, () => SEARCH_HIT_LIMIT);

export const queryFilter = (query: SearchQuery): CorpusFilter => query.filter ?? NO_FILTER;
