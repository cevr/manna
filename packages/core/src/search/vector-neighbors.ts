import { Context, Schema } from 'effect';
import type { Effect, Option } from 'effect';

import type { CorpusFilter } from '../writings/corpus-class.js';
import type { VectorIndexUnavailable } from './model.js';

export interface NeighborScope {
  readonly topK: number;
  readonly bookCode: Option.Option<string>;
  readonly filter: CorpusFilter;
}

interface Neighbors {
  readonly ids: readonly string[];
  readonly scanned: number;
  readonly engine: string;
}

type VectorNeighborsState =
  | { readonly _tag: 'ready'; readonly fingerprint: string }
  | { readonly _tag: 'unavailable'; readonly absence: VectorIndexUnavailable };

export class VectorNeighborsUnavailable extends Schema.TaggedError<VectorNeighborsUnavailable>()(
  'Search/VectorNeighborsUnavailable',
  {
    engine: Schema.String,
    reason: Schema.String,
  },
) {}

export interface VectorNeighborsApi {
  readonly state: VectorNeighborsState;
  readonly nearest: (
    vector: Int8Array,
    scope: NeighborScope,
  ) => Effect.Effect<Neighbors, VectorNeighborsUnavailable>;
}

export class VectorNeighbors extends Context.Service<VectorNeighbors, VectorNeighborsApi>()(
  '@manna/core/search/VectorNeighbors',
) {}
