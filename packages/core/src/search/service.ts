import { Array as Arr, Context, Effect, Layer, Option, Stream } from 'effect';

import { nodesToText } from '../egw/ast.js';
import {
  bookMatchesFilter,
  ftsTermQuery,
  paragraphIdentity,
  type EGWParagraphDatabaseService,
  type ScoredParagraphRow,
} from '../egw-db/book-database.js';
import type { CorpusScope } from '../writings/corpus-scope.js';
import type { CorpusFilter } from '../writings/corpus-class.js';
import { backMatterClassifier } from './back-matter.js';
import { QueryEmbedder, type QueryEmbedderApi } from './embedder.js';
import { fuse, ORIGINAL_QUERY_WEIGHT, type FusionList } from './fusion.js';
import {
  queryFilter,
  queryLimit,
  queryScope,
  candidateLimit,
  SearchLocateTarget,
  SearchParagraphHit,
  SearchResult,
  vectorUnavailable,
  VectorLegRan,
  type SearchQuery,
  type VectorLegStatus,
} from './model.js';
import { route, type RoutedQuery } from './router.js';
import {
  loadVectorIndex,
  ResolvedVectorIndex,
  VectorIndexBytes,
  type LoadedVectorIndex,
} from './vector-artifact.js';
import { primeVectorAccel, readyVectorAccel } from './vector-accel.js';
import { scanVectorIndex, type VectorIndex } from './vector-index.js';
import {
  VectorNeighbors,
  type NeighborScope,
  type VectorNeighborsApi,
} from './vector-neighbors.js';

interface SearchServiceApi {
  readonly query: (input: SearchQuery) => Effect.Effect<SearchResult>;
}

export const STRONG_SIGNAL_MIN_SCORE = 0.85;

export const STRONG_SIGNAL_MIN_GAP = 0.15;

export const normalizeScore = (score: number): number => {
  const magnitude = Math.abs(score);
  return magnitude / (1 + magnitude);
};

export const isStrongLexicalHit = (scores: readonly number[]): boolean =>
  Option.match(Arr.get(scores, 0), {
    onNone: () => false,
    onSome: (rawTop) => {
      const top = normalizeScore(rawTop);
      if (top < STRONG_SIGNAL_MIN_SCORE) return false;
      return Option.match(Arr.get(scores, 1), {
        onNone: () => true,
        onSome: (rawRunnerUp) => top - normalizeScore(rawRunnerUp) >= STRONG_SIGNAL_MIN_GAP,
      });
    },
  });

interface SearchParagraphRow {
  readonly paragraphId: string;
  readonly publicationId: number;
  readonly puborder: number;
  readonly rawParaId: Option.Option<string>;
  readonly refcode: Option.Option<string>;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly author: string;
  readonly snippet: string;
  readonly isHeading: boolean;
  readonly isFurniture: boolean;
  readonly score: number;
}

interface SearchSources {
  readonly paragraphs: EGWParagraphDatabaseService;
}

type SearchSourcing =
  | { readonly _tag: 'wired'; readonly sources: SearchSources }
  | { readonly _tag: 'not-wired' };

export class SearchCorpusSources extends Context.Service<SearchCorpusSources, SearchSourcing>()(
  '@manna/core/search/SearchCorpusSources',
) {
  static NotWired: Layer.Layer<SearchCorpusSources> = Layer.succeed(
    SearchCorpusSources,
    SearchCorpusSources.of({
      _tag: 'not-wired',
    }),
  );

  static wired = (sources: SearchSources): Layer.Layer<SearchCorpusSources> =>
    Layer.succeed(SearchCorpusSources, SearchCorpusSources.of({ _tag: 'wired', sources }));
}

const ftsQuery = (routed: RoutedQuery): string => {
  if (routed._tag === 'phrase') return `"${routed.phrase.replace(/"/gu, '""')}"`;
  if (routed._tag === 'locate') return `"${routed.refcode.replace(/"/gu, '""')}"`;
  return Option.getOrElse(ftsTermQuery(routed.text), () => '""');
};

const isNonEmpty = (value: string): boolean => value.length > 0;

const toRow = (row: ScoredParagraphRow): SearchParagraphRow => ({
  paragraphId: row.para_id,
  publicationId: row.publicationId,
  puborder: row.puborder,
  rawParaId: row.rawParaId,
  refcode: Option.orElse(Option.filter(row.refcode_short, isNonEmpty), () =>
    Option.filter(Option.some(row.ref_code), isNonEmpty),
  ),
  bookCode: row.bookCode,
  bookTitle: row.bookTitle,
  author: row.bookAuthor,
  snippet: nodesToText(row.nodes),
  isHeading: row.isHeading,
  isFurniture: row.isFurniture,
  score: -row.rank,
});

const NON_SELECTIVE_MATCHES = 750_000;

export const isNonSelective = (matches: number): boolean => matches > NON_SELECTIVE_MATCHES;

interface LexicalLegResult {
  readonly rows: readonly SearchParagraphRow[];
  readonly nonSelective: boolean;
  readonly matches: number;
}

const lexicalLeg = (
  sources: SearchSources,
  routed: RoutedQuery,
  scope: CorpusScope,
  bookCode: Option.Option<string>,
  filter: CorpusFilter,
  candidates: number,
): Effect.Effect<LexicalLegResult> =>
  Effect.gen(function* () {
    const query = ftsQuery(routed);
    const options = {
      scope,
      bookCode: Option.getOrUndefined(bookCode),
      filter,
    };
    const matches = yield* sources.paragraphs.estimateMatchCount(query);
    if (isNonSelective(matches)) {
      yield* Effect.logInfo('search.lexical.non_selective').pipe(
        Effect.annotateLogs({ matches, threshold: NON_SELECTIVE_MATCHES }),
      );
      return { rows: [], nonSelective: true, matches };
    }
    const rows = yield* sources.paragraphs
      .searchScoredParagraphs(query, { ...options, limit: candidates })
      .pipe(Effect.map((scored) => scored.map(toRow)));
    return { rows, nonSelective: false, matches };
  }).pipe(
    Effect.catchTag(['SqlError', 'ParagraphDataIntegrityError'], (cause) =>
      Effect.logWarning('search.lexical.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause) }),
        Effect.as<LexicalLegResult>({ rows: [], nonSelective: false, matches: 0 }),
      ),
    ),
  );

const vectorLeg = (
  deps: SearchDeps,
  routed: RoutedQuery,
  lexical: readonly SearchParagraphRow[],
  scope: CorpusScope,
  bookCode: Option.Option<string>,
  filter: CorpusFilter,
  candidates: number,
): Effect.Effect<{ readonly ids: readonly string[]; readonly status: VectorLegStatus }> =>
  Effect.gen(function* () {
    if (routed._tag !== 'hybrid') {
      return { ids: [], status: vectorUnavailable('route') };
    }
    if (!routed.wordy) return { ids: [], status: vectorUnavailable('route') };
    if (scope === 'pioneer') return { ids: [], status: vectorUnavailable('absent') };
    if (isStrongLexicalHit(lexical.map((row) => row.score))) {
      return { ids: [], status: vectorUnavailable('short-circuit') };
    }

    const state = deps.neighbors.state;
    if (state._tag === 'unavailable') return { ids: [], status: state.absence };

    const embedder = deps.embedder;
    if (Option.isNone(embedder)) return { ids: [], status: vectorUnavailable('embedder') };
    if (embedder.value.fingerprint !== state.fingerprint) {
      return { ids: [], status: vectorUnavailable('fingerprint') };
    }

    return yield* nearestWith(embedder.value, deps.neighbors, routed.text, {
      topK: candidates,
      bookCode,
      filter,
    });
  });

const nearestWith = (
  embedder: QueryEmbedderApi,
  neighbors: VectorNeighborsApi,
  text: string,
  scope: NeighborScope,
): Effect.Effect<{ readonly ids: readonly string[]; readonly status: VectorLegStatus }> =>
  Effect.gen(function* () {
    const embedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const vector = yield* embedder.embedQuery(text);
    const nearestAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const found = yield* neighbors.nearest(vector, scope);
    const doneAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    yield* Effect.logInfo('search.vector.timing').pipe(
      Effect.annotateLogs({
        embedMs: nearestAt - embedAt,
        scanMs: doneAt - nearestAt,
        scanned: found.scanned,
        accel: found.engine,
      }),
    );
    return {
      ids: found.ids,
      status: VectorLegRan.make({
        fingerprint: embedder.fingerprint,
        scanned: found.scanned,
      }) satisfies VectorLegStatus,
    };
  }).pipe(
    Effect.catchTags({
      'Search/QueryEmbedderUnavailable': () =>
        Effect.succeed({
          ids: [],
          status: vectorUnavailable('embedder') satisfies VectorLegStatus,
        }),
      'Search/VectorNeighborsUnavailable': (error) =>
        Effect.logWarning('search.vector.degraded').pipe(
          Effect.annotateLogs({ engine: error.engine, reason: error.reason }),
          Effect.as({
            ids: [],
            status: vectorUnavailable('absent') satisfies VectorLegStatus,
          }),
        ),
    }),
  );

const allowedBookCodes = (
  sourcing: SearchSourcing,
  scope: NeighborScope,
): Effect.Effect<Option.Option<ReadonlySet<string>>> => {
  if (Option.isSome(scope.bookCode)) {
    return Effect.succeedSome(new Set([scope.bookCode.value]));
  }
  if (sourcing._tag === 'not-wired') return Effect.succeedNone;
  return Stream.runFold(
    sourcing.sources.paragraphs.getAllBooks,
    () => new Set<string>(),
    (codes: Set<string>, book) => {
      if (bookMatchesFilter(book, scope.filter)) codes.add(book.book_code);
      return codes;
    },
  ).pipe(
    Effect.map((codes) => Option.some<ReadonlySet<string>>(codes)),
    Effect.catchCause((cause) =>
      Effect.logWarning('search.vectorAllow.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause) }),
        Effect.as(Option.none<ReadonlySet<string>>()),
      ),
    ),
  );
};

const scanScope = (
  allow: Option.Option<ReadonlySet<string>>,
  topK: number,
): { readonly topK: number; readonly allow?: ReadonlySet<string> } =>
  Option.match(allow, {
    onNone: () => ({ topK }),
    onSome: (codes) => ({ topK, allow: codes }),
  });

const flatVectorNeighbors = (
  index: LoadedVectorIndex,
  sourcing: SearchSourcing,
): VectorNeighborsApi => {
  if (index._tag === 'unavailable') {
    return {
      state: { _tag: 'unavailable', absence: index.absence },
      nearest: () => Effect.succeed({ ids: [], scanned: 0, engine: 'none' }),
    };
  }
  const flat: VectorIndex = index.index;
  return {
    state: { _tag: 'ready', fingerprint: flat.fingerprint },
    nearest: (vector, scope) =>
      allowedBookCodes(sourcing, scope).pipe(
        Effect.map((allow) => {
          const accel = readyVectorAccel(flat);
          const scan = scanVectorIndex(flat, vector, {
            ...scanScope(allow, scope.topK),
            ...Option.match(accel, {
              onNone: () => ({}),
              onSome: (ready) => ({ scoreRange: ready.scoreRange }),
            }),
          });
          return {
            ids: scan.neighbors.map((neighbor) => neighbor.paragraphId),
            scanned: scan.scanned,
            engine: Option.match(accel, {
              onNone: () => 'js',
              onSome: (ready) => ready.kind,
            }),
          };
        }),
      ),
  };
};

const locateTarget = (
  sources: SearchSources,
  refcode: string,
): Effect.Effect<Option.Option<SearchLocateTarget>> =>
  sources.paragraphs.findByRefcodeShort(refcode, 1).pipe(
    Effect.map((rows) =>
      Option.map(Option.fromNullishOr(rows[0]), (row) => {
        const found = Option.getOrElse(row.refcode_short, () => refcode);
        return SearchLocateTarget.make({
          refcode: found,
          bookCode: row.bookCode,
          bookTitle: row.bookTitle,
          publicationId: row.bookId,
          rawParaId: Option.filter(row.para_id, (value) => value.length > 0),
          paragraphId: paragraphIdentity(row.bookCode, row.para_id, found),
        });
      }),
    ),
    Effect.catchTag(['SqlError', 'ParagraphDataIntegrityError'], (cause) =>
      Effect.logWarning('search.locate.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause) }),
        Effect.as(Option.none<SearchLocateTarget>()),
      ),
    ),
  );

const vectorWhy = (status: VectorLegStatus): string | number => {
  if (status._tag === 'unavailable') return status.reason;
  return status.scanned;
};

const locateLeg = (
  sources: SearchSources,
  routed: RoutedQuery,
): Effect.Effect<Option.Option<SearchLocateTarget>> => {
  if (routed._tag === 'locate') return locateTarget(sources, routed.refcode);
  return Effect.succeed(Option.none<SearchLocateTarget>());
};

const vectorOnlyBodies = (
  sources: SearchSources,
  lexical: readonly SearchParagraphRow[],
  vectorIds: readonly string[],
  scope: CorpusScope,
  filter: CorpusFilter,
): Effect.Effect<readonly SearchParagraphRow[]> => {
  const known = new Set(lexical.map((row) => row.paragraphId));
  const missing = vectorIds.filter((id) => !known.has(id));
  if (missing.length === 0) return Effect.succeed([]);
  return Effect.gen(function* () {
    const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const found = yield* sources.paragraphs.findParagraphsByIdentity(missing, { scope, filter });
    const lookedUpAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const mapped = found.map(toRow);
    const mappedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    yield* Effect.logInfo('search.bodies.timing').pipe(
      Effect.annotateLogs({
        lookupMs: lookedUpAt - startedAt,
        hitsMs: mappedAt - lookedUpAt,
        wanted: missing.length,
        got: found.length,
      }),
    );
    return mapped;
  }).pipe(
    Effect.catchTag(['SqlError', 'ParagraphDataIntegrityError'], (cause) =>
      Effect.logWarning('search.vectorBodies.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause), wanted: missing.length }),
        Effect.as<readonly SearchParagraphRow[]>([]),
      ),
    ),
  );
};

const backMatterOf = (
  sources: SearchSources,
  rows: readonly SearchParagraphRow[],
): Effect.Effect<(row: SearchParagraphRow) => boolean> =>
  Effect.all(
    [
      sources.paragraphs.getSectionHeadings([...new Set(rows.map((row) => row.publicationId))]),
      sources.paragraphs.getNearestHeadings(rows),
    ],
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map(([outline, nearest]) => {
      const classify = backMatterClassifier(outline, nearest);
      return (row: SearchParagraphRow) => classify(row.publicationId, row.puborder);
    }),
    Effect.catchTag(['SqlError', 'ParagraphDataIntegrityError'], (cause) =>
      Effect.logWarning('search.backMatter.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause) }),
        Effect.as(() => false),
      ),
    ),
  );

const tierOf = (hit: SearchParagraphHit): number => {
  if (hit.backMatter) return 2;
  if (hit.isHeading || hit.isFurniture) return 1;
  return 0;
};

const fuseResults = (
  lexical: readonly SearchParagraphRow[],
  vectorOnly: readonly SearchParagraphRow[],
  vectorIds: readonly string[],
  limit: number,
  backMatter: (row: SearchParagraphRow) => boolean,
): readonly SearchParagraphHit[] => {
  const bodies = new Map([...lexical, ...vectorOnly].map((row) => [row.paragraphId, row]));
  const lists: readonly FusionList[] = [
    { ids: lexical.map((row) => row.paragraphId), weight: ORIGINAL_QUERY_WEIGHT },
    { ids: vectorIds, weight: 1 },
  ];
  const hits: SearchParagraphHit[] = [];
  for (const fused of fuse(lists)) {
    const found = Option.fromNullishOr(bodies.get(fused.id));
    if (Option.isNone(found)) continue;
    const body = found.value;
    hits.push(
      SearchParagraphHit.make({
        paragraphId: body.paragraphId,
        publicationId: body.publicationId,
        rawParaId: body.rawParaId,
        refcode: body.refcode,
        bookCode: body.bookCode,
        bookTitle: body.bookTitle,
        author: body.author,
        snippet: body.snippet,
        isHeading: body.isHeading,
        isFurniture: body.isFurniture,
        backMatter: backMatter(body),
        score: fused.score,
        lexicalRank: Option.flatten(Arr.get(fused.ranks, 0)),
        vectorRank: Option.flatten(Arr.get(fused.ranks, 1)),
      }),
    );
  }
  return hits.toSorted((a, b) => tierOf(a) - tierOf(b)).slice(0, limit);
};

const emptyResult = (input: SearchQuery, status: VectorLegStatus): SearchResult =>
  SearchResult.make({
    query: input.text,
    route: route(input.text)._tag,
    scope: queryScope(input),
    locate: Option.none(),
    paragraphs: [],
    vector: status,
    nonSelective: false,
  });

const vectorIndexLogFields = (index: LoadedVectorIndex) => {
  if (index._tag === 'index') return { state: 'active', vectors: index.index.count };
  return { state: 'absent', reason: index.absence.reason };
};

const primeAccel = (index: LoadedVectorIndex): void => {
  if (index._tag === 'unavailable') return;
  primeVectorAccel(index.index);
};

interface SearchDeps {
  readonly sourcing: SearchSourcing;
  readonly neighbors: VectorNeighborsApi;
  readonly embedder: Option.Option<QueryEmbedderApi>;
}

const makeQuery =
  (deps: SearchDeps) =>
  (input: SearchQuery): Effect.Effect<SearchResult> =>
    Effect.gen(function* () {
      const sourcing = deps.sourcing;
      if (sourcing._tag === 'not-wired') {
        return emptyResult(input, vectorUnavailable('absent'));
      }
      const sources = sourcing.sources;
      const routed = route(input.text);
      const scope = queryScope(input);
      const filter = queryFilter(input);
      const candidates = candidateLimit(queryLimit(input));

      const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      const [lexical, locate] = yield* Effect.all(
        [
          lexicalLeg(sources, routed, scope, input.bookCode, filter, candidates),
          locateLeg(sources, routed),
        ],
        { concurrency: 'unbounded' },
      ).pipe(Effect.withSpan('search.lexical', { attributes: { route: routed._tag } }));
      const lexicalAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      const vector = yield* vectorLeg(
        deps,
        routed,
        lexical.rows,
        scope,
        input.bookCode,
        filter,
        candidates,
      ).pipe(Effect.withSpan('search.vector'));
      const vectorAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      const vectorOnly = yield* vectorOnlyBodies(
        sources,
        lexical.rows,
        vector.ids,
        scope,
        filter,
      ).pipe(
        Effect.withSpan('search.bodies', {
          attributes: { vectorStatus: vector.status._tag },
        }),
      );
      const bodiesAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      const backMatter = yield* backMatterOf(sources, [...lexical.rows, ...vectorOnly]).pipe(
        Effect.withSpan('search.backMatter'),
      );
      const doneAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      yield* Effect.logInfo('search.timing').pipe(
        Effect.annotateLogs({
          route: routed._tag,
          vector: vector.status._tag,
          vectorWhy: vectorWhy(vector.status),
          lexicalMs: lexicalAt - startedAt,
          matches: lexical.matches,
          vectorMs: vectorAt - lexicalAt,
          bodiesMs: bodiesAt - vectorAt,
          backMatterMs: doneAt - bodiesAt,
          totalMs: doneAt - startedAt,
          vectorIds: vector.ids.length,
        }),
      );

      return SearchResult.make({
        query: input.text,
        route: routed._tag,
        scope,
        locate,
        paragraphs: fuseResults(
          lexical.rows,
          vectorOnly,
          vector.ids,
          queryLimit(input),
          backMatter,
        ),
        vector: vector.status,
        nonSelective: lexical.nonSelective,
      });
    });

const layerFlatVectorNeighbors: Layer.Layer<
  VectorNeighbors,
  never,
  SearchCorpusSources | VectorIndexBytes
> = Layer.effect(
  VectorNeighbors,
  Effect.gen(function* () {
    const sourcing = yield* SearchCorpusSources;
    const bytes = yield* VectorIndexBytes;
    const resolved = yield* Effect.serviceOption(ResolvedVectorIndex);
    const index = yield* Option.match(resolved, {
      onSome: (value) => Effect.succeed(value),
      onNone: () => loadVectorIndex.pipe(Effect.provideService(VectorIndexBytes, bytes)),
    });
    yield* Effect.logInfo('search.vectorIndex.resolved').pipe(
      Effect.annotateLogs(vectorIndexLogFields(index)),
    );
    primeAccel(index);
    return VectorNeighbors.of(flatVectorNeighbors(index, sourcing));
  }),
);

export class SearchService extends Context.Service<SearchService, SearchServiceApi>()(
  '@manna/core/search/SearchService',
) {
  static layer: Layer.Layer<SearchService, never, SearchCorpusSources | VectorNeighbors> =
    Layer.effect(
      SearchService,
      Effect.gen(function* () {
        const sourcing = yield* SearchCorpusSources;
        const neighbors = yield* VectorNeighbors;
        const embedder = yield* Effect.serviceOption(QueryEmbedder);
        const run = makeQuery({ sourcing, neighbors, embedder });
        return SearchService.of({
          query: Effect.fn('SearchService.query')(run),
        });
      }),
    );

  static Live: Layer.Layer<SearchService, never, SearchCorpusSources | VectorIndexBytes> =
    SearchService.layer.pipe(Layer.provide(layerFlatVectorNeighbors));
}
