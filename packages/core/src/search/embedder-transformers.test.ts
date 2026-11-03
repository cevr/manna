import { describe, expect, it } from 'effect-bun-test';
import { Effect, Ref } from 'effect';

import { memoizeOnSuccess } from './embedder-transformers.js';

describe('§9.5 the model is memoized on success only', () => {
  it.scopedLive('retries after a typed load failure, then caches', () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const load = Effect.flatMap(
        Ref.updateAndGet(attempts, (count) => count + 1),
        (count) => {
          if (count === 1) return Effect.fail('still downloading' as const);
          return Effect.succeed('model');
        },
      );

      const model = yield* memoizeOnSuccess(load);

      const first = yield* Effect.result(model);
      expect(first._tag).toBe('Failure');
      expect(yield* model).toBe('model');
      expect(yield* Ref.get(attempts)).toBe(2);
    }),
  );

  it.scopedLive('loads once across many successful reads', () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const load = Effect.as(
        Ref.update(attempts, (count) => count + 1),
        'model',
      );
      const model = yield* memoizeOnSuccess(load);

      for (let read = 0; read < 5; read += 1) expect(yield* model).toBe('model');
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );

  it.scopedLive('loads one model for concurrent first reads', () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const load = Effect.as(
        Effect.delay(
          Ref.update(attempts, (count) => count + 1),
          '10 millis',
        ),
        'model',
      );
      const model = yield* memoizeOnSuccess(load);

      yield* Effect.all([model, model, model], { concurrency: 'unbounded' });
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );
});
