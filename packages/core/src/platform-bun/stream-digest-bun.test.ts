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

const chunk = Arbitrary.map(
  Arbitrary.array(
    Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))),
    { maxLength: 48 },
  ),
  (values) => Uint8Array.from(values),
);

describe('StreamDigestBun', () => {
  it.effect('any chunking of any bytes digests to the one-shot digest of those bytes', () =>
    Effect.gen(function* () {
      const result = yield* Arbitrary.checkEffect(
        Arbitrary.array(chunk, { maxLength: 16 }),
        (chunks) => streamedEqualsOneShot(chunks),
        { runs: 300, seed: 11 },
      );
      expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
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
