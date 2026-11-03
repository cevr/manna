/** The Bun query embedder against the real pinned model (§9.5, §10).
 *
 *  **This suite skips loudly.** Model weights are not committed (§10), so on a
 *  machine that has never downloaded EmbeddingGemma there is nothing to check
 *  and the honest outcome is a *reported* skip — never a pass. A check that
 *  quietly succeeds when it ran nothing is the same green as a real one.
 *
 *  The Bun adapter is the only query embedder.
 */

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

/** The queries the adapter is exercised on: §9.7's own set, so this check and
 *  the acceptance rule cannot drift apart. */
const QUERIES = GOLDEN_QUERIES.map((golden) => golden.query.text);

const embedWith = (layer: Layer.Layer<QueryEmbedder>, query: string) =>
  Effect.flatMap(QueryEmbedder, (embedder) => embedder.embedQuery(query)).pipe(
    Effect.provide(layer),
    Effect.result,
  );

/** The fingerprint an adapter layer declares, read at that layer's own boundary. */
const fingerprintOf = (layer: Layer.Layer<QueryEmbedder>) =>
  Effect.map(QueryEmbedder, (embedder) => embedder.fingerprint).pipe(Effect.provide(layer));

/** The document side, under the other pinned prefix. */
const embedDocumentWith = (layer: Layer.Layer<QueryEmbedder>, text: string) =>
  Effect.flatMap(QueryEmbedder, (embedder) => embedder.embedDocument(text)).pipe(
    Effect.provide(layer),
    Effect.result,
  );

/** The adapter, built once for the whole file: each build loads the model's
 *  weights anew, and every check here is of the one model. Its runtime lives
 *  as long as the test process; the adapter holds nothing to release. */
const adapter: Layer.Layer<QueryEmbedder> = Layer.effectContext(
  ManagedRuntime.make(layerBunEmbedder).contextEffect,
);

/** Where the adapter reads the model's weights: `BIBLE_MODEL_CACHE`, else
 *  `~/.bible/models`, the order the adapter resolves them in, under the
 *  model's id (`MODEL_ID` in `embedder-transformers.ts`). */
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

/** A document past the model's 2048-token context, embedded once beside the
 *  probe so its case reads the answer rather than timing the encode. */
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

/** §9.5's retrieval contract, against the real weights.
 *
 *  These are the tests that would have caught the mean-pooling defect. Shape
 *  and fingerprint checks are blind to the one failure that matters most: an
 *  embedding that is the right shape and the wrong geometry.
 *
 *  What is checked instead is a property of the *model*: a query must sit closer
 *  to the paragraph that answers it than to one that does not. That is the only
 *  thing the vector leg is for, and it is false under any of the three defects
 *  the fingerprint now names.
 */
describe('§9.5 the retrieval embedding, against the real model', () => {
  /** Cosine over two int8 vectors, which under one fixed quantization scale is
   *  a monotone function of the float cosine. */
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

/** The device-independent half of the adapter, which every machine can check.
 *
 *  §9.5's MRL truncation and §9.2's quantization are where the query embedder
 *  and the vector compiler would most plausibly diverge — they are arithmetic
 *  each could have spelled itself — so they are shared code, and this is the
 *  test that says so. It runs
 *  whether or not the model is present, because it needs no model. */
describe('§9.5 the shared vector post-processing', () => {
  /** Unwraps a row this build accepts. A `None` here is the test's own premise
   *  failing, not the assertion under test, so it fails loudly rather than
   *  defaulting to an empty vector. */
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

  /** §10's "reject, never pad" gate (round-2 F9).
   *
   *  The earlier implementation read `values[axis] ?? 0`, so a model returning
   *  fewer than 256 components produced a 256-d vector whose tail was zeros.
   *  That vector passes every shape check the scan makes, so the ranking it
   *  produces is a ranking over a query nobody asked — the one failure mode no
   *  downstream code can detect. These three cases fail against the padding
   *  implementation and pass against the rejecting one. */
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
