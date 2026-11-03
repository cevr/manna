import { BunRuntime } from '@effect/platform-bun';
import { Config, Effect, Layer } from 'effect';
import { HttpServer } from 'effect/http';

import { layerLocal } from './local.ts';

const PreviewLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port('PORT').pipe(Config.withDefault(8470));
    return layerLocal({ port });
  }),
);

PreviewLive.pipe(HttpServer.withLogAddress, Layer.launch, BunRuntime.runMain);
