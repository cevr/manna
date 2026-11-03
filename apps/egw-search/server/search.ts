/* oxlint-disable effect/noNullish -- the HTTP wire shape is JSON: an absent refcode, rank or deep link is encoded as `null`, exactly as `./api.ts` declares it. */
/* oxlint-disable effect/noTernary -- one branch on §9.6's two-case vector status, rendered into a label. */

import { Cause, Effect, Option, Result } from 'effect';
import type { SqlClient } from 'effect/sql';

import { SearchQuery, SearchService, type SearchResult } from '@manna/core/search';
import type { CorpusFilter } from '@manna/core/writings';

import {
  DEFAULT_LIMIT,
  readerUrl,
  SearchFailed,
  type SearchRequest,
  type SearchResponse,
  type SearchSlot,
} from './api.js';
import { emptySurrounding, surroundingParagraphs, type Surrounding } from './context.js';

const MAX_LIMIT = 100;
const DEFAULT_CONTEXT = 1;
const MAX_CONTEXT = 3;

const NEVER_APPARATUS = true;

const clamp = (raw: number, fallback: number, max: number): number => {
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return Math.min(Math.trunc(raw), max);
};

interface PreparedSearch {
  readonly request: SearchRequest;
  readonly text: string;
  readonly scope: SearchRequest['scope'];
  readonly limit: number;
  readonly radius: number;
  readonly filter: CorpusFilter;
}

interface SuccessfulSearch {
  readonly prepared: PreparedSearch;
  readonly result: SearchResult;
}

type ContextLookup = (
  anchors: readonly string[],
  radius: number,
) => Effect.Effect<ReadonlyMap<string, Surrounding>, never, SqlClient.SqlClient>;

const prepare = (request: SearchRequest): PreparedSearch => ({
  request,
  text: request.q.trim(),
  scope: request.scope,
  limit: clamp(request.limit, DEFAULT_LIMIT, MAX_LIMIT),
  radius: clamp(request.context, DEFAULT_CONTEXT, MAX_CONTEXT),
  filter: {
    section: request.section,
    type: request.type,
    subtype: request.subtype,
    excludeApparatus: NEVER_APPARATUS,
  },
});

const idleResponse = (scope: SearchRequest['scope']): SearchResponse => ({
  hits: [],
  scope,
  vector: 'idle',
  nonSelective: false,
});

const queryOne = (
  prepared: PreparedSearch,
  search: SearchService['Service'],
): Effect.Effect<Option.Option<SearchResult>, SearchFailed> =>
  Effect.gen(function* () {
    if (prepared.text === '') return Option.none();
    const result = yield* search.query(
      SearchQuery.make({
        text: prepared.text,
        scope: prepared.scope === 'all' ? Option.none() : Option.some(prepared.scope),
        bookCode: Option.none(),
        filter: prepared.filter,
        limit: Option.some(prepared.limit),
      }),
    );
    return Option.some(result);
  }).pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterruptsOnly(cause),
      (cause) =>
        Effect.logError('search.failed').pipe(
          Effect.annotateLogs({ cause: String(cause) }),
          Effect.andThen(Effect.fail(SearchFailed.make({ message: 'search failed' }))),
        ),
    ),
  );

const distinct = (values: readonly string[]): readonly string[] => [...new Set(values)];

const anchorsOf = (successful: SuccessfulSearch): readonly string[] =>
  successful.result.paragraphs
    .slice(0, successful.prepared.limit)
    .flatMap((hit) => Option.match(hit.rawParaId, { onNone: () => [], onSome: (id) => [id] }));

const contextsFor = (
  successful: readonly SuccessfulSearch[],
  lookup: ContextLookup,
): Effect.Effect<
  ReadonlyMap<number, ReadonlyMap<string, Surrounding>>,
  never,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const grouped = new Map<number, string[]>();
    for (const one of successful) {
      const anchors = grouped.get(one.prepared.radius);
      if (anchors === undefined) {
        grouped.set(one.prepared.radius, [...anchorsOf(one)]);
      } else {
        anchors.push(...anchorsOf(one));
      }
    }

    const contexts = new Map<number, ReadonlyMap<string, Surrounding>>();
    for (const [radius, rawAnchors] of grouped) {
      const anchors = distinct(rawAnchors);
      const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      const context = yield* lookup(anchors, radius).pipe(
        Effect.withSpan('search.context', { attributes: { anchors: anchors.length, radius } }),
      );
      yield* Effect.logInfo('search.context.timing').pipe(
        Effect.annotateLogs({
          anchors: anchors.length,
          radius,
          contextMs: (yield* Effect.clockWith((clock) => clock.currentTimeMillis)) - startedAt,
        }),
      );
      contexts.set(radius, context);
    }
    return contexts;
  });

const responseFor = (
  prepared: PreparedSearch,
  result: SearchResult,
  context: ReadonlyMap<string, Surrounding>,
): SearchResponse => ({
  hits: result.paragraphs.slice(0, prepared.limit).map((hit) => {
    const around = Option.match(hit.rawParaId, {
      onNone: () => emptySurrounding,
      onSome: (id) => context.get(id) ?? emptySurrounding,
    });
    return {
      refcode: Option.getOrNull(hit.refcode),
      bookCode: hit.bookCode,
      bookTitle: hit.bookTitle,
      author: hit.author,
      text: hit.snippet,
      isHeading: hit.isHeading,
      backMatter: hit.backMatter,
      lexicalRank: Option.getOrNull(hit.lexicalRank),
      vectorRank: Option.getOrNull(hit.vectorRank),
      url: Option.match(hit.rawParaId, { onNone: () => null, onSome: readerUrl }),
      before: around.before,
      after: around.after,
    };
  }),
  scope: prepared.scope,
  vector: result.vector._tag === 'ran' ? 'hybrid' : `lexical — ${result.vector.reason}`,
  nonSelective: result.nonSelective,
});

export const runSearch = (
  request: SearchRequest,
): Effect.Effect<SearchResponse, SearchFailed, SearchService | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const search = yield* SearchService;
    const prepared = prepare(request);
    const result = yield* queryOne(prepared, search);
    if (Option.isNone(result)) return idleResponse(prepared.scope);
    const contexts = yield* contextsFor(
      [{ prepared, result: result.value }],
      surroundingParagraphs,
    );
    return responseFor(prepared, result.value, contexts.get(prepared.radius) ?? new Map());
  });

type BatchInput = ReadonlyArray<SearchRequest>;

export const runSearchBatchWith = (
  requests: BatchInput,
  lookup: ContextLookup,
): Effect.Effect<ReadonlyArray<SearchSlot>, never, SearchService | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const search = yield* SearchService;
    const prepared = requests.map(prepare);
    const outcomes = yield* Effect.forEach(
      prepared,
      (one) => Effect.result(queryOne(one, search)),
      { concurrency: 16 },
    );

    const successful: SuccessfulSearch[] = [];
    for (const [index, outcome] of outcomes.entries()) {
      const one = prepared[index];
      if (one === undefined || Result.isFailure(outcome) || Option.isNone(outcome.success)) {
        continue;
      }
      successful.push({ prepared: one, result: outcome.success.value });
    }
    const contexts = yield* contextsFor(successful, lookup);

    return outcomes.map((outcome, index): SearchSlot => {
      const one = prepared[index];
      if (Result.isFailure(outcome)) return { _tag: 'Failed', message: outcome.failure.message };
      if (one === undefined || Option.isNone(outcome.success)) {
        return { _tag: 'Answered', response: idleResponse(requests[index]?.scope ?? 'all') };
      }
      return {
        _tag: 'Answered',
        response: responseFor(one, outcome.success.value, contexts.get(one.radius) ?? new Map()),
      };
    });
  });

export const runSearchBatch = (requests: BatchInput) =>
  runSearchBatchWith(requests, surroundingParagraphs);
