import { Effect, Layer, Option, Schema } from 'effect';

import { Node } from '../egw/ast.js';
import {
  EGWParagraphDatabase,
  paragraphIdentity,
  type BookRow,
  type TestParagraph,
} from '../egw-db/book-database.js';
import { WikiService } from '../wiki/service.js';
import { WikiSectionSources } from '../wiki/section-composer.js';
import { TopicDetail, TopicId } from '../topics/model.js';
import { topicSlug } from '../wiki/model.js';
import { TopicService } from '../topics/service.js';
import { SearchQuery, type SearchRoute, type VectorAbsenceReason } from './model.js';
import type { QueryEmbedder } from './embedder.js';
import { SearchCorpusSources, SearchService } from './service.js';
import { VectorIndexBytes } from './vector-artifact.js';
import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  VectorBookRange,
  VectorManifest,
  quantize,
} from './vector-index.js';

const book = (code: string, title: string, author: string, id: number): BookRow => ({
  book_id: id,
  book_code: code,
  book_title: title,
  book_author: author,
  paragraph_count: 0,
  created_at: '2026-01-01T00:00:00Z',
});

export const GOLDEN_BOOKS: readonly BookRow[] = [
  book('GC', 'The Great Controversy', 'Ellen Gould White', 1),
  book('DA', 'The Desire of Ages', 'Ellen Gould White', 2),
  book('DAR', 'Daniel and the Revelation', 'Uriah Smith', 3),
];

const paragraph = (input: {
  readonly bookCode: string;
  readonly refcode: string;
  readonly text: string;
  readonly order: number;
  readonly ftsRank?: number;
}): TestParagraph => ({
  para_id: Option.some(`${input.bookCode}-${String(input.order)}`),
  refcode_short: Option.some(input.refcode),
  refcode_long: `${input.bookCode} ${input.refcode}`,
  nodes: [Node.make({ _tag: 'Text', text: input.text })],
  puborder: input.order,
  bookCode: input.bookCode,
  ftsRank: input.ftsRank,
});

export const GOLDEN_PARAGRAPHS: readonly TestParagraph[] = [
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 425.1',
    text: 'The sanctuary in heaven is the very center of Christ’s work in behalf of men.',
    order: 1,
    ftsRank: -14,
  }),
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 425.2',
    text: 'It concerns every soul living upon the earth.',
    order: 2,
    ftsRank: -2,
  }),
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 489.1',
    text: 'When the work of the investigative judgment closes, the cases of all are decided.',
    order: 3,
    ftsRank: -3,
  }),
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 490.1',
    text: 'Probation closes and the destiny of every soul is fixed forever.',
    order: 4,
    ftsRank: -2.5,
  }),
  paragraph({
    bookCode: 'DA',
    refcode: 'DA 311.5',
    text: 'The law written in the heart is the covenant God makes with his people.',
    order: 5,
    ftsRank: -2.2,
  }),
  paragraph({
    bookCode: 'DA',
    refcode: 'DA 555.1',
    text: 'What happens when the close of probation arrives is decided by present choices.',
    order: 6,
    ftsRank: -2.8,
  }),
  paragraph({
    bookCode: 'DA',
    refcode: 'DA 556.1',
    text: 'The daily ministration of the priest prefigured the work of our high priest.',
    order: 7,
    ftsRank: -2.1,
  }),
  paragraph({
    bookCode: 'DAR',
    refcode: 'DAR 62.1',
    text: 'The sanctuary of the eighth chapter of Daniel is the sanctuary of the new covenant.',
    order: 8,
    ftsRank: -3.4,
  }),
  paragraph({
    bookCode: 'DAR',
    refcode: 'DAR 63.1',
    text: 'The daily as the pioneers used the word denotes the paganism of Rome.',
    order: 9,
    ftsRank: -2.6,
  }),
  paragraph({
    bookCode: 'DAR',
    refcode: 'DAR 280.5',
    text: 'The king of the north shall come to his end and none shall help him.',
    order: 10,
    ftsRank: -2.4,
  }),
];

export const GOLDEN_VECTOR_IDS: readonly string[] = GOLDEN_PARAGRAPHS.filter(
  (row) => row.bookCode !== 'DAR',
).map((row) =>
  paragraphIdentity(
    row.bookCode,
    row.para_id,
    Option.getOrElse(row.refcode_short, () => ''),
  ),
);

export const goldenVector = (seed: string): Int8Array => {
  const values = new Float32Array(DIMENSIONS);
  let state = 2166136261;
  for (const character of seed) {
    state = Math.imul(state ^ (character.codePointAt(0) ?? 0), 16777619) >>> 0;
  }
  for (let axis = 0; axis < DIMENSIONS; axis += 1) {
    state = Math.imul(state ^ (axis + 1), 16777619) >>> 0;
    values[axis] = (state % 2000) / 1000 - 1;
  }
  return quantize(values);
};

export const goldenVectorIndexBytes = (fingerprint: string = MODEL_FINGERPRINT): ArrayBuffer => {
  const vectors = new Int8Array(GOLDEN_VECTOR_IDS.length * DIMENSIONS);
  GOLDEN_VECTOR_IDS.forEach((id, row) => {
    vectors.set(goldenVector(id), row * DIMENSIONS);
  });
  const gc = GOLDEN_VECTOR_IDS.filter((id) => id.startsWith('GC:')).length;
  return encodeVectorIndex({
    fingerprint,
    manifest: VectorManifest.make({
      books: [
        VectorBookRange.make({ bookCode: 'GC', offset: 0, count: gc }),
        VectorBookRange.make({
          bookCode: 'DA',
          offset: gc,
          count: GOLDEN_VECTOR_IDS.length - gc,
        }),
      ],
      paragraphIds: GOLDEN_VECTOR_IDS,
    }),
    vectors,
  });
};

export const GOLDEN_TOPIC_QUERY = 'what happens at the close of probation';
export const GOLDEN_TOPIC_SLUG = topicSlug('close-of-probation');

const GOLDEN_TOPICS: readonly TopicDetail[] = [
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)(String(GOLDEN_TOPIC_SLUG)),
    name: `What happens at the close of probation`,
    alternativeNames: [],
    sections: [],
  }),
];

export const goldenTopicCatalog: Layer.Layer<WikiService> = WikiService.Absent.pipe(
  Layer.provide(TopicService.Test(GOLDEN_TOPICS)),
  Layer.provide(WikiSectionSources.NotWired),
);

export interface GoldenQuery {
  readonly label: string;
  readonly query: SearchQuery;
  readonly route: SearchRoute;
  readonly absence: Option.Option<VectorAbsenceReason>;
}

const query = (input: {
  readonly text: string;
  readonly scope?: 'egw' | 'pioneer' | 'all';
}): SearchQuery =>
  SearchQuery.make({
    text: input.text,
    scope: Option.fromNullishOr(input.scope),
    bookCode: Option.none(),
    limit: Option.none(),
  });

export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  {
    label: 'quoted phrase routes lexical-only',
    query: query({ text: '"the daily"' }),
    route: 'phrase',
    absence: Option.some('route'),
  },
  {
    label: 'refcode routes to the locate-jump',
    query: query({ text: 'GC 425' }),
    route: 'locate',
    absence: Option.some('route'),
  },
  {
    label: 'refcode with a paragraph still routes to locate',
    query: query({ text: 'DA 311.5' }),
    route: 'locate',
    absence: Option.some('route'),
  },
  {
    label: 'a one-word query is not wordy enough for the vector leg',
    query: query({ text: 'sanctuary' }),
    route: 'hybrid',
    absence: Option.some('route'),
  },
  {
    label: 'a wordy query with a weak lexical top hit runs the vector leg',
    query: query({ text: 'what happens at the close of probation' }),
    route: 'hybrid',
    absence: Option.none(),
  },
  {
    label: 'a pioneer-scoped query has no vectors to scan',
    query: query({ text: 'the king of the north', scope: 'pioneer' }),
    route: 'hybrid',
    absence: Option.some('absent'),
  },
];

export const goldenSearchSources: Layer.Layer<SearchCorpusSources> = Layer.unwrap(
  Effect.gen(function* () {
    return SearchCorpusSources.wired({
      paragraphs: yield* EGWParagraphDatabase,
    });
  }),
).pipe(
  Layer.provide(EGWParagraphDatabase.Test({ books: GOLDEN_BOOKS, paragraphs: GOLDEN_PARAGRAPHS })),
);

export const goldenSearchLayer = (input?: {
  readonly index?: Option.Option<ArrayBuffer>;
  readonly embedder?: Layer.Layer<QueryEmbedder>;
}): Layer.Layer<SearchService> => {
  const bytes = Option.match(input?.index ?? Option.none<ArrayBuffer>(), {
    onNone: () => VectorIndexBytes.None,
    onSome: (buffer) => VectorIndexBytes.layerOf(buffer),
  });

  const service = SearchService.Live.pipe(Layer.provide(goldenSearchSources), Layer.provide(bytes));
  return Option.match(Option.fromNullishOr(input?.embedder), {
    onNone: () => service,
    onSome: (embedder) => service.pipe(Layer.provide(embedder)),
  });
};
