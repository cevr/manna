import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Path, Result } from 'effect';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { NetAddress } from 'effect/net';
import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import { LookFailed, LookLevelUnknown, PagesBroken } from '../core/easel.ts';
import type { SourceRefused } from '../core/refusals.ts';
import { editPick, lookLevels, lookPlay } from './choice-source.ts';
import { PageBundler } from './lab-page.ts';
import { boardFile, isBoardUrl, isNarrationUrl, narrationFile } from './narration-route.ts';
import { CACHE, urlPath } from './review-file.ts';

export const PALETTE_FILE = 'palette.ts';

type Wedged = Result.Result<string, LookLevelUnknown | SourceRefused>;

const wedgedPalette = (
  file: string,
  source: string,
  levels: Readonly<Record<string, string>>,
): Wedged =>
  Result.flatMap(lookLevels(file, source), (declared) =>
    Object.entries(levels).reduce<Wedged>(
      (text, [look, level]) =>
        Result.flatMap(text, (now): Wedged =>
          Option.match(Option.fromUndefinedOr(declared.get(look)), {
            onNone: (): Wedged =>
              Result.fail(
                LookLevelUnknown.make({
                  look,
                  level,
                  missing: 'look',
                  known: [...declared.keys()],
                }),
              ),
            onSome: (known): Wedged => {
              if (!known.includes(level))
                return Result.fail(LookLevelUnknown.make({ look, level, missing: 'level', known }));
              return editPick(file, now, lookPlay(look), level);
            },
          }),
        ),
      Result.succeed(source),
    ),
  );

export const paletteSwaps = Effect.fn('wedge.paletteSwaps')(function* (
  fs: FileSystem.FileSystem,
  file: string,
  levels: Readonly<Record<string, string>>,
) {
  const entries = Object.entries(levels);
  if (!Arr.isArrayNonEmpty(entries)) return new Map<string, string>();
  if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))) {
    const [look, level] = Arr.headNonEmpty(entries);
    return yield* LookLevelUnknown.make({ look, level, missing: 'look', known: [] });
  }
  const real = yield* fs.realPath(file).pipe(Effect.orElseSucceed(() => file));
  const source = yield* fs
    .readFileString(real)
    .pipe(Effect.mapError((error) => LookFailed.make({ reason: error.message })));
  const text = yield* Effect.fromResult(wedgedPalette(real, source, levels));
  return new Map([[real, text]]);
});

const MEDIA = new Map([
  ['.flac', 'audio/flac'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

const NOT_FOUND = HttpServerResponse.text('not found', { status: 404 });

const builtPath = (pathname: string, html: string): string => {
  if (pathname === '/') return `/${html}`;
  return pathname;
};

const serveWedge = Effect.fn('wedge.serve')(function* (
  page: string,
  films: string,
  swaps: ReadonlyMap<string, string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.dirname(page);
  const made = yield* (yield* PageBundler)
    .bundle([page], root, { publicPath: '/', swaps, servers: [] })
    .pipe(Effect.mapError((failed) => PagesBroken.make({ reason: failed.reason })));
  const html = path.relative(root, page);
  const files = new Map(made.outputs.map(({ path: name, ...file }) => [`/${name}`, file]));
  const answer = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const pathname = urlPath(request.url);
    if (isNarrationUrl(pathname) || isBoardUrl(pathname)) {
      const found = yield* Effect.map(
        Effect.all([narrationFile(films, pathname), boardFile(films, pathname)]),
        ([narration, board]) => Option.orElse(narration, () => board),
      ).pipe(Effect.orElseSucceed(() => Option.none<string>()));
      if (Option.isNone(found)) return NOT_FOUND;
      const bytes = yield* fs.readFile(found.value).pipe(Effect.option);
      return Option.match(bytes, {
        onNone: () => NOT_FOUND,
        onSome: (b) =>
          HttpServerResponse.uint8Array(b, {
            contentType: Option.getOrElse(
              Option.fromUndefinedOr(MEDIA.get(path.extname(found.value))),
              () => 'application/octet-stream',
            ),
            headers: { 'cache-control': CACHE.fresh },
          }),
      });
    }
    return Option.match(Option.fromUndefinedOr(files.get(builtPath(pathname, html))), {
      onNone: () => NOT_FOUND,
      onSome: (file) =>
        HttpServerResponse.uint8Array(file.bytes, {
          contentType: file.type,
          headers: { 'cache-control': CACHE.none },
        }),
    });
  });
  const server = Context.get(
    yield* Layer.build(BunHttpServer.layerServer({ hostname: '127.0.0.1', port: 0 })),
    HttpServer.HttpServer,
  );
  yield* server.serve(answer);
  const url = `${NetAddress.formatUrlUnsafe(server.address)}/`;
  yield* Effect.log(
    `render.wedge.served url=${url} files=${files.size} swaps=${[...swaps.keys()].map((f) => path.basename(f)).join(',')}`,
  );
  return url;
});

export const wedgeServer = (page: string, films: string, swaps: ReadonlyMap<string, string>) => {
  if (swaps.size === 0) return Effect.succeedNone;
  return Effect.asSome(serveWedge(page, films, swaps));
};
