/* oxlint-disable effect/noGlobals -- the corpus paths are needed to *construct* the layers below, before any Effect runs; reading them through `Config` would force a `Layer.unwrap` whose outputs the type checker then cannot see (which is what made the shared SqlClient leak out as an unmet requirement). */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import {
  Etag,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpStaticServer,
} from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { SqlClient } from 'effect/sql';

import { EGWParagraphDatabase } from '@manna/core/egw-db';
import {
  layerFileVectorIndexBytes,
  loadVectorIndex,
  QueryEmbedder,
  type LoadedVectorIndex,
  SearchCorpusSources,
  type VectorIndexBytes,
} from '@manna/core/search';
import { layerBunEmbedder } from '@manna/core/search/bun';

import { SearchApi } from './api.js';
import { SearchGroupLive } from './search-api.js';
import { teardown } from './teardown.js';
import { lateVectorIndex } from './vector-index.js';
import type { WarmRequest, WarmResult } from './warm-corpus.worker.js';

const PORT = Number(process.env['PORT'] ?? 3101);

const readVectorIndex: Effect.Effect<LoadedVectorIndex, never, VectorIndexBytes> =
  loadVectorIndex.pipe(
    Effect.tap((loaded) => {
      if (loaded._tag === 'index') return Effect.void;
      return Effect.logInfo('search.vectorIndex.refused').pipe(
        Effect.annotateLogs({ reason: loaded.absence.reason }),
      );
    }),
  );

const CORPUS_ROOT = process.env['BIBLE_CORPUS_DIR'] ?? `${process.env['HOME'] ?? '.'}/.bible`;
const at = (file: string): string => `${CORPUS_ROOT}/${file}`;

const SqlLive = SqliteBun.layer({ filename: at('egw-paragraphs.db') });

const PAGE_CACHE_KIB = 4 * 1024 * 1024;

const MMAP_BYTES = 8 * 1024 * 1024 * 1024;

const TunedSqlLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.unsafe(`PRAGMA cache_size = -${String(PAGE_CACHE_KIB)}`);
    yield* sql.unsafe(`PRAGMA mmap_size = ${String(MMAP_BYTES)}`);
    yield* Effect.log(
      'search.sqlite.tuned',
      `cacheKiB=${String(PAGE_CACHE_KIB)} mmapBytes=${String(MMAP_BYTES)}`,
    );
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning('search.sqlite.tune_failed', `cause=${String(cause)}`),
    ),
  ),
).pipe(Layer.provideMerge(SqlLive));

const CorpusSources = Layer.effect(
  SearchCorpusSources,
  Effect.gen(function* () {
    return SearchCorpusSources.of({
      _tag: 'wired',
      sources: {
        paragraphs: yield* EGWParagraphDatabase,
      },
    });
  }),
).pipe(
  Layer.provide(EGWParagraphDatabase.layerCore),
  Layer.provide(TunedSqlLive),
  Layer.provide(BunServices.layer),
  Layer.orDie,
);

const WarmEmbedderLive: Layer.Layer<never, never, QueryEmbedder> = Layer.effectDiscard(
  Effect.gen(function* () {
    const embedder = yield* QueryEmbedder;
    yield* embedder.embedQuery('warm').pipe(
      Effect.andThen(Effect.log('search.embedder.warm', 'state=ready')),
      Effect.catchCause((cause) =>
        Effect.logWarning('search.embedder.warm_failed', `cause=${String(cause)}`),
      ),
      Effect.forkDetach,
    );
  }),
);

const EmbedderLive = layerBunEmbedder;

const WarmCorpusLive: Layer.Layer<never> = Layer.effectDiscard(
  Effect.callback<WarmResult>((resume) => {
    const worker = new Worker(new URL('./warm-corpus.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<WarmResult>) => {
      worker.terminate();
      resume(Effect.succeed(event.data));
    };
    worker.onerror = (event) => {
      worker.terminate();
      resume(Effect.succeed({ _tag: 'Failed', message: event.message }));
    };
    const request: WarmRequest = { filename: at('egw-paragraphs.db'), mmapBytes: MMAP_BYTES };
    worker.postMessage(request);
    return Effect.sync(() => worker.terminate());
  }).pipe(
    Effect.flatMap((result) => {
      if (result._tag === 'Failed') {
        return Effect.logWarning('search.corpus.warm_failed', `cause=${result.message}`);
      }
      return Effect.log(
        'search.corpus.warm',
        `state=ready postingsMs=${String(result.postingsMs)} queryMs=${String(result.queryMs)}`,
      );
    }),
    Effect.catchCause((cause) =>
      Effect.logWarning('search.corpus.warm_failed', `cause=${String(cause)}`),
    ),
    Effect.forkDetach,
  ),
);

const searchLayer = Layer.mergeAll(
  lateVectorIndex(readVectorIndex).pipe(
    Layer.provide(CorpusSources),
    Layer.provide(layerFileVectorIndexBytes(at('vectors.bvi'))),
    Layer.provide(BunServices.layer),
  ),
  WarmEmbedderLive,
  TunedSqlLive,
  WarmCorpusLive,
).pipe(Layer.provideMerge(EmbedderLive));

const GroupLive = SearchGroupLive.pipe(Layer.provide(searchLayer), Layer.provide(TunedSqlLive));

const ApiLive = HttpApiBuilder.layer(SearchApi).pipe(Layer.provide(GroupLive));

const STATIC_ROOT = process.env['EGW_SEARCH_STATIC_DIR'] ?? `${import.meta.dir}/../dist`;

const StaticLive = HttpStaticServer.layer({
  root: STATIC_ROOT,
  spa: true,
  index: 'index.html',
});

const RouterLive = Layer.mergeAll(StaticLive, ApiLive);

const HttpLive = Layer.unwrap(
  HttpRouter.toHttpEffect(RouterLive).pipe(
    Effect.map((httpApp) =>
      HttpServer.serve(HttpMiddleware.logger)(httpApp).pipe(
        HttpServer.withLogAddress,
        Layer.provide(BunHttpServer.layer({ port: PORT })),
      ),
    ),
  ),
);

const PlatformLive = Layer.mergeAll(
  Etag.layer,
  HttpPlatform.layer.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
  TunedSqlLive,
);

Layer.launch(HttpLive).pipe(Effect.provide(PlatformLive), BunRuntime.runMain({ teardown }));
