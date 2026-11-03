/** The one embedding implementation (§9.5), shared by the CLI's query
 *  embedder (`embedder-bun.ts`) and the vector compiler in `packages/scripts`.
 *
 *  One implementation of the ONNX graph means a query vector and an indexed
 *  vector cannot be computed two ways. `@huggingface/transformers` runs the
 *  graph through `onnxruntime-node` under Bun.
 *
 *  **This file is `*-transformers.ts`, not `*-bun.ts`.** It imports no host
 *  builtin — `@huggingface/transformers` is a plain dependency — so the oxlint
 *  portability boundary permits it in core, and the Bun entry point beside it
 *  is a thin `device` choice.
 *
 *  ## Why `AutoModel` rather than the `feature-extraction` pipeline
 *
 *  The pipeline mean-pools `last_hidden_state` and normalizes. EmbeddingGemma
 *  does not use that as its embedding: the exported graph has a second output,
 *  `sentence_embedding`, which is the trained pooling-and-projection head the
 *  model was actually optimized for. Measured against the real weights on this
 *  corpus's own text, the two outputs agree at cosine **0.0081** — they are
 *  effectively orthogonal, and an index built from one and queried with the
 *  other returns noise with no error anywhere.
 *
 *  With the correct output and the pinned prefixes, the same measurement gives
 *  cosine 0.6971 between a query and the paragraph that answers it, and 0.0709
 *  between that query and an unrelated paragraph — which is the separation the
 *  vector leg exists to exploit.
 */

import { Config, Effect, Layer, Option, SynchronizedRef } from 'effect';

import { QueryEmbedder, QueryEmbedderUnavailable, type QueryEmbedderApi } from './embedder.js';
import { QUERY_PREFIX, DOCUMENT_PREFIX, truncateToMrl } from './embedding.js';
import { MODEL_FINGERPRINT, quantize } from './vector-index.js';

/** The model id the fingerprint names, as the loader asks for it. */
const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';

/** Which ONNX execution provider this adapter runs on.
 *
 *  `cpu` under Bun: §9.5 measures the native CPU path at tens of milliseconds
 *  with the model resident. */
type EmbedderDevice = 'cpu';

/** The dtype the model card permits and this build pins.
 *
 *  "EmbeddingGemma activations do not support `fp16` or its derivatives. Please
 *  use `fp32`, `q8`, or `q4`." `fp32` is the choice the fingerprint implies:
 *  a quantized graph would move the float outputs off the vectors the index
 *  was compiled with. */
const MODEL_DTYPE = 'fp32';

/** EmbeddingGemma's context window, from the model's own
 *  `max_position_embeddings` (and `model_max_length` in its tokenizer config).
 *  Inputs are truncated here rather than rejected: see `encode`. */
const MODEL_CONTEXT_TOKENS = 2048;

/** Where the model files live, when the host does not use the default cache.
 *
 *  Config rather than a constant: §10 requires weights not to be committed, so
 *  they are resolved at runtime (the CLI from `~/.bible`). Absent means "use
 *  the library's default cache". */
const modelCacheDir: Config.Config<Option.Option<string>> = Config.option(
  Config.String('BIBLE_MODEL_CACHE'),
);

/** `~/.bible/models`, beside the corpora the CLI resolves there. Defined once
 *  here so "where to look when `BIBLE_MODEL_CACHE` is unset" is one fact for
 *  the CLI and the vector compiler. A fallback, not a default cache move: the
 *  env override still wins, and a host with no `HOME` — a bare service — reads
 *  as "no fallback" rather than failing. */
export const bibleHomeModelsFallback: Config.Config<Option.Option<string>> = Config.option(
  Config.String('HOME'),
).pipe(Config.map(Option.map((home) => `${home}/.bible/models`)));

/** The tokenizer and model this adapter drives, as narrowly as it uses them.
 *
 *  Declared structurally rather than imported as a type, because the import is
 *  dynamic: loading a 300M-parameter runtime at module scope would make every
 *  `manna` subcommand pay for it, including the ones that never search.
 *
 *  `sentence_embedding.data` is typed as `ArrayLike<number | bigint>` for the
 *  same reason the old code converted through `Number`: the library's
 *  `DataArray` union spans every dtype it can produce, including
 *  `BigInt64Array`. Under this adapter's pinned `fp32` the branch is never
 *  taken; the type is honest about what the library can return.
 */
interface LoadedModel {
  readonly encode: (
    texts: readonly string[],
  ) => Promise<{ readonly dims: readonly number[]; readonly data: ArrayLike<number | bigint> }>;
}

const unavailable = (adapter: string, reason: string): QueryEmbedderUnavailable =>
  QueryEmbedderUnavailable.make({ adapter, reason });

const loadTransformers = () => import('@huggingface/transformers');

/** Loads the tokenizer and model once, on the given device.
 *
 *  Every failure — no model files, a corrupt download — becomes
 *  `QueryEmbedderUnavailable`. §10 requires "missing model -> EmbedderUnavailable,
 *  never a crash", and a search box that takes the app down because an optional
 *  model is not downloaded is the failure that rule exists to prevent.
 */
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

/** One text's 768-d row out of a batch encode, as plain numbers. */
const rowOf = (
  encoded: { readonly dims: readonly number[]; readonly data: ArrayLike<number | bigint> },
  row: number,
): readonly number[] => {
  const width = encoded.dims[1] ?? 0;
  const out: number[] = [];
  for (let axis = 0; axis < width; axis += 1) out.push(Number(encoded.data[row * width + axis]));
  return out;
};

/** Memoizes a load **on success only**, under the cell's own lock.
 *
 *  Split out from the layer so the property can be tested without a
 *  300M-parameter model: what matters here is the caching discipline, and
 *  driving it through the real loader would make the test a download.
 *
 *  `SynchronizedRef.modifyEffect` holds the ref's semaphore for the duration of
 *  the update and **stores the new value only if the effect succeeds** — the two
 *  properties this needs. The lock means two concurrent first queries load one
 *  model rather than two, and a second in-flight load of a 300M-parameter graph
 *  would double the process's memory. The store-on-success-only means a typed
 *  load failure leaves the cell empty for the next query to retry.
 */
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
  /** Where the model lives when `BIBLE_MODEL_CACHE` is not set — the host's
   *  own convention (the CLI's `~/.bible/models`). Absent means the library's
   *  default cache. */
  readonly fallbackCacheDir?: Config.Config<Option.Option<string>>;
}): Layer.Layer<QueryEmbedder> =>
  Layer.effect(
    QueryEmbedder,
    Effect.gen(function* () {
      /** The model, loaded at most once and retried after a typed failure. */
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
