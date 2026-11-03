import { Config, Effect, Layer, Option, SynchronizedRef } from 'effect';

import { QueryEmbedder, QueryEmbedderUnavailable, type QueryEmbedderApi } from './embedder.js';
import { QUERY_PREFIX, DOCUMENT_PREFIX, truncateToMrl } from './embedding.js';
import { MODEL_FINGERPRINT, quantize } from './vector-index.js';

const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';

type EmbedderDevice = 'cpu';

const MODEL_DTYPE = 'fp32';

const MODEL_CONTEXT_TOKENS = 2048;

const modelCacheDir: Config.Config<Option.Option<string>> = Config.option(
  Config.String('BIBLE_MODEL_CACHE'),
);

export const bibleHomeModelsFallback: Config.Config<Option.Option<string>> = Config.option(
  Config.String('HOME'),
).pipe(Config.map(Option.map((home) => `${home}/.bible/models`)));

interface LoadedModel {
  readonly encode: (
    texts: readonly string[],
  ) => Promise<{ readonly dims: readonly number[]; readonly data: ArrayLike<number | bigint> }>;
}

const unavailable = (adapter: string, reason: string): QueryEmbedderUnavailable =>
  QueryEmbedderUnavailable.make({ adapter, reason });

const loadTransformers = () => import('@huggingface/transformers');

const loadModel = (
  adapter: string,
  device: EmbedderDevice,
  fallbackCacheDir: Config.Config<Option.Option<string>>,
): Effect.Effect<LoadedModel, QueryEmbedderUnavailable> =>
  Effect.gen(function* () {
    const override = yield* Effect.orElseSucceed(modelCacheDir, () => Option.none<string>());
    const fallback = yield* Effect.orElseSucceed(fallbackCacheDir, () => Option.none<string>());
    const cache = Option.orElse(override, () => fallback);
    const module = yield* Effect.tryPromise({
      try: loadTransformers,
      catch: (cause) => unavailable(adapter, `transformers.js did not load: ${String(cause)}`),
    });
    const loaded = yield* Effect.tryPromise({
      /* oxlint-disable effect/noAsyncFunction -- the promise thunk `Effect.tryPromise` requires */
      try: async () => {
        if (Option.isSome(cache)) module.env.cacheDir = cache.value;
        const tokenizer = await module.AutoTokenizer.from_pretrained(MODEL_ID);
        const model = await module.AutoModel.from_pretrained(MODEL_ID, {
          dtype: MODEL_DTYPE,
          device,
        });
        return { tokenizer, model };
      },
      /* oxlint-enable effect/noAsyncFunction */
      catch: (cause) => unavailable(adapter, `${MODEL_ID} on ${device}: ${String(cause)}`),
    });
    return {
      /* oxlint-disable effect/noAsyncFunction -- transformers.js is promise-only */
      encode: async (texts) => {
        const inputs = await loaded.tokenizer([...texts], {
          padding: true,
          truncation: true,
          max_length: MODEL_CONTEXT_TOKENS,
        });
        const output = await loaded.model(inputs);
        const embedding = output.sentence_embedding;
        return { dims: embedding.dims, data: embedding.data };
      },
      /* oxlint-enable effect/noAsyncFunction */
    };
  });

const rowOf = (
  encoded: { readonly dims: readonly number[]; readonly data: ArrayLike<number | bigint> },
  row: number,
): readonly number[] => {
  const width = encoded.dims[1] ?? 0;
  const out: number[] = [];
  for (let axis = 0; axis < width; axis += 1) out.push(Number(encoded.data[row * width + axis]));
  return out;
};

export const memoizeOnSuccess = <A, E>(
  load: Effect.Effect<A, E>,
): Effect.Effect<Effect.Effect<A, E>> =>
  Effect.map(SynchronizedRef.make(Option.none<A>()), (cell) =>
    SynchronizedRef.modifyEffect(
      cell,
      (current): Effect.Effect<readonly [A, Option.Option<A>], E> =>
        Option.match(current, {
          onSome: (value) => Effect.succeed([value, current]),
          onNone: () => Effect.map(load, (value) => [value, Option.some(value)]),
        }),
    ),
  );

export const layerTransformersEmbedder = (input: {
  readonly adapter: string;
  readonly device: EmbedderDevice;
  readonly fallbackCacheDir?: Config.Config<Option.Option<string>>;
}): Layer.Layer<QueryEmbedder> =>
  Layer.effect(
    QueryEmbedder,
    Effect.gen(function* () {
      const model = yield* memoizeOnSuccess(
        loadModel(
          input.adapter,
          input.device,
          input.fallbackCacheDir ?? Config.succeed(Option.none<string>()),
        ),
      );

      const embedWith =
        (prefix: string) =>
        (text: string): Effect.Effect<Int8Array, QueryEmbedderUnavailable> =>
          Effect.gen(function* () {
            const ready = yield* model;
            const encoded = yield* Effect.tryPromise({
              try: () => ready.encode([prefix + text]),
              catch: (cause) => unavailable(input.adapter, `embed failed: ${String(cause)}`),
            });
            const row = truncateToMrl(rowOf(encoded, 0));
            if (Option.isNone(row)) {
              return yield* unavailable(
                input.adapter,
                `${MODEL_ID} returned an unusable embedding row`,
              );
            }
            return quantize(row.value);
          });

      return QueryEmbedder.of({
        fingerprint: MODEL_FINGERPRINT,
        embedQuery: embedWith(QUERY_PREFIX),
        embedDocument: embedWith(DOCUMENT_PREFIX),
      } satisfies QueryEmbedderApi);
    }),
  );
