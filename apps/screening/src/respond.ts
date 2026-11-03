import { Effect, Option } from 'effect';
import { Headers, type HttpServerRequest, HttpServerResponse } from 'effect/http';

import { ASSET_TYPES, PAGE_KEYS, VERSION_NAMES, type VersionName } from './manifest.ts';

export interface Span {
  readonly offset: number;
  readonly length: number;
}

export type Body = ReadableStream<Uint8Array> | Uint8Array | string;

export interface Head {
  readonly size: number;
  readonly etag: string;
}

export interface Shelf {
  readonly head: (key: string) => Effect.Effect<Option.Option<Head>>;
  readonly get: (
    key: string,
    span: Option.Option<Span>,
  ) => Effect.Effect<Option.Option<{ readonly head: Head; readonly body: Body }>>;
}

export const CACHE = {
  immutable: 'public, max-age=31536000, immutable',
  page: 'public, max-age=0, must-revalidate',
  day: 'public, max-age=86400',
} as const;

export const COMMON_HEADERS = {
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
} as const;

export const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

const HTML = 'text/html; charset=utf-8';

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Not found</title>
<style>body{margin:0;padding:20px 16px;background:#131210;color:#ece6da;font:16px/1.5 -apple-system,system-ui,sans-serif}a{color:inherit}</style></head>
<body><p>Nothing is here. <a href="/">All films</a></p></body></html>
`;

export type Route =
  | { readonly _tag: 'Robots' }
  | { readonly _tag: 'Object'; readonly key: string; readonly type: string; readonly cache: string }
  | { readonly _tag: 'NotFound' };

const FILM = /^[a-z0-9][a-z0-9-]*$/;
const FILE = /^[0-9a-f]{16}\.([a-z0-9]+)$/;
const TYPES: ReadonlyMap<string, string> = new Map(Object.entries(ASSET_TYPES));

const isVersion = (word: string): word is VersionName =>
  VERSION_NAMES.some((name) => name === word);

const page = (key: string): Route => ({ _tag: 'Object', key, type: HTML, cache: CACHE.page });

const NOT_FOUND: Route = { _tag: 'NotFound' };

export const routeOf = (pathname: string): Route => {
  if (pathname === '/') return page(PAGE_KEYS.index);
  if (pathname === '/robots.txt') return { _tag: 'Robots' };
  const parts = pathname.slice(1).replace(/\/$/, '').split('/');
  const [film = '', version = '', file = ''] = parts;
  if (!FILM.test(film) || parts.length > 3) return NOT_FOUND;
  if (parts.length === 1) return page(PAGE_KEYS.folder(film));
  if (!isVersion(version)) return NOT_FOUND;
  if (parts.length === 2) return page(PAGE_KEYS.version(film, version));
  if (pathname.endsWith('/')) return NOT_FOUND;
  const type = Option.flatMap(Option.fromNullishOr(FILE.exec(file)?.[1]), (ext) =>
    Option.fromNullishOr(TYPES.get(ext)),
  );
  return Option.match(type, {
    onNone: () => NOT_FOUND,
    onSome: (found): Route => ({
      _tag: 'Object',
      key: `${film}/${version}/${file}`,
      type: found,
      cache: CACHE.immutable,
    }),
  });
};

export type Asked =
  | { readonly _tag: 'From'; readonly start: number; readonly end: Option.Option<number> }
  | { readonly _tag: 'Suffix'; readonly length: number };

export const askedOf = (header: Option.Option<string>): Option.Option<Asked> =>
  Option.flatMap(header, (value) =>
    Option.flatMap(Option.fromNullishOr(/^bytes=(\d*)-(\d*)$/.exec(value.trim())), (match) => {
      const [, start = '', end = ''] = match;
      if (start === '' && end === '') return Option.none();
      if (start === '') return Option.some<Asked>({ _tag: 'Suffix', length: Number(end) });
      const from = Number(start);
      const to = Option.filter(Option.some(end), (text) => text !== '').pipe(Option.map(Number));
      if (Option.isSome(to) && to.value < from) return Option.none();
      return Option.some<Asked>({ _tag: 'From', start: from, end: to });
    }),
  );

export const spanOf = (asked: Asked, size: number): Option.Option<Span> => {
  if (asked._tag === 'Suffix') {
    const length = Math.min(asked.length, size);
    if (length <= 0) return Option.none();
    return Option.some({ offset: size - length, length });
  }
  if (asked.start >= size) return Option.none();
  const end = Math.min(
    Option.getOrElse(asked.end, () => size - 1),
    size - 1,
  );
  return Option.some({ offset: asked.start, length: end - asked.start + 1 });
};

const requestUrl = (request: HttpServerRequest.HttpServerRequest) => {
  if (request.url.startsWith('/')) return new URL(`http://localhost${request.url}`);
  return new URL(request.url);
};

const answer = (
  body: Body,
  init: {
    readonly status: number;
    readonly type: string;
    readonly headers: Record<string, string>;
  },
) =>
  HttpServerResponse.raw(body, {
    status: init.status,
    contentType: init.type,
    headers: Headers.fromInput({ ...COMMON_HEADERS, ...init.headers }),
  });

const empty = (status: number, headers: Record<string, string>) =>
  HttpServerResponse.empty({
    status,
    headers: Headers.fromInput({ ...COMMON_HEADERS, ...headers }),
  });

const notFound = (isHead: boolean) => {
  const init = { status: 404, type: HTML, headers: { 'cache-control': CACHE.page } };
  if (isHead) return answer('', init);
  return answer(NOT_FOUND_PAGE, init);
};

const serveObject = Effect.fnUntraced(function* (
  shelf: Shelf,
  route: Extract<Route, { readonly _tag: 'Object' }>,
  request: HttpServerRequest.HttpServerRequest,
) {
  const isHead = request.method === 'HEAD';
  const asked = askedOf(Headers.get(request.headers, 'range'));
  const base = { 'cache-control': route.cache, 'accept-ranges': 'bytes' };
  const known = yield* shelf.head(route.key);
  if (Option.isNone(known)) return notFound(isHead);
  const { size, etag } = known.value;
  const span = Option.map(asked, (each) => spanOf(each, size));
  if (Option.isSome(span) && Option.isNone(span.value))
    return empty(416, { ...base, 'content-range': `bytes */${size}` });
  const stretch = Option.flatten(span);
  const length = Option.match(stretch, { onNone: () => size, onSome: (each) => each.length });
  const headers = {
    ...base,
    etag,
    'content-length': `${length}`,
    ...Option.match(stretch, {
      onNone: () => ({}),
      onSome: (each) => ({
        'content-range': `bytes ${each.offset}-${each.offset + each.length - 1}/${size}`,
      }),
    }),
  };
  const status = Option.match(stretch, { onNone: () => 200, onSome: () => 206 });
  if (isHead) return answer('', { status, type: route.type, headers });
  const read = yield* shelf.get(route.key, stretch);
  if (Option.isNone(read)) return notFound(false);
  return answer(read.value.body, { status, type: route.type, headers });
});

export const respond = (shelf: Shelf, request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return empty(405, { allow: 'GET, HEAD' });
    const route = routeOf(requestUrl(request).pathname);
    if (route._tag === 'Robots')
      return answer(ROBOTS_TXT, {
        status: 200,
        type: 'text/plain; charset=utf-8',
        headers: { 'cache-control': CACHE.day },
      });
    if (route._tag === 'NotFound') return notFound(request.method === 'HEAD');
    return yield* serveObject(shelf, route, request);
  });
