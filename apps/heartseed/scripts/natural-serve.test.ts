/* oxlint-disable effect/noGlobals, effect/noInlineProvide, effect/noTernary -- the stand-in Hugging Face answers with a web Response; each case provides its own stand-in or server, the boundary under test; a byte comparison is a plain branch. */

/**
 * The development model server (`natural-serve.ts`) over a fake cache of
 * three made-up files, on a port the system picks, with no network: the
 * fill keeps files already checked and asks the network for nothing, takes
 * a missing file whose bytes check, and keeps no file whose bytes do not;
 * the server answers `GET` with a file's bytes and length and `HEAD` with
 * its length alone, 404 for any path not in the list or another method,
 * and `--corrupt` flips the middle byte of that file alone.
 *
 * It catches a fill that refetches what it holds or keeps a bad file, a
 * server that serves a path outside the list, and a corruption that
 * changes more than one byte or the wrong file. It misses Hugging Face's
 * own answers and the 83 MB.
 */

import { BunCrypto, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path } from 'effect';
import { Digest } from 'effect/crypto';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServer,
} from 'effect/http';

import { corrupted, fill, layerServe, sourceOf } from './natural-serve.ts';

const bytesOf = (size: number, seed: number) =>
  Uint8Array.from({ length: size }, (_, at) => (at * 31 + seed) % 251);

const A = bytesOf(1000, 7);
const B = bytesOf(7, 3);
const C = bytesOf(301, 11);

/** The fake cache's files, as the manifest lists them. */
const filesOf = Effect.gen(function* () {
  const digest = yield* Digest.Digest;
  const entry = (path: string, bytes: Uint8Array) =>
    Effect.map(digest.digestHex(Digest.sha256, bytes), (sha256) => ({
      path,
      bytes: bytes.byteLength,
      sha256,
    }));
  return [yield* entry('a.bin', A), yield* entry('w/b.bin', B), yield* entry('w/c/c.bin', C)];
});

/** A temporary cache holding a and b, but not c. */
const cacheOf = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cache = yield* fs.makeTempDirectoryScoped({ prefix: 'natural-serve-' });
  yield* fs.makeDirectory(path.join(cache, 'w'), { recursive: true });
  yield* fs.writeFile(path.join(cache, 'a.bin'), A);
  yield* fs.writeFile(path.join(cache, 'w/b.bin'), B);
  return cache;
});

/** A Hugging Face stand-in: each ask logged, answered by `body`, never the network. */
const hubOf = (asked: Array<string>, body: (url: string) => Uint8Array<ArrayBuffer>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        asked.push(url.toString());
        return HttpClientResponse.fromWeb(request, new Response(body(url.toString())));
      }),
    ),
  );

const platform = Layer.mergeAll(BunServices.layer, BunCrypto.layerDigest);

describe('fill', () => {
  it.effect('keeps checked files, and fetches the missing one from its pinned source', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const files = yield* filesOf;
      const cache = yield* cacheOf;
      const asked: Array<string> = [];
      const fetched = yield* fill(cache, files, sourceOf).pipe(
        Effect.provide(hubOf(asked, () => C)),
      );
      expect(fetched).toEqual(['w/c/c.bin']);
      expect(asked).toEqual([sourceOf('w/c/c.bin')]);
      expect(sourceOf('w/c/c.bin')).toBe(
        'https://huggingface.co/FluidInference/kokoro-82m-coreml/resolve/2568276a60ff6e7f312afce3dc9e3f07521cb48d/ANE/w/c/c.bin',
      );
      expect(yield* fs.readFile(path.join(cache, 'w/c/c.bin'))).toEqual(C);
      const again: Array<string> = [];
      expect(
        yield* fill(cache, files, sourceOf).pipe(Effect.provide(hubOf(again, () => C))),
      ).toEqual([]);
      expect(again).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect(
    'refetches a cached file whose bytes changed, and keeps none that fails its check',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const files = yield* filesOf;
        const cache = yield* cacheOf;
        yield* fs.writeFile(path.join(cache, 'a.bin'), corrupted(A));
        const asked: Array<string> = [];
        const failed = yield* fill(cache, files, sourceOf).pipe(
          Effect.provide(hubOf(asked, () => corrupted(A))),
          Effect.flip,
        );
        expect(failed._tag).toBe('FileMismatch');
        expect(asked).toEqual([sourceOf('a.bin')]);
        expect(yield* fs.exists(path.join(cache, 'a.bin.partial'))).toBe(false);
        const healed = yield* fill(cache, files, sourceOf).pipe(
          Effect.provide(
            hubOf([], (url) => {
              if (url.endsWith('a.bin')) return A;
              return C;
            }),
          ),
        );
        expect(healed).toEqual(['a.bin', 'w/c/c.bin']);
      }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

/** Asks the server at its own address, over loopback. */
const ask = (method: 'GET' | 'HEAD' | 'POST', path: string) =>
  HttpServer.addressFormattedWith((base) =>
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(HttpClientRequest.make(method)(`${base}/${path}`));
      const body = new Uint8Array(yield* response.arrayBuffer);
      return {
        status: response.status,
        length: Option.getOrElse(
          Option.fromUndefinedOr(response.headers['content-length']),
          () => '',
        ),
        body,
      };
    }),
  ).pipe(Effect.provide(FetchHttpClient.layer));

describe('the server', () => {
  it.effect('serves the listed files on GET and HEAD, and 404 for anything else', () =>
    Effect.gen(function* () {
      const files = yield* filesOf;
      const cache = yield* cacheOf;
      const served = yield* Effect.gen(function* () {
        return {
          a: yield* ask('GET', 'a.bin'),
          b: yield* ask('GET', 'w/b.bin'),
          head: yield* ask('HEAD', 'a.bin'),
          root: yield* ask('GET', ''),
          folder: yield* ask('GET', 'w'),
          other: yield* ask('GET', 'b.bin'),
          up: yield* ask('GET', 'w/../a.bin.partial'),
          post: yield* ask('POST', 'a.bin'),
        };
      }).pipe(
        Effect.provide(layerServe(cache, files, Option.none(), { port: 0, hostname: '127.0.0.1' })),
      );
      expect(served.a).toEqual({ status: 200, length: '1000', body: A });
      expect(served.b).toEqual({ status: 200, length: '7', body: B });
      expect(served.head.status).toBe(200);
      expect(served.head.length).toBe('1000');
      expect(served.head.body.byteLength).toBe(0);
      for (const refused of [served.root, served.folder, served.other, served.up, served.post]) {
        expect(refused.status).toBe(404);
      }
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect('flips the middle byte of the corrupt file alone', () =>
    Effect.gen(function* () {
      const files = yield* filesOf;
      const cache = yield* cacheOf;
      const served = yield* Effect.gen(function* () {
        return { a: yield* ask('GET', 'a.bin'), b: yield* ask('GET', 'w/b.bin') };
      }).pipe(
        Effect.provide(
          layerServe(cache, files, Option.some('a.bin'), { port: 0, hostname: '127.0.0.1' }),
        ),
      );
      expect(served.a.length).toBe('1000');
      const differ = [...served.a.body].flatMap((byte, at) => (byte === A[at] ? [] : [at]));
      expect(differ).toEqual([500]);
      expect(served.b.body).toEqual(B);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

describe('corrupted', () => {
  it.effect('flips one byte, the middle one, and keeps the length', () =>
    Effect.sync(() => {
      for (const size of [1, 2, 7, 1000]) {
        const bytes = bytesOf(size, size);
        const flipped = corrupted(bytes);
        expect(flipped.byteLength).toBe(size);
        const differ = [...flipped].flatMap((byte, at) => (byte === bytes[at] ? [] : [at]));
        expect(differ).toEqual([Math.floor(size / 2)]);
      }
    }),
  );
});
