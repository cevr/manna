import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Layer, Option, Path, Record as Rec, Schema } from 'effect';
import { HttpEffect, HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
  derivedFile,
  FOOTAGE_COPIES,
  FOOTAGE_LOCK_HREF,
  FootageLockJson,
  isTranscriptFile,
} from '../core/footage.ts';
import { CACHE, serveFile } from './review-file.ts';

export interface FootageRoot {
  readonly dir: string;
  readonly out: string;
}

const FOOTAGE_PREFIX = '/footage/';

const FOOTAGE_URL = /^\/footage\/([a-z0-9][a-z0-9.-]*)\/([0-9a-f]{12})\/(mezzanine|proxy)\.mp4$/;

const isCopy = Schema.is(Schema.Literals(FOOTAGE_COPIES));

const named = (pathname: string) =>
  Option.flatMap(Option.fromNullishOr(FOOTAGE_URL.exec(pathname)), ([, name, sha12, copy]) =>
    Option.all({
      name: Option.fromUndefinedOr(name),
      sha12: Option.fromUndefinedOr(sha12),
      copy: Option.filter(Option.fromUndefinedOr(copy), isCopy),
    }),
  );

export const isFootageUrl = (pathname: string): boolean => pathname.startsWith(FOOTAGE_PREFIX);

const NOT_FOUND = HttpServerResponse.text('not found', {
  status: 404,
  headers: { 'cache-control': CACHE.none },
});

const lockOf = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs
      .readFileString(path.join(dir, 'library.lock.json'))
      .pipe(Effect.flatMap(Schema.decodeEffect(FootageLockJson)), Effect.option);
  });

const TRANSCRIPT_URL = /^\/footage\/transcripts\/([^/]+)$/;

const libraryFile = Effect.fn('libraryFile')(function* (root: FootageRoot, pathname: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const onDisk = (file: string) =>
    Effect.map(fs.exists(file).pipe(Effect.orElseSucceed(() => false)), (there) =>
      Option.liftPredicate(file, () => there),
    );
  if (pathname === FOOTAGE_LOCK_HREF)
    return yield* onDisk(path.join(root.dir, 'library.lock.json'));
  const asked = Option.flatMap(Option.fromNullishOr(TRANSCRIPT_URL.exec(pathname)), (m) =>
    Option.fromUndefinedOr(m[1]),
  );
  for (const file of Option.toArray(asked))
    for (const lock of Option.toArray(yield* lockOf(root.dir))) {
      const listed = Object.values(lock.footage).some((entry) => entry.transcript === file);
      if (listed && isTranscriptFile(file))
        return yield* onDisk(path.join(root.dir, 'transcripts', file));
    }
  return Option.none<string>();
});

const footageFile = Effect.fn('footageFile')(function* (root: FootageRoot, pathname: string) {
  const fs = yield* FileSystem.FileSystem;
  const library = yield* libraryFile(root, pathname);
  if (Option.isSome(library)) return library;
  for (const { name, sha12, copy } of Option.toArray(named(pathname)))
    for (const lock of Option.toArray(yield* lockOf(root.dir)))
      for (const entry of Option.toArray(Rec.get(lock.footage, name))) {
        if (!entry.sha256.startsWith(sha12)) continue;
        const file = derivedFile(root.out, name, entry.sha256, `${copy}.mp4`);
        if (yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))
          return Option.some(file);
      }
  return Option.none<string>();
});

export const footageResponse = (
  root: FootageRoot,
  request: HttpServerRequest.HttpServerRequest,
  pathname: string,
) =>
  footageFile(root, pathname).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(NOT_FOUND),
        onSome: (file) => serveFile(request, file, CACHE.fresh),
      }),
    ),
    Effect.catchTags({
      ReviewFileUnknown: () => Effect.succeed(NOT_FOUND),
      PlatformError: (error) =>
        Effect.as(Effect.logWarning(`footage.route.failed ${error.message}`), NOT_FOUND),
    }),
  );

const RouteServices = BunHttpPlatform.layer.pipe(Layer.provideMerge(BunServices.layer));

export const footageHandler = (root: FootageRoot): ((request: Request) => Promise<Response>) => {
  const handle = HttpEffect.toWebHandler(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      return yield* footageResponse(root, request, new URL(request.url, 'http://player').pathname);
    }).pipe(Effect.provide(RouteServices)),
  );
  return (request) => handle(request);
};
