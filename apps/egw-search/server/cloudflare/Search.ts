import { RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import * as D1Client from '@effect/sql-d1/D1Client';
import { Effect, Layer, Option, Scope } from 'effect';

import { EGWParagraphDatabase } from '@manna/core/egw-db';
import {
  MODEL_FINGERPRINT,
  QueryEmbedder,
  SearchCorpusSources,
  SearchService,
  VectorNeighbors,
} from '@manna/core/search';

import { VectorIndexLoad } from '../vector-index.js';
import { D1Atomic } from './d1-atomic.ts';
import { Corpus, SyncReports, Vectors } from './resources.ts';
import { isolated, searchRouter } from './router.ts';
import { DOMAIN, SERVED_FROM, type ServedFrom, WORKER_NAME } from './site.ts';
import { nameOfKey, type ReportStore, type StoredFile } from './sync-pages.ts';
import { vectorizeNeighbors, type VectorizeQuery } from './vectorize.ts';
import { WARM_SCHEDULE, warmSearch } from './warm.ts';
import { EMBEDDING_MODEL, workersAiEmbedder } from './workers-ai.ts';

const ASSETS = {
  directory: 'dist',
  notFoundHandling: 'single-page-application',
  runWorkerFirst: ['/api/*', '/health', '/sync', '/sync/*'],
} satisfies Cloudflare.AssetsProps;

const PRODUCTION: Record<ServedFrom, Cloudflare.WorkerProps> = {
  'workers.dev': { name: WORKER_NAME, workersDev: true },
  'custom-domain': { name: WORKER_NAME, workersDev: false, domain: { name: DOMAIN } },
};

const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url, assets: ASSETS };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, ...PRODUCTION[SERVED_FROM] };
});

interface Bindings {
  readonly corpus: D1Client.D1ClientConfig['db'];
  readonly vectors: VectorizeQuery;
  readonly ai: Cloudflare.Workers.AIClient;
}

const storedFile = (object: Cloudflare.R2.ObjectBody) =>
  Option.match(Option.fromNullishOr(object.readable), {
    onSome: (readable) =>
      Effect.succeedSome<StoredFile>({ body: readable, text: object.text().pipe(Effect.orDie) }),
    onNone: () =>
      object
        .text()
        .pipe(
          Effect.map((text) => Option.some<StoredFile>({ body: text, text: Effect.succeed(text) })),
        ),
  });

const searchLayer = (bindings: Bindings) => {
  const sql = D1Client.layer({ db: bindings.corpus });
  const sources = Layer.effect(
    SearchCorpusSources,
    Effect.gen(function* () {
      const paragraphs = yield* EGWParagraphDatabase;
      return SearchCorpusSources.of({ _tag: 'wired', sources: { paragraphs } });
    }),
  ).pipe(Layer.provide(EGWParagraphDatabase.layerExisting), Layer.provide(D1Atomic));
  const neighbors = Layer.succeed(
    VectorNeighbors,
    VectorNeighbors.of(vectorizeNeighbors(bindings.vectors, MODEL_FINGERPRINT)),
  );
  const embedder = Layer.succeed(
    QueryEmbedder,
    QueryEmbedder.of(
      workersAiEmbedder((inputs) =>
        bindings.ai.run(EMBEDDING_MODEL, inputs).pipe(Effect.provide(RuntimeContext.phantom)),
      ),
    ),
  );
  const search = SearchService.layer.pipe(
    Layer.provide(Layer.mergeAll(sources, neighbors, embedder)),
  );
  const ready = Layer.succeed(
    VectorIndexLoad,
    VectorIndexLoad.of({ readiness: Effect.succeed('ready' as const) }),
  );
  return Layer.mergeAll(search, ready).pipe(Layer.provideMerge(sql), Layer.orDie);
};

export default class Search extends Cloudflare.Worker<Search>()(
  'Search',
  props,
  Effect.gen(function* () {
    const corpus = yield* Cloudflare.D1.QueryDatabase(yield* Corpus);
    const vectors = yield* Cloudflare.Vectorize.SearchIndex(yield* Vectors);
    const ai = yield* Cloudflare.Workers.AI();
    const reports = yield* Cloudflare.R2.ReadBucket(yield* SyncReports);
    const reportsPage = (cursor: Option.Option<string>) =>
      reports
        .list({ prefix: 'reports/', cursor: Option.getOrUndefined(cursor) })
        .pipe(Effect.provide(RuntimeContext.phantom), Effect.orDie);
    const store: ReportStore = {
      names: Effect.gen(function* () {
        const names: string[] = [];
        let cursor = Option.none<string>();
        while (true) {
          const page = yield* reportsPage(cursor);
          names.push(...page.objects.flatMap((object) => Option.toArray(nameOfKey(object.key))));
          if (!page.truncated) return names.sort();
          cursor = Option.some(page.cursor);
        }
      }),
      open: (key) =>
        reports.get(key).pipe(
          Effect.flatMap((object) =>
            Option.match(Option.fromNullishOr(object), {
              onNone: () => Effect.succeed(Option.none<StoredFile>()),
              onSome: (body) => storedFile(body),
            }),
          ),
          Effect.provide(RuntimeContext.phantom),
          Effect.orDie,
        ),
    };
    const scope = yield* Scope.make();
    const services = yield* Effect.cached(
      Effect.gen(function* () {
        const bindings: Bindings = {
          corpus: yield* corpus.raw,
          vectors: yield* vectors.raw,
          ai,
        };
        return yield* isolated(Layer.buildWithScope(searchLayer(bindings), scope));
      }),
    );
    const app = yield* Effect.cached(
      Effect.flatMap(services, (context) => searchRouter(context, store, scope)),
    );
    yield* Cloudflare.Workers.cron(WARM_SCHEDULE, (controller) =>
      services.pipe(
        Effect.flatMap((context) =>
          warmSearch(controller.scheduledTime).pipe(Effect.provide(context)),
        ),
        Effect.catchCause((cause) => Effect.logWarning('search.warm.failed', cause)),
      ),
    );
    return { fetch: Effect.flatten(app) };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Vectorize.SearchIndexBinding,
        Cloudflare.Workers.AIBinding,
        Cloudflare.R2.ReadBucketBinding,
        Cloudflare.Workers.CronEventSourceLive,
      ),
    ),
  ),
) {}
