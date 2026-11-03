import { type Array as Arr, Schema as S } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';

import {
  BookSubtype,
  BookType,
  CorpusScope,
  CorpusSection,
  EXCLUDE_PREFIX,
  isBookSubtype,
  isBookType,
  isCorpusScope,
  isCorpusSection,
  NO_SELECTION,
  SELECTABLE_SUBTYPES,
  Signed,
  SignedFromStrings,
} from '@manna/core/writings';

export {
  BookSubtype,
  BookType,
  CorpusScope,
  CorpusSection,
  EXCLUDE_PREFIX,
  isBookSubtype,
  isBookType,
  isCorpusScope,
  isCorpusSection,
  NO_SELECTION,
  SELECTABLE_SUBTYPES,
  Signed,
  SignedFromStrings,
};

export const DEFAULT_LIMIT = 40;

export const PAGE_CONTEXT = 3;

export const EXAMPLE_QUERIES: Arr.NonEmptyReadonlyArray<string> = [
  'walk through the fire',
  'time of trouble',
  'latter rain',
  'the shaking',
  'loud cry',
];

export const readerUrl = (paragraphId: string): string =>
  `https://egwwritings.org/read?panels=p${encodeURIComponent(paragraphId)}&index=0`;

export const ContextParagraphSchema = S.Struct({
  refcode: S.NullOr(S.String),
  text: S.String,
  url: S.NullOr(S.String),
  isHeading: S.Boolean,
});
export type ContextParagraph = S.Schema.Type<typeof ContextParagraphSchema>;

export const SearchHitSchema = S.Struct({
  refcode: S.NullOr(S.String),
  bookCode: S.String,
  bookTitle: S.String,
  author: S.String,
  text: S.String,
  isHeading: S.Boolean,
  backMatter: S.Boolean,
  lexicalRank: S.NullOr(S.Finite),
  vectorRank: S.NullOr(S.Finite),
  url: S.NullOr(S.String),
  before: S.Array(ContextParagraphSchema),
  after: S.Array(ContextParagraphSchema),
});
export type SearchHitWire = S.Schema.Type<typeof SearchHitSchema>;

export const SearchResponseSchema = S.Struct({
  hits: S.Array(SearchHitSchema),
  scope: CorpusScope,
  vector: S.String,
  nonSelective: S.Boolean,
});
export type SearchResponse = S.Schema.Type<typeof SearchResponseSchema>;

export const SearchRequest = S.Struct({
  q: S.String,
  scope: CorpusScope,
  section: Signed(CorpusSection),
  type: Signed(BookType),
  subtype: Signed(BookSubtype),
  excludeApparatus: S.Boolean,
  limit: S.Finite,
  context: S.Finite,
});
export type SearchRequest = S.Schema.Type<typeof SearchRequest>;

export const SearchSlot = S.Union([
  S.TaggedStruct('Answered', { response: SearchResponseSchema }),
  S.TaggedStruct('Failed', { message: S.String }),
]);
export type SearchSlot = S.Schema.Type<typeof SearchSlot>;

export const MAX_BATCH = 8;

export class SearchFailed extends S.TaggedError<SearchFailed>()(
  'SearchFailed',
  { message: S.String },
  { httpApiStatus: 500 },
) {}

export const SearchGroup = HttpApiGroup.make('search')
  .add(
    HttpApiEndpoint.get('query', '/api/search', {
      query: {
        q: S.String,
        limit: S.optional(S.FiniteFromString),
        context: S.optional(S.FiniteFromString),
        scope: S.optional(CorpusScope),
        section: S.optional(SignedFromStrings(CorpusSection)),
        type: S.optional(SignedFromStrings(BookType)),
        subtype: S.optional(SignedFromStrings(BookSubtype)),
        noref: S.optional(S.String),
      },
      success: SearchResponseSchema,
      error: [SearchFailed],
    }),
  )
  .add(
    HttpApiEndpoint.post('batch', '/api/search/batch', {
      payload: S.Struct({ requests: S.Array(SearchRequest).check(S.isMaxLength(MAX_BATCH)) }),
      success: S.Struct({ results: S.Array(SearchSlot) }),
    }),
  )
  .add(
    HttpApiEndpoint.get('health', '/health', {
      success: S.Struct({
        ok: S.Boolean,
        vector: S.String,
      }),
    }),
  );

export class SearchApi extends HttpApi.make('EGWSearch').add(SearchGroup) {}
