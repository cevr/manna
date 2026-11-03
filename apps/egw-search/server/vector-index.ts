import { Context, Duration, Effect, Layer, Ref } from 'effect';

import {
  type LoadedVectorIndex,
  ResolvedVectorIndex,
  type SearchCorpusSources,
  SearchService,
  type VectorAbsenceReason,
  VectorIndexBytes,
  vectorUnavailable,
} from '@manna/core/search';

type IndexState =
  | { readonly _tag: 'loading'; readonly search: SearchService['Service'] }
  | {
      readonly _tag: 'loaded';
      readonly search: SearchService['Service'];
      readonly index: LoadedVectorIndex;
    };

export type VectorReadiness = 'ready' | VectorAbsenceReason;

const readinessOf = (state: IndexState): VectorReadiness => {
  if (state._tag === 'loading') return 'loading';
  if (state.index._tag === 'index') return 'ready';
  return state.index.absence.reason;
};

const searchOver = (index: LoadedVectorIndex) =>
  SearchService.Live.pipe(
    Layer.provide(ResolvedVectorIndex.layerOf(index)),
    Layer.provide(VectorIndexBytes.None),
    Layer.build,
    Effect.map((built) => Context.get(built, SearchService)),
  );

export class VectorIndexLoad extends Context.Service<
  VectorIndexLoad,
  { readonly readiness: Effect.Effect<VectorReadiness> }
>()('@manna/egw-search/VectorIndexLoad') {}

export const lateVectorIndex = <R>(
  load: Effect.Effect<LoadedVectorIndex, never, R>,
): Layer.Layer<SearchService | VectorIndexLoad, never, SearchCorpusSources | R> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const loading = yield* searchOver({
        _tag: 'unavailable',
        absence: vectorUnavailable('loading'),
      });
      const state = yield* Ref.make<IndexState>({ _tag: 'loading', search: loading });

      yield* Effect.logInfo('search.vectorIndex.loading');
      yield* load.pipe(
        Effect.timed,
        Effect.flatMap(([elapsed, index]) =>
          Effect.gen(function* () {
            const loaded: IndexState = { _tag: 'loaded', search: yield* searchOver(index), index };
            yield* Ref.set(state, loaded);
            yield* Effect.logInfo('search.vectorIndex.ready').pipe(
              Effect.annotateLogs({
                state: readinessOf(loaded),
                ms: Math.round(Duration.toMillis(elapsed)),
              }),
            );
          }),
        ),
        Effect.forkScoped,
      );

      return Context.make(
        SearchService,
        SearchService.of({
          query: (input) =>
            Effect.flatMap(Ref.get(state), (current) => current.search.query(input)),
        }),
      ).pipe(
        Context.add(VectorIndexLoad, {
          readiness: Effect.map(Ref.get(state), readinessOf),
        }),
      );
    }),
  );
