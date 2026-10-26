/**
 * The Worker's whole policy, over the bucket as a `Shelf` (`./worker/Site.ts`
 * binds it to R2; the tests to a map):
 *
 * - a path names a page, a version's file or `/robots.txt`, or nothing:
 *   `/` is the index, `/<film>/` a film's folder, `/<film>/<version>/` a
 *   version (`board`, `render`, `final`), `/<film>/<version>/<hash>.<ext>`
 *   one of its files; any other path is 404, and so is a page or file the
 *   bucket does not hold. The bucket is never listed;
 * - GET and HEAD only; any other method is 405;
 * - a `Range: bytes=…` request for a file answers 206 with those bytes, or
 *   416 when they lie past its end, so a phone's player can seek a video;
 * - a version's files are named by their bytes, so they are kept for a
 *   year; a page is asked for again each time, so a re-published version
 *   shows at once;
 * - every answer carries `X-Robots-Tag: noindex`, and `/robots.txt`
 *   disallows every path: unreleased drafts stay out of search, while the
 *   links work for anyone who has them.
 */
import { Effect, Option } from 'effect';
import { Headers, type HttpServerRequest, HttpServerResponse } from 'effect/http';

import { ASSET_TYPES, PAGE_KEYS, VERSION_NAMES, type VersionName } from './manifest.ts';

/** A stretch of an object's bytes: from `offset`, `length` bytes. */
export interface Span {
  readonly offset: number;
  readonly length: number;
}

/** An object's bytes as the host holds them, handed to the response untouched. */
export type Body = ReadableStream<Uint8Array> | Uint8Array | string;

/** What the bucket says of an object: its whole size and its entity tag. */
export interface Head {
  readonly size: number;
  readonly etag: string;
}

/** The bucket, as the policy reads it: one object at a time, by key. */
export interface Shelf {
  /** The object's size and tag; none when the bucket does not hold `key`. */
  readonly head: (key: string) => Effect.Effect<Option.Option<Head>>;
  /** The object's bytes (all, or `span` of them) with its head; none when the bucket does not hold `key`. */
  readonly get: (
    key: string,
    span: Option.Option<Span>,
  ) => Effect.Effect<Option.Option<{ readonly head: Head; readonly body: Body }>>;
}

export const CACHE = {
  /** A version's files: named by their bytes, so never changed under a name. */
  immutable: 'public, max-age=31536000, immutable',
  /** A page: asked for again each time, so a re-publish shows at once. */
  page: 'public, max-age=0, must-revalidate',
  /** `/robots.txt`. */
  day: 'public, max-age=86400',
} as const;

/** The headers every answer carries. */
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

/** What a path names. */
export type Route =
  | { readonly _tag: 'Robots' }
  | { readonly _tag: 'Object'; readonly key: string; readonly type: string; readonly cache: string }
  | { readonly _tag: 'NotFound' };

const FILM = /^[a-z0-9][a-z0-9-]*$/;
/** A version's file: sixteen hex digits of its sha256, and its extension. */
const FILE = /^[0-9a-f]{16}\.([a-z0-9]+)$/;
const TYPES: ReadonlyMap<string, string> = new Map(Object.entries(ASSET_TYPES));

const isVersion = (word: string): word is VersionName =>
  VERSION_NAMES.some((name) => name === word);

const page = (key: string): Route => ({ _tag: 'Object', key, type: HTML, cache: CACHE.page });

const NOT_FOUND: Route = { _tag: 'NotFound' };

/** What `pathname` names: a page with or without its trailing slash, a version's file, or `/robots.txt`. */
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

/** The bytes a `Range` header asks of an object: one stretch, `start` to `end` inclusive or a suffix. */
export type Asked =
  | { readonly _tag: 'From'; readonly start: number; readonly end: Option.Option<number> }
  | { readonly _tag: 'Suffix'; readonly length: number };

/**
 * The one stretch a `Range` header asks for; none for no header, another
 * unit, several stretches or a header that does not read, each of which is
 * answered with the whole object (RFC 9110 §14.2).
 */
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

/** The stretch of an object `size` bytes long that `asked` covers, cut at its end; none when none of it lies inside. */
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

/** The not-found page as a 404; its headers alone to a HEAD. */
const notFound = (isHead: boolean) => {
  const init = { status: 404, type: HTML, headers: { 'cache-control': CACHE.page } };
  if (isHead) return answer('', init);
  return answer(NOT_FOUND_PAGE, init);
};

/** The object `route` names, answered whole, as a stretch, or as 416. */
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

/** The answer to `request`, over `shelf`. */
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
