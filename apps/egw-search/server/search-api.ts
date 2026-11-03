import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import type { SqlClient } from 'effect/sql';

import type { SearchService } from '@manna/core/search';

import { DEFAULT_LIMIT, NO_SELECTION, SearchApi } from './api.js';
import { runSearch, runSearchBatch } from './search.js';
import { VectorIndexLoad } from './vector-index.js';

const DEFAULT_CONTEXT = 1;

export const SearchGroupLive = HttpApiBuilder.group(SearchApi, 'search', (handlers) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<SearchService | SqlClient.SqlClient>();
    const load = yield* VectorIndexLoad;
    return handlers
      .handle('health', () => Effect.map(load.readiness, (vector) => ({ ok: true, vector })))
      .handle('query', ({ query: params }) =>
        runSearch({
          q: params.q,
          scope: params.scope ?? 'all',
          section: params.section ?? NO_SELECTION,
          type: params.type ?? NO_SELECTION,
          subtype: params.subtype ?? NO_SELECTION,
          excludeApparatus: params.noref === '1',
          limit: params.limit ?? DEFAULT_LIMIT,
          context: params.context ?? DEFAULT_CONTEXT,
        }).pipe(Effect.provideContext(services)),
      )
      .handle('batch', ({ payload }) =>
        Effect.map(runSearchBatch(payload.requests), (results) => ({ results })).pipe(
          Effect.provideContext(services),
        ),
      );
  }),
);
