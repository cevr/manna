/** The digest of bytes that arrive as a stream, folded chunk by chunk.
 *
 *  Effect's `Digest` hashes one buffer whole; a 150 MB artifact read at every
 *  startup is hashed as it streams instead. The Bun adapter is
 *  `platform-bun/stream-digest-bun.ts`; `testing.ts` holds a layer that
 *  collects the stream and hashes it once through `Digest`, the oracle the
 *  adapter is held to.
 */

import type { Digest } from 'effect/crypto';
import { Context, type Effect, type Stream } from 'effect';

interface StreamDigestService {
  /** `<label>:<hex>` of every byte `bytes` yields, in order; SHA-256 when no
   *  algorithm is named, labelled `sha256`. */
  readonly digest: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
    algorithm?: Digest.Algorithm,
  ) => Effect.Effect<string, E, R>;
}

export class StreamDigest extends Context.Service<StreamDigest, StreamDigestService>()(
  '@manna/core/stream-digest/StreamDigest',
) {}

const labels = {
  MD5: 'md5',
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512',
} as const satisfies Record<Digest.Algorithm['name'], string>;

type DigestLabel = (typeof labels)[Digest.Algorithm['name']];

/** An algorithm's label in a digest string, which is also its name to Bun's hasher: `SHA-256` is `sha256`. */
export const digestLabel = (algorithm: Digest.Algorithm): DigestLabel => labels[algorithm.name];
