import { Context, Effect, FileSystem, Layer, Option, Path } from 'effect';
import { HttpServerRequest, HttpServerResponse, Mime } from 'effect/http';

export interface AssetsService {
  readonly serve: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse>;
}

export class Assets extends Context.Service<Assets, AssetsService>()('firsttheblade/Assets') {}

export const requestUrl = (request: HttpServerRequest.HttpServerRequest) => {
  if (request.url.startsWith('/')) return new URL(`http://localhost${request.url}`);
  return new URL(request.url);
};

export const pageRequest = (request: HttpServerRequest.HttpServerRequest, path: string) =>
  HttpServerRequest.fromWeb(new Request(new URL(path, request.originalUrl)));

const FILE = /\.[^/.]+$/;

const contentTypeOf = (file: string) => {
  if (file.endsWith('.ico')) return 'image/x-icon';
  return Option.getOrElse(Mime.getType(file), () => 'application/octet-stream');
};

export const candidates = (pathname: string): ReadonlyArray<string> => {
  if (pathname.endsWith('/')) return [`${pathname}index.html`];
  if (FILE.test(pathname)) return [pathname];
  return [`${pathname}.html`, `${pathname}/index.html`];
};

export const layerDirectory = (root: string) =>
  Layer.effect(
    Assets,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const base = path.resolve(root);

      const read = (file: string) =>
        fs.readFile(path.join(base, file)).pipe(
          Effect.map((bytes) =>
            HttpServerResponse.uint8Array(bytes, {
              contentType: contentTypeOf(file),
            }),
          ),
          Effect.option,
        );

      const serve = Effect.fn('Assets.serve')(function* (
        request: HttpServerRequest.HttpServerRequest,
      ) {
        const notFound = HttpServerResponse.text('Not Found', { status: 404 });
        const pathname = requestUrl(request).pathname;
        if (!path.resolve(base, `.${pathname}`).startsWith(base)) return notFound;
        for (const file of candidates(pathname)) {
          const found = yield* read(file);
          if (Option.isSome(found)) return found.value;
        }
        return notFound;
      });

      return Assets.of({ serve });
    }),
  );
