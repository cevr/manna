import { Layer } from 'effect';

import { Hash } from './stores.ts';

const hex = (algorithm: 'md5' | 'sha1', parts: ReadonlyArray<Uint8Array | string>) => {
  const hasher = new Bun.CryptoHasher(algorithm);
  for (const part of parts) hasher.update(part);
  return hasher.digest('hex');
};

export const HashBun = Layer.succeed(
  Hash,
  Hash.of({
    md5: (bytes) => hex('md5', [bytes]),
    gitBlobSha1: (bytes) => hex('sha1', [`blob ${bytes.byteLength}\0`, bytes]),
  }),
);
