/** `StreamDigest` on Bun's native hasher: each chunk updates one
 *  `Bun.CryptoHasher` as it arrives, so a file is hashed without being held
 *  whole. */

import { Digest } from 'effect/crypto';
import { Effect, Layer, Stream } from 'effect';

import { StreamDigest, digestLabel } from '../stream-digest/index.js';

export const StreamDigestBun: Layer.Layer<StreamDigest> = Layer.succeed(
  StreamDigest,
  StreamDigest.of({
    digest: (bytes, algorithm = Digest.sha256) =>
      Effect.suspend(() => {
        const label = digestLabel(algorithm);
        const hasher = new Bun.CryptoHasher(label);
        return bytes.pipe(
          Stream.runForEach((chunk) => Effect.sync(() => hasher.update(chunk))),
          Effect.map(() => `${label}:${hasher.digest('hex')}`),
        );
      }),
  }),
);
