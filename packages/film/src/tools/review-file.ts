import { Effect } from 'effect';
import { HttpServerRequest, HttpStaticServer } from 'effect/http';
import { ReviewFileUnknown } from '../core/refusals.ts';

const MIME_TYPES = { m4a: 'audio/mp4', vtt: 'text/vtt; charset=utf-8' };

export const CACHE = {
  none: 'no-store',
  fresh: 'no-cache',
  derived: 'max-age=86400',
  hashed: 'max-age=31536000, immutable',
} as const;

export const urlPath = (url: string): string => url.split('?')[0] ?? '';

export const serveFile = Effect.fn('review.serveFile')(function* (
  request: HttpServerRequest.HttpServerRequest,
  file: string,
  cacheControl: string,
) {
  const serve = yield* HttpStaticServer.make({ root: '/', cacheControl, mimeTypes: MIME_TYPES });
  const url = file
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return yield* serve.pipe(
    Effect.provideService(HttpServerRequest.HttpServerRequest, request.modify({ url })),
    Effect.catchTag('HttpServerError', () =>
      Effect.fail(ReviewFileUnknown.make({ ref: urlPath(request.url) })),
    ),
  );
});
