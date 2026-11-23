/**
 * Cross-origin reads of the packs: `GET /api/commentary/pack` and
 * `GET /api/study/:name`, which Heartseed's web build fetches from another
 * origin. Those paths alone answer any origin, expose their `ETag`, and
 * answer the preflight its `If-None-Match` makes the browser send; every
 * other path is answered as it was, with no CORS headers.
 */

import { Effect, Option } from 'effect';
import { HttpMiddleware, HttpRouter, HttpServerRequest } from 'effect/http';

import { STUDY_NAMES } from './api.js';
import { PACK_PATH } from './commentary-api.js';

/** The paths a page on another origin may read. */
const PACK_PATHS: ReadonlySet<string> = new Set([
  PACK_PATH,
  ...STUDY_NAMES.map((name) => `/api/study/${name}`),
]);

/** How long a browser may keep a preflight's answer: a day. */
const PREFLIGHT_MAX_AGE = 86_400;

const pathOf = Option.liftThrowable((url: string) => new URL(url, 'http://localhost').pathname);

/** Whether `url`, absolute (the Worker's) or a path (the Bun server's), is a pack's. */
export const isPackUrl = (url: string): boolean =>
  Option.exists(pathOf(url), (path) => PACK_PATHS.has(path));

const cors = HttpMiddleware.cors({
  allowedMethods: ['GET'],
  allowedHeaders: ['if-none-match'],
  exposedHeaders: ['etag'],
  maxAge: PREFLIGHT_MAX_AGE,
});

/** The packs' CORS, a global middleware of either host's router. */
export const PackCorsLive = HttpRouter.middleware(
  (app) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (isPackUrl(request.url)) return yield* cors(app);
      return yield* app;
    }),
  { global: true },
);
