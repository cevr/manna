import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, Layer, Match, Option } from 'effect';

import { QueryEmbedder, QueryEmbedderUnavailable } from './embedder.js';
import {
  goldenSearchLayer,
  goldenVector,
  GOLDEN_BOOKS,
  GOLDEN_PARAGRAPHS,
  goldenVectorIndexBytes,
  GOLDEN_QUERIES,
  GOLDEN_TOPIC_QUERY,
  GOLDEN_TOPIC_SLUG,
  GOLDEN_VECTOR_IDS,
} from './golden-fixture.js';
import { Node } from '../egw/ast.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { SearchQuery, type VectorAbsenceReason } from './model.js';
import { VectorIndexBytes } from './vector-artifact.js';
import { MODEL_FINGERPRINT } from './vector-index.js';
import {
  isNonSelective,
  isStrongLexicalHit,
  normalizeScore,
  SearchCorpusSources,
  SearchService,
  STRONG_SIGNAL_MIN_GAP,
  STRONG_SIGNAL_MIN_SCORE,
} from './service.js';

const embedderLayer = (fingerprint: string): Layer.Layer<QueryEmbedder> =>
  Layer.succeed(
    QueryEmbedder,
    QueryEmbedder.of({
      fingerprint,
      embedQuery: (query) => Effect.succeed(goldenVector(query)),
      embedDocument: (text) => Effect.succeed(goldenVector(text)),
    }),
  );

const search = (
  input: {
    readonly text: string;
    readonly scope?: 'egw' | 'pioneer' | 'all';
    readonly bookCode?: string;
  },
  layer: Layer.Layer<SearchService>,
) =>
  Effect.flatMap(SearchService, (service) =>
    service.query(
      SearchQuery.make({
        text: input.text,
        scope: Option.fromNullishOr(input.scope),
        bookCode: Option.fromNullishOr(input.bookCode),
        limit: Option.none(),
      }),
    ),
  ).pipe(Effect.provide(layer));

const queryWith = (query: SearchQuery, layer: Layer.Layer<SearchService>) =>
  Effect.flatMap(SearchService, (service) => service.query(query)).pipe(Effect.provide(layer));

const withIndex = (fingerprint?: string) =>
  goldenSearchLayer({
    index: Option.some(goldenVectorIndexBytes(fingerprint)),
    embedder: embedderLayer(MODEL_FINGERPRINT),
  });

const absence = (reason: VectorAbsenceReason) => reason;

describe('§9.3 the strong-BM25 short-circuit', () => {
  test('uses qmd’s two constants, unchanged', () => {
    expect(STRONG_SIGNAL_MIN_SCORE).toBe(0.85);
    expect(STRONG_SIGNAL_MIN_GAP).toBe(0.15);
  });

  test('normalizes each FTS rank with qmd’s saturating map', () => {
    expect(normalizeScore(10)).toBeCloseTo(0.91, 2);
    expect(normalizeScore(2)).toBeCloseTo(0.67, 2);
    expect(normalizeScore(0.5)).toBeCloseTo(0.33, 2);
    expect(normalizeScore(0)).toBe(0);
    expect(normalizeScore(1e6)).toBeLessThan(1);
  });

  test('is query-independent, unlike a per-query normalization', () => {
    expect(normalizeScore(4)).toBe(normalizeScore(4));
    expect(isStrongLexicalHit([4, 2.8])).toBe(isStrongLexicalHit([4, 2.8, 0.1, 0.05]));
  });

  test('fires when the normalized top hit is strong and clearly separated', () => {
    expect(isStrongLexicalHit([14, 1.429, 1.286])).toBe(true);
  });

  test('does not fire on a strong top hit in a strong field', () => {
    expect(isStrongLexicalHit([14, 13])).toBe(false);
  });

  test('does not fire on a top hit below the absolute floor', () => {
    expect(normalizeScore(4)).toBeCloseTo(0.8, 3);
    expect(isStrongLexicalHit([4, 0])).toBe(false);
    expect(isStrongLexicalHit([5.7, 0])).toBe(true);
  });

  test('does not fire on the fixture’s weak-regime query', () => {
    expect(isStrongLexicalHit([4, 2.8, 1.786, 1.714])).toBe(false);
  });

  test('fires on a lone hit, which is as separated as a hit can be', () => {
    expect(isStrongLexicalHit([14])).toBe(true);
    expect(isStrongLexicalHit([0.3])).toBe(false);
  });

  test('does not fire on an empty lexical list', () => {
    expect(isStrongLexicalHit([])).toBe(false);
  });

  test('gates only terms that match too much of the corpus to rank', () => {
    expect(isNonSelective(1_621_088)).toBe(true);
    expect(isNonSelective(940_692)).toBe(true);
    expect(isNonSelective(775_189)).toBe(true);

    expect(isNonSelective(570_900)).toBe(false);
    expect(isNonSelective(299_913)).toBe(false);
    expect(isNonSelective(68_411)).toBe(false);
    expect(isNonSelective(1_304)).toBe(false);

    expect(isNonSelective(0)).toBe(false);
  });

  it.effect('skips the vector leg end to end on a confident lexical hit', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'the sanctuary in heaven is the center' }, withIndex());
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('short-circuit'));
      expect(result.paragraphs.length).toBeGreaterThan(0);
      expect(Option.isSome(result.paragraphs[0]?.lexicalRank ?? Option.none())).toBe(true);
    }),
  );

  it.effect('runs the vector leg when the lexical top hit is weak', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'what happens at the close of probation' }, withIndex());
      expect(result.vector._tag).toBe('ran');
      if (result.vector._tag !== 'ran') return;
      expect(result.vector.scanned).toBe(GOLDEN_VECTOR_IDS.length);
    }),
  );

  it.effect('reports the narrowed scan’s own count for a book-scoped query', () =>
    Effect.gen(function* () {
      const daVectors = GOLDEN_VECTOR_IDS.filter((id) => id.startsWith('DA:')).length;
      expect(daVectors).toBeLessThan(GOLDEN_VECTOR_IDS.length);
      const result = yield* search(
        { text: 'what happens at the close of probation', bookCode: 'DA' },
        withIndex(),
      );
      expect(result.vector._tag).toBe('ran');
      if (result.vector._tag !== 'ran') return;
      expect(result.vector.scanned).toBe(daVectors);
    }),
  );
});

describe('§9.6 an absent index yields lexical-only results carrying the typed absence', () => {
  it.effect('reports `absent` and still answers', () =>
    Effect.gen(function* () {
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({ index: Option.none() }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('absent'));
      expect(result.paragraphs.length).toBeGreaterThan(0);
      for (const hit of result.paragraphs) {
        expect(Option.isSome(hit.lexicalRank)).toBe(true);
        expect(hit.vectorRank).toEqual(Option.none());
      }
    }),
  );

  it.effect('reports `embedder` when the index is present but no adapter is wired', () =>
    Effect.gen(function* () {
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({ index: Option.some(goldenVectorIndexBytes()) }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('embedder'));
      expect(result.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  it.effect('reports `embedder` when the adapter declines at embed time', () =>
    Effect.gen(function* () {
      const declining = Layer.succeed(
        QueryEmbedder,
        QueryEmbedder.of({
          fingerprint: MODEL_FINGERPRINT,
          embedQuery: () =>
            QueryEmbedderUnavailable.make({ adapter: 'test', reason: 'device lost' }),
          embedDocument: () =>
            QueryEmbedderUnavailable.make({ adapter: 'test', reason: 'device lost' }),
        }),
      );
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({
          index: Option.some(goldenVectorIndexBytes()),
          embedder: declining,
        }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('embedder'));
    }),
  );

  it.effect('reports `route` on a quoted phrase, which §9.3 makes lexical-only', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: '"the daily"' }, withIndex());
      expect(result.route).toBe('phrase');
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('route'));
    }),
  );

  it.effect('reports `route` on a query that is not wordy enough', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'sanctuary' }, withIndex());
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('route'));
    }),
  );
});

describe('§10 a fingerprint mismatch invalidates rather than misleads', () => {
  it.effect('refuses an index built for another model', () =>
    Effect.gen(function* () {
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({
          index: Option.some(goldenVectorIndexBytes('some-other-model/512d')),
          embedder: embedderLayer(MODEL_FINGERPRINT),
        }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('fingerprint'));
      for (const hit of result.paragraphs) {
        expect(hit.vectorRank).toEqual(Option.none());
      }
    }),
  );

  it.effect('refuses when the adapter is the one that drifted', () =>
    Effect.gen(function* () {
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({
          index: Option.some(goldenVectorIndexBytes()),
          embedder: embedderLayer('EmbeddingGemma-300M/768d/fp32'),
        }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('fingerprint'));
    }),
  );
});

describe('§9.4 the result is the writings, and only the writings', () => {
  it.effect('answers a topic-shaped query out of the corpus alone', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: GOLDEN_TOPIC_QUERY }, withIndex());
      const paragraphIds = result.paragraphs.map((hit) => hit.paragraphId);
      expect(paragraphIds.length).toBeGreaterThan(0);
      for (const id of paragraphIds) {
        expect(id.includes(GOLDEN_TOPIC_SLUG)).toBe(false);
      }
      for (const hit of result.paragraphs) {
        expect(Option.getOrElse(hit.refcode, () => '').length).toBeGreaterThan(0);
        expect(hit.bookCode.length).toBeGreaterThan(0);
      }
    }),
  );
});

describe('§9.4 vector-only candidates reach the result', () => {
  it.effect('returns rows the lexical leg never matched', () =>
    Effect.gen(function* () {
      const embedder = Layer.succeed(
        QueryEmbedder,
        QueryEmbedder.of({
          fingerprint: MODEL_FINGERPRINT,
          embedQuery: () => Effect.succeed(goldenVector(GOLDEN_VECTOR_IDS[2] ?? '')),
          embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
        }),
      );
      const result = yield* search(
        { text: 'zzqq wwxx yyvv uutt ssrr' },
        goldenSearchLayer({ index: Option.some(goldenVectorIndexBytes()), embedder }),
      );

      expect(result.vector._tag).toBe('ran');
      expect(result.paragraphs.length).toBeGreaterThan(0);
      for (const hit of result.paragraphs) {
        expect(hit.lexicalRank).toEqual(Option.none());
        expect(Option.isSome(hit.vectorRank)).toBe(true);
        expect(hit.snippet.length).toBeGreaterThan(0);
        expect(hit.bookTitle.length).toBeGreaterThan(0);
      }
      expect(result.paragraphs[0]?.paragraphId).toBe(GOLDEN_VECTOR_IDS[2]);
    }),
  );

  it.effect('fuses a row both legs found above one only the vector leg found', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: GOLDEN_TOPIC_QUERY }, withIndex());
      const both = result.paragraphs.filter(
        (hit) => Option.isSome(hit.lexicalRank) && Option.isSome(hit.vectorRank),
      );
      expect(both.length).toBeGreaterThan(0);
    }),
  );
});

describe('§6.5 the legs degrade on corpus faults and not on defects', () => {
  it.effect('propagates a defect rather than answering with an empty leg', () =>
    Effect.gen(function* () {
      const broken = Layer.unwrap(
        Effect.gen(function* () {
          const paragraphs = yield* EGWParagraphDatabase;
          return SearchCorpusSources.wired({
            paragraphs: {
              ...paragraphs,
              searchScoredParagraphs: () => Effect.die(new Error('decoder blew up')),
            },
          });
        }),
      ).pipe(
        Layer.provide(
          EGWParagraphDatabase.Test({ books: GOLDEN_BOOKS, paragraphs: GOLDEN_PARAGRAPHS }),
        ),
      );
      const layer = SearchService.Live.pipe(
        Layer.provide(broken),
        Layer.provide(VectorIndexBytes.None),
      );
      const outcome = yield* Effect.exit(
        search({ text: 'what happens at the close of probation' }, layer),
      );
      expect(outcome._tag).toBe('Failure');
    }),
  );

  it.effect('returns a paragraph the corpus stores with no refcode', () =>
    Effect.gen(function* () {
      const uncitable = Layer.unwrap(
        Effect.gen(function* () {
          const paragraphs = yield* EGWParagraphDatabase;
          return SearchCorpusSources.wired({ paragraphs });
        }),
      ).pipe(
        Layer.provide(
          EGWParagraphDatabase.Test({
            books: GOLDEN_BOOKS,
            paragraphs: [
              ...GOLDEN_PARAGRAPHS,
              {
                para_id: Option.some('GC-uncitable'),
                refcode_short: Option.none(),
                refcode_long: '',
                nodes: [Node.make({ _tag: 'Text', text: 'the sanctuary in heaven' })],
                puborder: 9_001,
                bookCode: 'GC',
                ftsRank: -20,
              },
            ],
          }),
        ),
      );
      const layer = SearchService.Live.pipe(
        Layer.provide(uncitable),
        Layer.provide(VectorIndexBytes.None),
      );
      const result = yield* search({ text: 'the sanctuary in heaven' }, layer);
      const found = result.paragraphs.find((hit) => hit.paragraphId === 'GC:GC-uncitable');
      expect(found).toBeDefined();
      expect(Option.isNone(found?.refcode ?? Option.some('present'))).toBe(true);
      expect(result.paragraphs.length).toBeGreaterThan(1);
    }),
  );
});

describe('headings and back matter rank after prose', () => {
  const row = (input: {
    readonly order: number;
    readonly text: string;
    readonly ftsRank: number;
    readonly element: 'h2' | 'p';
    readonly subtype?: string;
  }) => ({
    para_id: Option.some(`GC-outline-${String(input.order)}`),
    refcode_short: Option.some(`GC 9${String(input.order)}.1`),
    refcode_long: `GC 9${String(input.order)}.1`,
    nodes: [Node.make({ _tag: 'Text', text: input.text })],
    puborder: 90_000 + input.order,
    element_type: input.element,
    element_subtype: input.subtype,
    bookCode: 'GC',
    ftsRank: input.ftsRank,
  });
  const outline = [
    row({ order: 1, text: 'The Latter Rain', ftsRank: -40, element: 'h2' }),
    row({ order: 2, text: 'the latter rain ripens the harvest', ftsRank: -10, element: 'p' }),
    row({ order: 3, text: 'Appendix', ftsRank: -1, element: 'h2' }),
    row({ order: 4, text: 'Latter rain, 178, 300, 306', ftsRank: -35, element: 'p' }),
    row({ order: 5, text: 'The Loud Cry', ftsRank: -1, element: 'h2' }),
    row({
      order: 6,
      text: 'the latter rain and the loud cry come together',
      ftsRank: -8,
      element: 'p',
    }),
    row({ order: 7, text: 'Latter Rain, Iowa', ftsRank: -50, element: 'p', subtype: 'ltplace' }),
  ];
  const layer = SearchService.Live.pipe(
    Layer.provide(
      Layer.unwrap(
        Effect.gen(function* () {
          const paragraphs = yield* EGWParagraphDatabase;
          return SearchCorpusSources.wired({ paragraphs });
        }),
      ).pipe(
        Layer.provide(EGWParagraphDatabase.Test({ books: GOLDEN_BOOKS, paragraphs: outline })),
      ),
    ),
    Layer.provide(VectorIndexBytes.None),
  );
  const ask = (limit: Option.Option<number>) =>
    queryWith(
      SearchQuery.make({
        text: 'latter rain',
        scope: Option.none(),
        bookCode: Option.none(),
        limit,
      }),
      layer,
    );

  it.effect('orders prose, then headings and furniture, then back matter', () =>
    Effect.gen(function* () {
      const result = yield* ask(Option.none());
      expect(
        result.paragraphs.map((hit) => [
          hit.paragraphId,
          hit.isHeading,
          hit.isFurniture,
          hit.backMatter,
        ]),
      ).toEqual([
        ['GC:GC-outline-2', false, false, false],
        ['GC:GC-outline-6', false, false, false],
        ['GC:GC-outline-7', false, true, false],
        ['GC:GC-outline-1', true, false, false],
        ['GC:GC-outline-4', false, false, true],
      ]);
    }),
  );

  it.effect('gives a demoted row no page slot a prose row could fill', () =>
    Effect.gen(function* () {
      const result = yield* ask(Option.some(2));
      expect(result.paragraphs.map((hit) => hit.paragraphId)).toEqual([
        'GC:GC-outline-2',
        'GC:GC-outline-6',
      ]);
    }),
  );
});

describe('§9.2 scope', () => {
  it.effect('a pioneer-scoped query reaches pioneer paragraphs and has no vectors', () =>
    Effect.gen(function* () {
      const result = yield* search(
        { text: 'the king of the north shall come', scope: 'pioneer' },
        withIndex(),
      );
      expect(result.scope).toBe('pioneer');
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('absent'));
      expect(result.paragraphs.every((hit) => hit.bookCode === 'DAR')).toBe(true);
    }),
  );

  it.effect('defaults to the EGW scope the index is pinned to', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'what happens at the close of probation' }, withIndex());
      expect(result.scope).toBe('egw');
      expect(result.paragraphs.every((hit) => hit.bookCode !== 'DAR')).toBe(true);
    }),
  );
});

describe('§9.3 the locate-jump', () => {
  it.effect('routes a refcode and reports the route on the result', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'GC 425' }, withIndex());
      expect(result.route).toBe('locate');
    }),
  );
});

describe('§9.7 the golden query set', () => {
  it.effect('routes every query the way §9.3 says, with the absence §9.6 says', () =>
    Effect.gen(function* () {
      const layer = withIndex();
      for (const golden of GOLDEN_QUERIES) {
        const result = yield* queryWith(golden.query, layer);
        expect({ label: golden.label, route: result.route }).toEqual({
          label: golden.label,
          route: golden.route,
        });
        const observed = Match.value(result.vector).pipe(
          Match.tag('unavailable', (status) => Option.some(status.reason)),
          Match.orElse(() => Option.none<VectorAbsenceReason>()),
        );
        expect({ label: golden.label, absence: observed }).toEqual({
          label: golden.label,
          absence: golden.absence,
        });
      }
    }),
  );
});
