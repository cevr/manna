/**
 * `bun run --cwd apps/heartseed natural:serve -- --port <p> --cache <dir> [--host 127.0.0.1|0.0.0.0] [--corrupt <path>]`:
 * the natural voice's model files for a development build, with no mirror
 * deployed. It fills `--cache` with the 38 pinned files from Hugging Face
 * at the pinned revision (`src/natural/manifest.ts`), checking each
 * SHA-256 and fetching none already checked, then serves `GET` and `HEAD`
 * of `/<path>` for those paths alone (404 for any other) on `--host`
 * (default 127.0.0.1). `--corrupt <path>` flips the middle byte of that file
 * as served, so the app's check can be seen to refuse it. It prints one
 * JSON line once it listens, and logs `[serve] <method> <path> <status>`
 * per request. It never ships: `scripts/` is not bundled.
 */
import { BunCrypto, BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { Digest } from 'effect/crypto';
import {
  FetchHttpClient,
  HttpClient,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';

import { FILES, SOURCE_REVISION } from '../src/natural/manifest.ts';
import type { ModelFile } from '../src/natural/module.ts';

/** Where Hugging Face keeps a pinned file. */
export const sourceOf = (path: string): string =>
  `https://huggingface.co/FluidInference/kokoro-82m-coreml/resolve/${SOURCE_REVISION}/ANE/${path}`;

/** A fetched file was not the pinned one: its size or SHA-256 differs. */
export class FileMismatch extends Schema.TaggedError<FileMismatch>()('FileMismatch', {
  path: Schema.String,
}) {}

/** `--corrupt` named a path that is not one of the files served. */
export class UnknownFile extends Schema.TaggedError<UnknownFile>()('UnknownFile', {
  path: Schema.String,
}) {}

/** Whether the file at `at` is the pinned one: present, at its size, with its SHA-256. */
const isChecked = Effect.fn('NaturalServe.isChecked')(function* (at: string, file: ModelFile) {
  const fs = yield* FileSystem.FileSystem;
  const digest = yield* Digest.Digest;
  if (!(yield* fs.exists(at))) return false;
  if (Number((yield* fs.stat(at)).size) !== file.bytes) return false;
  return (yield* digest.digestHex(Digest.sha256, yield* fs.readFile(at))) === file.sha256;
});

/**
 * Fills `cache` with `files`, in order: a file already checked is kept;
 * any other is fetched from `sourceFor(path)`, checked, written beside its
 * place and moved in. A file that fails its check is never kept. Answers
 * the paths it fetched.
 */
export const fill = Effect.fn('NaturalServe.fill')(function* (
  cache: string,
  files: ReadonlyArray<ModelFile>,
  sourceFor: (path: string) => string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const digest = yield* Digest.Digest;
  const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
  const fetched: Array<string> = [];
  for (const file of files) {
    const at = path.join(cache, file.path);
    if (yield* isChecked(at, file)) continue;
    yield* Console.log(`[serve] fetch ${file.path}`);
    const response = yield* client.get(sourceFor(file.path));
    const bytes = new Uint8Array(yield* response.arrayBuffer);
    const sum = yield* digest.digestHex(Digest.sha256, bytes);
    if (bytes.byteLength !== file.bytes || sum !== file.sha256) {
      return yield* FileMismatch.make({ path: file.path });
    }
    yield* fs.makeDirectory(path.dirname(at), { recursive: true });
    yield* fs.writeFile(`${at}.partial`, bytes);
    yield* fs.rename(`${at}.partial`, at);
    fetched.push(file.path);
  }
  return fetched;
});

/** The bytes with the middle one flipped. */
export const corrupted = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = Uint8Array.from(bytes);
  const middle = Math.floor(copy.byteLength / 2);
  copy[middle] = (copy[middle] ?? 0) ^ 0xff;
  return copy;
};

/** The answer to one request: a served file, its headers alone, or 404. */
const answerOf = (cache: string, files: ReadonlyArray<ModelFile>, corrupt: Option.Option<string>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const asked = Option.match(HttpServerRequest.toURL(request), {
      onNone: () => '',
      onSome: (url) => url.pathname.slice(1),
    });
    const file = Option.fromUndefinedOr(files.find((each) => each.path === asked));
    const method = request.method;
    const response = yield* Option.match(
      Option.filter(file, () => method === 'GET' || method === 'HEAD'),
      {
        onNone: () => Effect.succeed(HttpServerResponse.empty({ status: 404 })),
        onSome: (served) => {
          const at = path.join(cache, served.path);
          const headers = { 'content-length': String(served.bytes) };
          if (method === 'HEAD') {
            return Effect.succeed(HttpServerResponse.empty({ status: 200, headers }));
          }
          if (Option.contains(corrupt, served.path)) {
            return Effect.map(fs.readFile(at), (bytes) =>
              HttpServerResponse.uint8Array(corrupted(bytes), {
                contentType: 'application/octet-stream',
              }),
            );
          }
          return HttpServerResponse.file(at, { contentType: 'application/octet-stream' });
        },
      },
    );
    yield* Console.log(`[serve] ${method} ${asked} ${response.status}`);
    return response;
  });

/** Where the server listens. */
export interface Listen {
  readonly port: number;
  readonly hostname: string;
}

/** The files of `cache` served on `listen`, `corrupt` flipped; it gives the server (for its address) to what runs under it. */
export const layerServe = (
  cache: string,
  files: ReadonlyArray<ModelFile>,
  corrupt: Option.Option<string>,
  listen: Listen,
) =>
  HttpServer.serve(answerOf(cache, files, corrupt)).pipe(
    Layer.provideMerge(BunHttpServer.layer(listen)),
  );

/** The line printed once the server listens. */
const Ready = Schema.Struct({
  ready: Schema.Boolean,
  url: Schema.String,
  files: Schema.Int,
  fetched: Schema.Int,
  cache: Schema.String,
  corrupt: Schema.String,
});

/** Fills the cache, then serves it until stopped, after one JSON line naming its address. */
const serveFor = Effect.fn('NaturalServe.serve')(function* (
  cache: string,
  corrupt: Option.Option<string>,
  listen: Listen,
) {
  if (Option.isSome(corrupt) && !FILES.some((file) => file.path === corrupt.value)) {
    return yield* UnknownFile.make({ path: corrupt.value });
  }
  const fetched = yield* fill(cache, FILES, sourceOf);
  const ready = HttpServer.addressFormattedWith((url) =>
    Schema.encodeEffect(Schema.fromJsonString(Ready))({
      ready: true,
      url,
      files: FILES.length,
      fetched: fetched.length,
      cache,
      corrupt: Option.getOrElse(corrupt, () => ''),
    }).pipe(Effect.flatMap(Console.log)),
  );
  return yield* Layer.launch(
    Layer.effectDiscard(ready).pipe(Layer.provideMerge(layerServe(cache, FILES, corrupt, listen))),
  );
});

const command = Command.make(
  'natural-serve',
  {
    port: Flag.Int('port').pipe(
      Flag.withDescription('the port to listen on; 0 lets the system pick'),
    ),
    cache: Flag.String('cache').pipe(Flag.withDescription('where the checked files are kept')),
    host: Flag.Literals('host', ['127.0.0.1', '0.0.0.0']).pipe(Flag.withDefault('127.0.0.1')),
    corrupt: Flag.String('corrupt').pipe(
      Flag.optional,
      Flag.withDescription('a file whose middle byte is flipped as served'),
    ),
  },
  (flags) => serveFor(flags.cache, flags.corrupt, { port: flags.port, hostname: flags.host }),
);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, BunCrypto.layerDigest, FetchHttpClient.layer)),
    (program) => BunRuntime.runMain(program),
  );
}
