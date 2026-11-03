import { Arbitrary, Effect, Schema, Stream } from 'effect';
import { Digest } from 'effect/crypto';
import { describe, expect, it } from 'effect-bun-test';

import { StreamDigest } from '../stream-digest/index.js';
import { StreamDigestOneShot } from '../stream-digest/testing.js';
import { StreamDigestBun } from './stream-digest-bun.js';

const bytesOf = (text: string) => new TextEncoder().encode(text);

/** The digest `layer`'s `StreamDigest` makes of `chunks`, streamed in that chunking. */
const digestWith = (
  layer: typeof StreamDigestBun,
  chunks: ReadonlyArray<Uint8Array>,
  algorithm?: Digest.Algorithm,
) =>
  StreamDigest.use((service) => service.digest(Stream.fromIterable(chunks), algorithm)).pipe(
    Effect.provide(layer),
  );

const streamedEqualsOneShot = (chunks: ReadonlyArray<Uint8Array>, algorithm?: Digest.Algorithm) =>
  Effect.all([
    digestWith(StreamDigestBun, chunks, algorithm),
    digestWith(StreamDigestOneShot, chunks, algorithm),
  ]).pipe(Effect.map(([streamed, oneShot]) => streamed === oneShot));

/** `length` bytes that vary with `seed`, from a xorshift generator. */
const payloadOf = (seed: number, length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  let state = seed | 1;
  for (let at = 0; at < length; at++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[at] = state & 255;
  }
  return bytes;
};

/** `payload` cut into consecutive chunks of `sizes`, in order; the last chunk takes what is left. */
const partition = (payload: Uint8Array, sizes: ReadonlyArray<number>): Array<Uint8Array> => {
  const chunks: Array<Uint8Array> = [];
  let at = 0;
  for (const size of sizes) {
    chunks.push(payload.subarray(at, at + size));
    at += size;
  }
  return [...chunks, payload.subarray(at)];
};

const total = (sizes: ReadonlyArray<number>) => sizes.reduce((sum, size) => sum + size, 0);

/** The digest of `payload` streamed as `chunks` equals the one-shot digest of `payload` as one chunk. */
const partitionDigestsAsWhole = (payload: Uint8Array, chunks: ReadonlyArray<Uint8Array>) =>
  Effect.all([
    digestWith(StreamDigestBun, chunks),
    digestWith(StreamDigestOneShot, [payload]),
  ]).pipe(Effect.map(([streamed, whole]) => streamed === whole));

const chunkSize = Arbitrary.schema(
  Schema.Union([
    Schema.Literals([0, 1, 63, 64, 65, 127, 128, 129]),
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6144 })),
  ]),
);

const partitionedPayload = Arbitrary.map(
  Arbitrary.all({
    seed: Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2 ** 31 - 1 })),
    ),
    sizes: Arbitrary.array(chunkSize, { maxLength: 8 }),
    tail: chunkSize,
  }),
  ({ seed, sizes, tail }) => {
    const payload = payloadOf(seed, total(sizes) + tail);
    return { payload, chunks: partition(payload, sizes) };
  },
);

describe('StreamDigestBun', () => {
  it.effect(
    'any partition of a payload, with chunks below, at and above the 64-byte block and empty ones, digests to the one-shot digest of the whole payload',
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          partitionedPayload,
          ({ payload, chunks }) => partitionDigestsAsWhole(payload, chunks),
          { runs: 300, seed: 11 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );

  it.effect(
    'one chunk of 63, 64, 65 bytes or of a 64 KiB file-stream chunk, and those bytes cut across the block, digest alike',
    () =>
      Effect.gen(function* () {
        const fileChunk = 64 * 1024;
        const cases: ReadonlyArray<{
          readonly length: number;
          readonly sizes: ReadonlyArray<number>;
        }> = [
          { length: 63, sizes: [] },
          { length: 64, sizes: [] },
          { length: 65, sizes: [] },
          { length: fileChunk, sizes: [] },
          { length: 64, sizes: [63, 0] },
          { length: 65, sizes: [64, 0, 0] },
          { length: 129, sizes: [65, 63] },
          { length: 2 * fileChunk + 1, sizes: [fileChunk, fileChunk] },
          { length: fileChunk, sizes: [63, 64, 65, 0, 4096] },
        ];
        const results = yield* Effect.forEach(cases, ({ length, sizes }) => {
          const payload = payloadOf(length, length);
          return partitionDigestsAsWhole(payload, partition(payload, sizes));
        });
        expect(results).toEqual(cases.map(() => true));
        const counting = Uint8Array.from({ length: 64 }, (_, at) => at);
        expect(yield* digestWith(StreamDigestBun, [counting])).toBe(
          'sha256:fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108',
        );
      }),
  );

  it.effect(
    'no chunks, empty chunks, one chunk and many chunks of the same bytes digest alike',
    () =>
      Effect.gen(function* () {
        const abc = bytesOf('abc');
        const chunkings: ReadonlyArray<ReadonlyArray<Uint8Array>> = [
          [],
          [new Uint8Array(0)],
          [abc],
          [new Uint8Array(0), abc, new Uint8Array(0)],
          [bytesOf('a'), new Uint8Array(0), bytesOf('b'), bytesOf('c')],
        ];
        expect(yield* Effect.forEach(chunkings, (chunks) => streamedEqualsOneShot(chunks))).toEqual(
          chunkings.map(() => true),
        );
        expect(yield* digestWith(StreamDigestBun, [bytesOf('a'), bytesOf('bc')])).toBe(
          'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
        expect(yield* digestWith(StreamDigestBun, [])).toBe(
          'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
      }),
  );

  it.effect('a named algorithm digests by it and is labelled with it', () =>
    Effect.gen(function* () {
      const chunks = [bytesOf('ab'), bytesOf('c')];
      expect(yield* digestWith(StreamDigestBun, chunks, Digest.sha1)).toBe(
        'sha1:a9993e364706816aba3e25717850c26c9cd0d89d',
      );
      const algorithms = [Digest.md5, Digest.sha1, Digest.sha384, Digest.sha512];
      expect(
        yield* Effect.forEach(algorithms, (algorithm) => streamedEqualsOneShot(chunks, algorithm)),
      ).toEqual(algorithms.map(() => true));
    }),
  );
});
