import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Config,
  Console,
  Effect,
  FileSystem,
  Layer,
  ManagedRuntime,
  Option,
  Result,
} from 'effect';

import { QueryEmbedder } from './embedder.js';
import { layerBunEmbedder } from './embedder-bun.js';
import { bibleHomeModelsFallback } from './embedder-transformers.js';
import { DOCUMENT_PREFIX, QUERY_PREFIX, truncateToMrl } from './embedding.js';
import { GOLDEN_QUERIES } from './golden-fixture.js';
import { DIMENSIONS, MODEL_FINGERPRINT } from './vector-index.js';

const QUERIES = GOLDEN_QUERIES.map((golden) => golden.query.text);

const embedWith = (layer: Layer.Layer<QueryEmbedder>, query: string) =>
  Effect.flatMap(QueryEmbedder, (embedder) => embedder.embedQuery(query)).pipe(
    Effect.provide(layer),
    Effect.result,
  );

const fingerprintOf = (layer: Layer.Layer<QueryEmbedder>) =>
  Effect.map(QueryEmbedder, (embedder) => embedder.fingerprint).pipe(Effect.provide(layer));

const embedDocumentWith = (layer: Layer.Layer<QueryEmbedder>, text: string) =>
  Effect.flatMap(QueryEmbedder, (embedder) => embedder.embedDocument(text)).pipe(
    Effect.provide(layer),
    Effect.result,
  );

const adapter: Layer.Layer<QueryEmbedder> = Layer.effectContext(
  ManagedRuntime.make(layerBunEmbedder).contextEffect,
);

const weightsDir = Effect.gen(function* () {
  const override = yield* Config.option(Config.String('BIBLE_MODEL_CACHE'));
  const fallback = yield* bibleHomeModelsFallback;
  return Option.map(
    Option.orElse(override, () => fallback),
    (dir) => `${dir}/onnx-community/embeddinggemma-300m-ONNX`,
  );
});

// oxlint-disable-next-line effect/noAsyncFunction -- it.skipIf needs this at module-evaluation time
const weights = await Effect.runPromise(
  Effect.gen(function* () {
    const dir = yield* weightsDir;
    if (Option.isNone(dir)) return dir;
    const fs = yield* FileSystem.FileSystem;
    const present = yield* fs.exists(`${dir.value}/onnx`);
    return Option.filter(dir, () => present);
  }).pipe(Effect.provide(BunServices.layer)),
);
const modelAvailable = Option.isSome(weights);

// oxlint-disable-next-line effect/noAsyncFunction -- the probe runs once at module evaluation, beside the skip it backs
const probe = await Effect.runPromise(
  Effect.when(embedWith(adapter, 'probe'), Effect.succeed(modelAvailable)),
);

const overLong = 'and the word of the Lord came unto the prophet saying '.repeat(400);
// oxlint-disable-next-line effect/noAsyncFunction -- embedded once at module evaluation, beside the probe
const overLongEmbedded = await Effect.runPromise(
  Effect.when(embedDocumentWith(adapter, overLong), Effect.succeed(modelAvailable)),
);

describe('§10 the Bun embedding adapter', () => {
  it('reports whether the model was available, so a skip is never silent', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (!modelAvailable) {
          yield* Console.warn(
            `[search] embedder model checks SKIPPED — ${MODEL_FINGERPRINT}'s weights are not on this machine\n` +
              `[search] set BIBLE_MODEL_CACHE, or fetch the model to ~/.bible/models, to run the real checks.`,
          );
        }
        expect(!modelAvailable || Option.exists(probe, Result.isSuccess)).toBe(true);
      }),
    ));

  // oxlint-disable-next-line film/tests-keep-their-strength -- needs the model's weights, which are not committed (§10); it skips, and says so above, on a machine that never fetched them
  it.skipIf(!modelAvailable)('the adapter declares the pinned fingerprint', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        expect(yield* fingerprintOf(adapter)).toBe(MODEL_FINGERPRINT);
      }),
    ),
  );

  // oxlint-disable-next-line film/tests-keep-their-strength -- needs the model's weights, which are not committed (§10); it skips, and says so above, on a machine that never fetched them
  it.skipIf(!modelAvailable)(
    'produces a 256-d int8 vector, which is what the index is scanned with',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const query = Option.getOrElse(Arr.get(QUERIES, 0), () => 'the sanctuary');
          const result = yield* embedWith(adapter, query);
          expect(Result.isSuccess(result)).toBe(true);
          if (Result.isFailure(result)) return;
          expect(result.success.length).toBe(DIMENSIONS);
          expect(result.success).toBeInstanceOf(Int8Array);
        }),
      ),
  );
});

describe('§9.5 the retrieval embedding, against the real model', () => {
  const cosine = (left: Int8Array, right: Int8Array): number => {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let axis = 0; axis < left.length; axis += 1) {
      const a = left[axis] ?? 0;
      const b = right[axis] ?? 0;
      dot += a * b;
      leftNorm += a * a;
      rightNorm += b * b;
    }
    return dot / Math.sqrt(leftNorm * rightNorm);
  };

  it('pins the model card’s two retrieval prefixes verbatim', () => {
    expect(QUERY_PREFIX).toBe('task: search result | query: ');
    expect(DOCUMENT_PREFIX).toBe('title: none | text: ');
  });

  // oxlint-disable-next-line film/tests-keep-their-strength -- needs the model's weights, which are not committed (§10); it skips, and says so above, on a machine that never fetched them
  it.skipIf(!modelAvailable)(
    'places a query nearer the paragraph that answers it than an unrelated one',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const question = 'what happens at the close of probation';
          const answer =
            'When the work of the investigative judgment closes, the cases of all are decided and probation ends.';
          const unrelated =
            'Jupiter, the largest planet in our solar system, has a prominent red spot.';

          const query = yield* embedWith(adapter, question);
          const relevant = yield* embedDocumentWith(adapter, answer);
          const irrelevant = yield* embedDocumentWith(adapter, unrelated);
          expect(Result.isSuccess(query)).toBe(true);
          expect(Result.isSuccess(relevant)).toBe(true);
          expect(Result.isSuccess(irrelevant)).toBe(true);
          if (
            Result.isFailure(query) ||
            Result.isFailure(relevant) ||
            Result.isFailure(irrelevant)
          ) {
            return;
          }

          const near = cosine(query.success, relevant.success);
          const far = cosine(query.success, irrelevant.success);
          expect(near).toBeGreaterThan(0.5);
          expect(far).toBeLessThan(0.35);
          expect(near - far).toBeGreaterThan(0.3);
        }),
      ),
  );

  // oxlint-disable-next-line film/tests-keep-their-strength -- needs the model's weights, which are not committed (§10); it skips, and says so above, on a machine that never fetched them
  it.skipIf(!modelAvailable)(
    'embeds a query and a document differently, because the model is asymmetric',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const text = 'the sanctuary in heaven is the center of Christ’s work';
          const asQuery = yield* embedWith(adapter, text);
          const asDocument = yield* embedDocumentWith(adapter, text);
          expect(Result.isSuccess(asQuery)).toBe(true);
          expect(Result.isSuccess(asDocument)).toBe(true);
          if (Result.isFailure(asQuery) || Result.isFailure(asDocument)) return;
          expect([...asQuery.success]).not.toEqual([...asDocument.success]);
        }),
      ),
  );
});

describe('§9.5 the shared vector post-processing', () => {
  const accepted = (values: readonly number[]): Float32Array => {
    const truncated = truncateToMrl(values);
    expect(Option.isSome(truncated)).toBe(true);
    return Option.getOrElse(truncated, () => new Float32Array(DIMENSIONS));
  };

  it('truncates to 256 dimensions', () => {
    const full = Array.from({ length: 768 }, (_value, axis) => Math.sin(axis));
    expect(accepted(full).length).toBe(DIMENSIONS);
  });

  it('keeps the first 256 components, in order', () => {
    const full = Array.from({ length: 768 }, (_value, axis) => axis + 1);
    const truncated = accepted(full);
    const ratio = (truncated[0] ?? 0) / (truncated[1] ?? 1);
    expect(ratio).toBeCloseTo(1 / 2, 6);
  });

  it('re-normalizes after truncating', () => {
    const full = Array.from({ length: 768 }, () => 1);
    const truncated = accepted(full);
    let sum = 0;
    for (const value of truncated) sum += value * value;
    expect(Math.sqrt(sum)).toBeCloseTo(1, 6);
  });

  it('rejects a row shorter than 256 components rather than padding it', () => {
    expect(Option.isNone(truncateToMrl(Array.from({ length: 128 }, () => 0.1)))).toBe(true);
    expect(Option.isNone(truncateToMrl(Array.from({ length: 255 }, () => 0.1)))).toBe(true);
    expect(Option.isSome(truncateToMrl(Array.from({ length: DIMENSIONS }, () => 0.1)))).toBe(true);
  });

  it('rejects a row carrying a non-finite component', () => {
    const withNaN = Array.from({ length: 768 }, () => 0.1);
    withNaN[7] = Number.NaN;
    expect(Option.isNone(truncateToMrl(withNaN))).toBe(true);

    const withInfinity = Array.from({ length: 768 }, () => 0.1);
    withInfinity[200] = Number.POSITIVE_INFINITY;
    expect(Option.isNone(truncateToMrl(withInfinity))).toBe(true);

    const withNegativeInfinity = Array.from({ length: 768 }, () => 0.1);
    withNegativeInfinity[255] = Number.NEGATIVE_INFINITY;
    expect(Option.isNone(truncateToMrl(withNegativeInfinity))).toBe(true);

    const beyondPrefix = Array.from({ length: 768 }, () => 0.1);
    beyondPrefix[300] = Number.NaN;
    expect(Option.isSome(truncateToMrl(beyondPrefix))).toBe(true);
  });

  it('rejects an all-zero embedding rather than emitting a zero vector', () => {
    expect(Option.isNone(truncateToMrl(Array.from({ length: 768 }, () => 0)))).toBe(true);
  });

  // oxlint-disable-next-line film/tests-keep-their-strength -- needs the model's weights, which are not committed (§10); it skips, and says so above, on a machine that never fetched them
  it.skipIf(!modelAvailable)(
    'embeds a document past the model context by truncating, not failing',
    () =>
      Effect.runPromise(
        Effect.sync(() => {
          expect(Option.exists(overLongEmbedded, Result.isSuccess)).toBe(true);
        }),
      ),
  );
});
