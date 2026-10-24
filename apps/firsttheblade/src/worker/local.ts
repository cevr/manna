/**
 * The built site on a laptop: `dist/` served through the same policy the
 * Worker runs (`./respond.ts`), its files read from the directory the way the
 * asset layer serves them (`./assets.ts`), with the email list in memory
 * (`../mail/local.ts`, each letter written to `tmp/outbox/<n>.txt`). Both
 * paths are read from the working directory.
 *
 * `bun run preview` (`./preview.ts`) runs it on a fixed port; the contrast and
 * computed checks run it on a port the system picks, for as long as they
 * measure. It gives what runs under it the server (`HttpServer`, for its
 * address) and the platform's services (`BunServices`).
 */
import { BunHttpServer, BunServices } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';

import { layerPreview } from '../mail/local.ts';
import { layerDirectory } from './assets.ts';
import { respond } from './respond.ts';

/** The built site's directory. */
export const DIST = 'dist';

const app = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return yield* respond(request);
});

/** The site served on `port`, on every interface unless a `hostname` is named. */
export const layerLocal = (listen: { readonly port: number; readonly hostname?: string }) =>
  HttpServer.serve(app).pipe(
    Layer.provide(layerDirectory(DIST)),
    Layer.provide(layerPreview('tmp/outbox')),
    Layer.provideMerge(BunHttpServer.layer(listen)),
    Layer.provideMerge(BunServices.layer),
  );
