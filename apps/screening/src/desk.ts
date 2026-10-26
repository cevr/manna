/**
 * The desk: the publisher's way into the bucket, a policy over a `Store`
 * (`./worker/Desk.ts` binds it to R2 with a read-write binding; the tests
 * to a map). The site's own Worker only reads (`./respond.ts`); the desk is
 * a second Worker on its `workers.dev` host alone, and answers nothing
 * without the stack's secret (`Authorization: Bearer <secret>`), so only the
 * publisher (`./desk-client.ts`) reaches it.
 *
 *   GET    /keys?prefix=<p>[&delimiter=/]     the keys (and folders) under a prefix, as JSON
 *   GET    /objects/<key>                     an object's bytes
 *   HEAD   /objects/<key>                     whether it is held, its sha256 in `x-sha256`
 *   PUT    /objects/<key>                     write it whole (`x-sha256` names its bytes)
 *   DELETE /objects/<key>                     delete it
 *   POST   /uploads/<key>                     begin a multipart write (`x-sha256`): its id
 *   PUT    /uploads/<key>?upload=<id>&part=<n>   one part
 *   POST   /uploads/<key>?upload=<id>&complete   finish it, the parts in the body
 *   DELETE /uploads/<key>?upload=<id>            abort it: its parts go
 *
 * A Worker takes a request body of 100 MB at most, so a file larger than a
 * part (`PART_BYTES`) goes up in parts; R2 needs every part but the last of
 * one size.
 */
import { Effect, Option, Schema } from 'effect';
import { Headers, type HttpServerRequest, HttpServerResponse } from 'effect/http';

/** The size of every part of a multipart write but the last: well under a Worker's 100 MB request body. */
export const PART_BYTES = 32 * 1024 * 1024;

/** A part as written: its number and the tag R2 gave it. */
export const UploadedPart = Schema.Struct({
  partNumber: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  etag: Schema.String,
});
export type UploadedPart = typeof UploadedPart.Type;

/** What `GET /keys` answers. */
export const Listing = Schema.Struct({
  keys: Schema.Array(Schema.String),
  folders: Schema.Array(Schema.String),
});
export type Listing = typeof Listing.Type;

/** What `POST /uploads/<key>` answers. */
export const Begun = Schema.Struct({ uploadId: Schema.String });

/** What `…&complete` takes. */
export const Finished = Schema.Struct({ parts: Schema.Array(UploadedPart) });

/** The bucket as the desk writes it. */
export interface Store {
  /** Every key under `prefix`; with `delimiter`, the folders below it apart (`<prefix><name>/`). */
  readonly list: (prefix: string, delimiter: Option.Option<string>) => Effect.Effect<Listing>;
  /** The object's bytes; none when it is not held. */
  readonly read: (
    key: string,
  ) => Effect.Effect<Option.Option<ReadableStream<Uint8Array> | Uint8Array>>;
  /** Whether `key` is held, and the sha256 its writer named (none for an object written without one). */
  readonly hashOf: (key: string) => Effect.Effect<Option.Option<Option.Option<string>>>;
  readonly write: (
    key: string,
    bytes: Uint8Array,
    sha256: Option.Option<string>,
  ) => Effect.Effect<void>;
  readonly remove: (key: string) => Effect.Effect<void>;
  readonly begin: (key: string, sha256: Option.Option<string>) => Effect.Effect<string>;
  readonly part: (
    key: string,
    uploadId: string,
    partNumber: number,
    bytes: Uint8Array,
  ) => Effect.Effect<UploadedPart>;
  readonly finish: (
    key: string,
    uploadId: string,
    parts: ReadonlyArray<UploadedPart>,
  ) => Effect.Effect<void>;
  /** End a multipart write unfinished: its parts are deleted and the key is not written. */
  readonly abort: (key: string, uploadId: string) => Effect.Effect<void>;
}

/** The header naming an object's sha256. */
export const SHA256_HEADER = 'x-sha256';

const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

const status = (code: number) =>
  HttpServerResponse.empty({ status: code, headers: Headers.fromInput(NO_STORE) });

/** `value` as a JSON answer, written by `schema`. */
const jsonOf =
  <A>(schema: Schema.Codec<A, A>) =>
  (value: A) =>
    HttpServerResponse.text(Schema.encodeSync(Schema.fromJsonString(schema))(value), {
      contentType: 'application/json',
      headers: Headers.fromInput(NO_STORE),
    });

const listingJson = jsonOf(Listing);
const begunJson = jsonOf(Begun);
const partJson = jsonOf(UploadedPart);

/** Whether two strings are equal, in a time that does not depend on where they differ. */
const sameSecret = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let differs = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) differs |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return differs === 0;
};

/** A key as the desk's paths carry it, each segment encoded. */
export const keyPath = (key: string): string => key.split('/').map(encodeURIComponent).join('/');

/** A path's key: what follows `/<route>/`, each segment decoded; none for an empty or climbing key. */
const keyIn = (pathname: string, route: string): Option.Option<string> => {
  const prefix = `/${route}/`;
  if (!pathname.startsWith(prefix)) return Option.none();
  const segments = pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
    return Option.none();
  return Option.some(segments.join('/'));
};

const decodeFinished = Schema.decodeUnknownOption(Schema.fromJsonString(Finished));

const requestUrl = (request: HttpServerRequest.HttpServerRequest) => {
  if (request.url.startsWith('/')) return new URL(`http://localhost${request.url}`);
  return new URL(request.url);
};

/** A query parameter, when the URL has it. */
const param = (url: URL, name: string): Option.Option<string> =>
  Option.fromNullishOr(url.searchParams.get(name));

/** A request's whole body. */
const bodyOf = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.map(request.arrayBuffer.pipe(Effect.orDie), (buffer) => new Uint8Array(buffer));

/** `/objects/<key>`: read, check, write or delete one object. */
const objectRoute = Effect.fnUntraced(function* (
  store: Store,
  key: string,
  request: HttpServerRequest.HttpServerRequest,
) {
  const sha256 = Headers.get(request.headers, SHA256_HEADER);
  if (request.method === 'GET') {
    const bytes = yield* store.read(key);
    return Option.match(bytes, {
      onNone: () => status(404),
      onSome: (body) => HttpServerResponse.raw(body, { headers: Headers.fromInput(NO_STORE) }),
    });
  }
  if (request.method === 'HEAD') {
    const held = yield* store.hashOf(key);
    return Option.match(held, {
      onNone: () => status(404),
      onSome: (hash) => {
        const named = Option.match(hash, {
          onNone: () => ({}),
          onSome: (each) => ({ [SHA256_HEADER]: each }),
        });
        return HttpServerResponse.empty({
          status: 200,
          headers: Headers.fromInput({ ...NO_STORE, ...named }),
        });
      },
    });
  }
  if (request.method === 'PUT') {
    yield* store.write(key, yield* bodyOf(request), sha256);
    return status(204);
  }
  if (request.method === 'DELETE') {
    yield* store.remove(key);
    return status(204);
  }
  return status(405);
});

/** `/uploads/<key>`: begin, add a part to, finish or abort a multipart write. */
const uploadRoute = Effect.fnUntraced(function* (
  store: Store,
  key: string,
  url: URL,
  request: HttpServerRequest.HttpServerRequest,
) {
  const uploadId = param(url, 'upload');
  if (Option.isNone(uploadId)) {
    if (request.method !== 'POST') return status(400);
    const sha256 = Headers.get(request.headers, SHA256_HEADER);
    return begunJson({ uploadId: yield* store.begin(key, sha256) });
  }
  const partNumber = Number(Option.getOrElse(param(url, 'part'), () => ''));
  if (request.method === 'PUT' && Number.isInteger(partNumber) && partNumber >= 1)
    return partJson(yield* store.part(key, uploadId.value, partNumber, yield* bodyOf(request)));
  if (request.method === 'POST' && url.searchParams.has('complete')) {
    const finished = decodeFinished(yield* request.text.pipe(Effect.orDie));
    if (Option.isNone(finished)) return status(400);
    yield* store.finish(key, uploadId.value, finished.value.parts);
    return status(204);
  }
  if (request.method === 'DELETE') {
    yield* store.abort(key, uploadId.value);
    return status(204);
  }
  return status(400);
});

/** The answer to `request`, over `store`, for a holder of `secret`. */
export const respondDesk = (
  store: Store,
  secret: string,
  request: HttpServerRequest.HttpServerRequest,
) =>
  Effect.gen(function* () {
    const bearer = Option.getOrElse(Headers.get(request.headers, 'authorization'), () => '');
    if (secret === '' || !sameSecret(bearer, `Bearer ${secret}`)) return status(401);
    const url = requestUrl(request);
    if (url.pathname === '/keys' && request.method === 'GET') {
      const prefix = Option.getOrElse(param(url, 'prefix'), () => '');
      return listingJson(yield* store.list(prefix, param(url, 'delimiter')));
    }
    const object = keyIn(url.pathname, 'objects');
    if (Option.isSome(object)) return yield* objectRoute(store, object.value, request);
    const upload = keyIn(url.pathname, 'uploads');
    if (Option.isSome(upload)) return yield* uploadRoute(store, upload.value, url, request);
    return status(404);
  });
