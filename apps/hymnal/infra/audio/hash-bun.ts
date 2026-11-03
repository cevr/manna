/**
 * The audio jobs' hashes on Bun, through Effect's `Digest` on `node:crypto`
 * (`BunCrypto.layerDigest`), which has MD5 as well as the SHAs. Git's blob id
 * is SHA-1 over the blob header and the bytes, hashed as one buffer.
 */
import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import { Effect, Layer } from 'effect';
import { Digest } from 'effect/crypto';

import { Hash } from './stores.ts';

/** `blob <length>\0` followed by the bytes: what git hashes for a blob's id. */
const gitBlob = (bytes: Uint8Array) => {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + bytes.byteLength);
  blob.set(header);
  blob.set(bytes, header.byteLength);
  return blob;
};

export const HashBun = Layer.effect(
  Hash,
  Effect.gen(function* () {
    const digest = yield* Digest.Digest;
    return Hash.of({
      md5: (bytes) => digest.digestHex(Digest.md5, bytes),
      sha256: (bytes) => digest.digestHex(Digest.sha256, bytes),
      gitBlobSha1: (bytes) => digest.digestHex(Digest.sha1, gitBlob(bytes)),
    });
  }),
).pipe(Layer.provide(BunCrypto.layerDigest));
