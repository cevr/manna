/**
 * `bun run preview`: the built site on a laptop (`./local.ts`), on `PORT`
 * (8470 by default). Build first (`bun run build`).
 *
 * The email list runs too, in memory: no mail leaves the laptop. Each letter
 * is written to `tmp/outbox/<n>.txt`, so a sign-up can be confirmed and left
 * by opening the links in it, and the list is empty again at each start.
 */
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
