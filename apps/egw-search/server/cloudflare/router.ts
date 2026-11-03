import { Context, Effect, FileSystem, Layer, Path, Scope } from 'effect';
import type { SqlClient } from 'effect/sql';
import { Etag, HttpPlatform, HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import type { SearchService } from '@manna/core/search';

import { SearchApi } from '../api.js';
import { SearchGroupLive } from '../search-api.js';
import type { VectorIndexLoad } from '../vector-index.js';
import { type ReportStore, syncRoutes } from './sync-pages.ts';

export type SearchServices = SearchService | SqlClient.SqlClient | VectorIndexLoad;

export const isolated = <A, E>(build: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.updateContext(build, () => Context.empty());

export const searchRouter = (
  services: Context.Context<SearchServices>,
  store: ReportStore,
  scope: Scope.Scope,
) => {
  const api = HttpApiBuilder.layer(SearchApi).pipe(
    Layer.provide(SearchGroupLive.pipe(Layer.provide(Layer.succeedContext(services)))),
    Layer.provide(Layer.mergeAll(Etag.layer, HttpPlatform.layer)),
  );
  const build = HttpRouter.toHttpEffect(Layer.mergeAll(api, syncRoutes(store))).pipe(
    Scope.provide(scope),
  );
  return Effect.contextWith((context: Context.Context<FileSystem.FileSystem | Path.Path>) =>
    isolated(
      build.pipe(Effect.provideContext(Context.pick(FileSystem.FileSystem, Path.Path)(context))),
    ),
  );
};
