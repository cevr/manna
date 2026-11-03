/** A `StreamDigest` that collects the whole stream and hashes it once through
 *  Effect's `Digest` (WebCrypto): the one-shot oracle the streaming adapter is
 *  held to, and a digest for tests that need no Bun. */

import { Digest } from 'effect/crypto';
import { Effect, Layer, Stream } from 'effect';

import { StreamDigest, digestLabel } from './index.js';

/** The bytes of `chunks` laid end to end. */
const concatenated = (chunks: Iterable<Uint8Array>): Uint8Array => {
  const parts = [...chunks];
  const whole = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.byteLength;
  }
  return whole;
};

export const StreamDigestOneShot: Layer.Layer<StreamDigest> = Layer.effect(
  StreamDigest,
  Effect.gen(function* () {
    const oneShot = yield* Digest.Digest;
    return StreamDigest.of({
      digest: (bytes, algorithm = Digest.sha256) =>
        Stream.runCollect(bytes).pipe(
          Effect.flatMap((chunks) => oneShot.digestHex(algorithm, concatenated(chunks))),
          Effect.map((hex) => `${digestLabel(algorithm)}:${hex}`),
        ),
    });
  }),
).pipe(Layer.provide(Digest.layerWebCrypto));
