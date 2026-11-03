import { Effect, Exit, Option, Schema as S } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';

import {
  MAX_BATCH,
  SearchApi,
  SearchRequest,
  type SearchResponse,
  type SearchSlot,
} from '../server/api.js';
import { makeBatcher } from './batch.js';

export type Hit = SearchResponse['hits'][number];
export type ContextParagraph = Hit['before'][number];

const REQUEST_TIMEOUT = '30 seconds';

const QUIET = '100 millis';

export class SearchError extends S.TaggedError<SearchError>()('SearchError', {
  message: S.String,
}) {}

const client = HttpApiClient.make(SearchApi).pipe(
  Effect.provide(FetchHttpClient.layer),
  Effect.cached,
  Effect.runSync,
);

const slotExit = (slot: SearchSlot): Exit.Exit<SearchResponse, SearchError> => {
  if (slot._tag === 'Failed') return Exit.fail(SearchError.make({ message: slot.message }));
  return Exit.succeed(slot.response);
};

const batcher = makeBatcher<SearchRequest, SearchResponse, SearchError>({
  window: QUIET,
  maxSize: MAX_BATCH,
  run: (requests) =>
    client.pipe(
      Effect.flatMap((api) => api.search.batch({ payload: { requests } })),
      Effect.timeout(REQUEST_TIMEOUT),
      Effect.retry({ times: 2 }),
      Effect.map(({ results }) => results.map(slotExit)),
      Effect.mapError((cause) => SearchError.make({ message: String(cause) })),
    ),
});

const REMEMBERED = 64;

const answers = new Map<string, SearchResponse>();

const keyOf = S.encodeSync(S.fromJsonString(SearchRequest));

export const remembered = (request: SearchRequest): Option.Option<SearchResponse> =>
  Option.fromUndefinedOr(answers.get(keyOf(request)));

const remember = (request: SearchRequest, response: SearchResponse): void => {
  const key = keyOf(request);
  answers.delete(key);
  answers.set(key, response);
  for (const oldest of answers.keys()) {
    if (answers.size <= REMEMBERED) break;
    answers.delete(oldest);
  }
};

export const search = (request: SearchRequest): Effect.Effect<SearchResponse, SearchError> =>
  batcher
    .submit(request)
    .pipe(Effect.tap((response) => Effect.sync(() => remember(request, response))));

export const runQuery = <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal): Promise<A> =>
  Effect.runPromise(effect, { signal });
