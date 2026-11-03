import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schedule } from 'effect';

import {
  primeVectorAccel,
  readyVectorAccel,
  resetVectorAccel,
  resolvedFor,
  vectorAccel,
} from './vector-accel.js';
import { scanVectorIndex, type VectorIndex, type VectorManifest } from './vector-index.js';

const DIMENSIONS = 256;

const makeIndex = (count: number, seed: number): VectorIndex => {
  let state = seed;
  const next = (): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  const vectors = new Int8Array(count * DIMENSIONS);
  for (let i = 0; i < vectors.length; i += 1) vectors[i] = Math.trunc(next() * 255) - 128;
  const paragraphIds = Array.from({ length: count }, (_, row) => `BK:${row}`);
  const manifest = {
    books: [{ bookCode: 'BK', offset: 0, count }],
    paragraphIds,
  } as unknown as VectorManifest;
  return {
    fingerprint: 'test',
    dimensions: DIMENSIONS,
    count,
    manifest,
    vectors,
  };
};

const makeQuery = (seed: number): Int8Array => {
  let state = seed;
  const query = new Int8Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    query[i] = Math.trunc((state / 2_147_483_648) * 255) - 128;
  }
  return query;
};

describe('vector scan acceleration', () => {
  it.effect('whichever tier loads answers exactly what the pure loop answers', () =>
    Effect.gen(function* () {
      resetVectorAccel();
      const index = makeIndex(4_000, 7);
      const accel = yield* vectorAccel(index);

      for (const seed of [1, 2, 3, 11, 101]) {
        const query = makeQuery(seed);
        const pure = scanVectorIndex(index, query, { topK: 30 });
        const fast = scanVectorIndex(index, query, {
          topK: 30,
          ...Option.match(accel, {
            onNone: () => ({}),
            onSome: (ready) => ({ scoreRange: ready.scoreRange }),
          }),
        });
        expect(fast.scanned).toBe(pure.scanned);
        expect(fast.neighbors.map((n) => n.paragraphId)).toEqual(
          pure.neighbors.map((n) => n.paragraphId),
        );
        expect(fast.neighbors.map((n) => n.similarity)).toEqual(
          pure.neighbors.map((n) => n.similarity),
        );
      }
    }),
  );

  it.effect('an accelerator that scores the wrong number of rows is refused', () =>
    Effect.sync(() => {
      const index = makeIndex(500, 3);
      const query = makeQuery(5);
      const pure = scanVectorIndex(index, query, { topK: 10 });
      const broken = scanVectorIndex(index, query, {
        topK: 10,
        scoreRange: (_query, _offset, count, out) => {
          out.fill(0);
          return count - 1;
        },
      });
      expect(broken.neighbors.map((n) => n.paragraphId)).toEqual(
        pure.neighbors.map((n) => n.paragraphId),
      );
    }),
  );

  it.effect('a scoped scan accelerates only the ranges it is allowed', () =>
    Effect.gen(function* () {
      resetVectorAccel();
      const index = makeIndex(1_000, 13);
      const accel = yield* vectorAccel(index);
      const query = makeQuery(21);
      const allow = new Set(['BK']);
      const pure = scanVectorIndex(index, query, { topK: 15, allow });
      const fast = scanVectorIndex(index, query, {
        topK: 15,
        allow,
        ...Option.match(accel, {
          onNone: () => ({}),
          onSome: (ready) => ({ scoreRange: ready.scoreRange }),
        }),
      });
      expect(fast.scanned).toBe(pure.scanned);
      expect(fast.neighbors).toEqual(pure.neighbors);
    }),
  );

  it.effect('a tier answers only for the vectors it was built from', () =>
    Effect.gen(function* () {
      resetVectorAccel();
      const built = makeIndex(256, 5);
      const other = makeIndex(256, 5);
      yield* vectorAccel(built);
      expect(Option.isNone(readyVectorAccel(other))).toBe(true);
      const rebuilt = yield* vectorAccel(other);
      expect(Option.isSome(readyVectorAccel(other))).toBe(Option.isSome(rebuilt));
      expect(Option.isNone(readyVectorAccel(built))).toBe(true);
    }),
  );

  it.live('the priming path is what production reads, and it lands', () =>
    Effect.gen(function* () {
      resetVectorAccel();
      const index = makeIndex(256, 5);
      expect(Option.isNone(readyVectorAccel(index))).toBe(true);
      primeVectorAccel(index);
      yield* Effect.sync(() => Option.isNone(resolvedFor(index))).pipe(
        Effect.repeat({ while: (pending) => pending, schedule: Schedule.spaced('5 millis') }),
      );
      const built = yield* vectorAccel(index);
      expect(Option.isSome(readyVectorAccel(index))).toBe(Option.isSome(built));
    }),
  );
});
