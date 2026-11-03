/**
 * The audio jobs' hashes against published values: RFC 1321's MD5 of `abc`,
 * FIPS 180-2's SHA-256 of `abc`, and the blob ids `git hash-object` prints.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { HashBun } from './hash-bun.ts';
import { Hash } from './stores.ts';

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe('HashBun', () => {
  it.effect('hashes MD5 and SHA-256 as the standards publish them', () =>
    Effect.gen(function* () {
      const hash = yield* Hash;
      expect(yield* hash.md5(bytesOf('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
      expect(yield* hash.sha256(bytesOf('abc'))).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    }).pipe(Effect.provide(HashBun)),
  );

  it.effect('names a blob as git does: SHA-1 over its header and its bytes', () =>
    Effect.gen(function* () {
      const hash = yield* Hash;
      expect(yield* hash.gitBlobSha1(bytesOf(''))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
      expect(yield* hash.gitBlobSha1(bytesOf('hello\n'))).toBe(
        'ce013625030ba8dba906f756967f9e9ca394464a',
      );
    }).pipe(Effect.provide(HashBun)),
  );
});
