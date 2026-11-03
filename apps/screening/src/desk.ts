import { Effect, Option, Schema } from 'effect';
import { Headers, type HttpServerRequest, HttpServerResponse } from 'effect/http';

export const PART_BYTES = 32 * 1024 * 1024;

export const UploadedPart = Schema.Struct({
  partNumber: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  etag: Schema.String,
});
export type UploadedPart = typeof UploadedPart.Type;

export const Listing = Schema.Struct({
  keys: Schema.Array(Schema.String),
  folders: Schema.Array(Schema.String),
});
export type Listing = typeof Listing.Type;

export const Begun = Schema.Struct({ uploadId: Schema.String });

export const Finished = Schema.Struct({ parts: Schema.Array(UploadedPart) });

export interface Store {
  readonly list: (prefix: string, delimiter: Option.Option<string>) => Effect.Effect<Listing>;
  readonly read: (
    key: string,
  ) => Effect.Effect<Option.Option<ReadableStream<Uint8Array> | Uint8Array>>;
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
  readonly abort: (key: string, uploadId: string) => Effect.Effect<void>;
}

export const SHA256_HEADER = 'x-sha256';

const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

const status = (code: number) =>
  HttpServerResponse.empty({ status: code, headers: Headers.fromInput(NO_STORE) });

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

const sameSecret = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let differs = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) differs |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return differs === 0;
};

export const keyPath = (key: string): string => key.split('/').map(encodeURIComponent).join('/');

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

const param = (url: URL, name: string): Option.Option<string> =>
  Option.fromNullishOr(url.searchParams.get(name));

const bodyOf = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.map(request.arrayBuffer.pipe(Effect.orDie), (buffer) => new Uint8Array(buffer));

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
