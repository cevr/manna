import { Context, Schema } from 'effect';
import type { Effect } from 'effect';

export class QueryEmbedderUnavailable extends Schema.TaggedError<QueryEmbedderUnavailable>()(
  'Search/QueryEmbedderUnavailable',
  {
    adapter: Schema.String,
    reason: Schema.String,
  },
) {}

export interface QueryEmbedderApi {
  readonly fingerprint: string;
  readonly embedQuery: (query: string) => Effect.Effect<Int8Array, QueryEmbedderUnavailable>;
  readonly embedDocument: (text: string) => Effect.Effect<Int8Array, QueryEmbedderUnavailable>;
}

export class QueryEmbedder extends Context.Service<QueryEmbedder, QueryEmbedderApi>()(
  '@manna/core/search/QueryEmbedder',
) {}
