import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';

import { layerPreview } from '../mail/local.ts';
import { layerDirectory } from './assets.ts';
import { respond } from './respond.ts';

export const DIST = 'dist';

const app = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return yield* respond(request);
});

export const layerLocal = (listen: { readonly port: number; readonly hostname?: string }) =>
  HttpServer.serve(app).pipe(
    Layer.provide(layerDirectory(DIST)),
    Layer.provide(layerPreview('tmp/outbox')),
    Layer.provideMerge(BunHttpServer.layer(listen)),
  );
