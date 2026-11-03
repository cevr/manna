import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, Exit, FileSystem, Layer, Option, Ref } from 'effect';

import { QueryEmbedder } from './embedder.js';
import {
  goldenSearchSources,
  goldenVector,
  goldenVectorIndexBytes,
  GOLDEN_QUERIES,
} from './golden-fixture.js';
import { SearchQuery } from './model.js';
import { SearchService } from './service.js';
import { VectorIndexBytes } from './vector-artifact.js';
import { layerFileVectorIndexBytes } from './vector-bytes-fs.js';
import { MODEL_FINGERPRINT } from './vector-index.js';

const embedder = Layer.succeed(
  QueryEmbedder,
  QueryEmbedder.of({
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: (query: string) => Effect.succeed(goldenVector(query)),
    embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
  }),
);

const query = (text: string) =>
  SearchQuery.make({
    text,
    scope: Option.none(),
    bookCode: Option.none(),
    limit: Option.none(),
  });

class ReadCount extends Context.Service<ReadCount, Ref.Ref<number>>()(
  '@manna/core/search/test/ReadCount',
) {
  static readonly Live: Layer.Layer<ReadCount> = Layer.effect(ReadCount, Ref.make(0));
}

const countingBytes: Layer.Layer<VectorIndexBytes, never, ReadCount> = Layer.effect(
  VectorIndexBytes,
  Effect.gen(function* () {
    const reads = yield* ReadCount;
    const bytes = goldenVectorIndexBytes();
    return VectorIndexBytes.of({
      read: Ref.update(reads, (count) => count + 1).pipe(Effect.as(Option.some(bytes))),
    });
  }),
);

const countingSearch: Layer.Layer<SearchService | ReadCount> = SearchService.Live.pipe(
  Layer.provide(goldenSearchSources),
  Layer.provide(countingBytes),
  Layer.provide(embedder),
  Layer.provideMerge(ReadCount.Live),
);

describe('§9.6 the index is read once, not once per query', () => {
  it.scopedLive('parses the artifact at layer start and never again', () =>
    Effect.gen(function* () {
      const service = yield* SearchService;
      const reads = yield* ReadCount;
      for (const golden of GOLDEN_QUERIES) {
        yield* service.query(golden.query);
      }
      yield* service.query(query('the sanctuary'));
      yield* service.query(query('the daily'));

      expect(yield* Ref.get(reads)).toBe(1);
    }).pipe(Effect.provide(countingSearch)),
  );
});

describe('§6.5 the filesystem reader degrades on faults and not on defects', () => {
  const dyingFileSystem = Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({ exists: () => Effect.die(new Error('stat blew up')) }),
  );

  const dyingRead = Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({
      exists: () => Effect.succeed(true),
      readFile: () => Effect.die(new Error('read blew up')),
    }),
  );

  const missing = Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({ exists: () => Effect.succeed(false) }),
  );

  it.scopedLive('reports a missing file as an absent index', () =>
    Effect.gen(function* () {
      const source = yield* VectorIndexBytes;
      const bytes = yield* source.read;
      expect(Option.isNone(bytes)).toBe(true);
    }).pipe(
      Effect.provide(
        layerFileVectorIndexBytes('/nowhere/vectors.bvi').pipe(Layer.provide(missing)),
      ),
    ),
  );

  it.scopedLive('lets a defect in the stat propagate', () =>
    Effect.gen(function* () {
      const outcome = yield* Effect.exit(Effect.flatMap(VectorIndexBytes, (source) => source.read));
      expect(Exit.isFailure(outcome)).toBe(true);
    }).pipe(
      Effect.provide(
        layerFileVectorIndexBytes('/nowhere/vectors.bvi').pipe(Layer.provide(dyingFileSystem)),
      ),
    ),
  );

  it.scopedLive('lets a defect in the read propagate', () =>
    Effect.gen(function* () {
      const outcome = yield* Effect.exit(Effect.flatMap(VectorIndexBytes, (source) => source.read));
      expect(Exit.isFailure(outcome)).toBe(true);
    }).pipe(
      Effect.provide(
        layerFileVectorIndexBytes('/nowhere/vectors.bvi').pipe(Layer.provide(dyingRead)),
      ),
    ),
  );
});
