import { Effect, Option, Result } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import { decodeComponent } from '@manna/url-state';
import { REVIEW_FILES, REVIEW_PHONE, LabHttpApi } from '../core/api.ts';
import { PhoneCopyUnmade, ReviewFileUnknown } from '../core/refusals.ts';
import { answered } from './api-server.ts';
import { CACHE, serveFile, urlPath } from './review-file.ts';
import { Review } from './review.ts';

/** The ref a `/api/review/files/<ref>` URL names: its path after `prefix`, each segment decoded. */
export const refFromUrl = (url: string, prefix: string): Option.Option<string> => {
  const path = urlPath(url);
  if (!path.startsWith(prefix)) return Option.none();
  return Result.getSuccess(
    Result.map(Result.all(path.slice(prefix.length).split('/').map(decodeComponent)), (segments) =>
      segments.join('/'),
    ),
  );
};

/** The ref the request's path names after `prefix`, or ReviewFileUnknown naming the path. */
const refOf = (request: HttpServerRequest.HttpServerRequest, prefix: string) =>
  Effect.fromOption(refFromUrl(request.url, prefix)).pipe(
    Effect.mapError(() => ReviewFileUnknown.make({ ref: urlPath(request.url) })),
  );

/** The review's own handlers. */
export const reviewGroup = HttpApiBuilder.group(LabHttpApi, 'review', (handlers) =>
  handlers
    .handle('index', ({ query }) =>
      answered(
        Effect.flatMap(Review, (review) =>
          review.index(Option.isSome(Option.fromUndefinedOr(query.fresh))),
        ),
      ),
    )
    .handle('file', ({ request }) =>
      answered(
        Effect.gen(function* () {
          const ref = yield* refOf(request, REVIEW_FILES);
          return yield* serveFile(request, yield* (yield* Review).resolve(ref), CACHE.fresh);
        }),
      ),
    )
    .handle('phone', ({ request }) =>
      answered(
        Effect.gen(function* () {
          const ref = yield* refOf(request, REVIEW_PHONE);
          const copy = yield* (yield* Review).phone(ref);
          if (Option.isNone(copy)) return yield* PhoneCopyUnmade.make({ ref });
          return yield* serveFile(request, copy.value, CACHE.fresh);
        }),
      ),
    )
    .handle('frame', ({ query, request }) =>
      answered(
        Effect.gen(function* () {
          const frame = yield* (yield* Review).frame(
            query.ref,
            Option.fromUndefinedOr(query.t),
            query.w ?? 960,
          );
          return yield* serveFile(request, frame, CACHE.fresh);
        }),
      ),
    )
    .handle('duration', ({ query }) =>
      answered(Effect.flatMap(Review, (review) => review.duration(query.ref))),
    ),
);
