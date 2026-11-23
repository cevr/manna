import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Context, Effect, Layer, Schema } from 'effect';
import { HttpServer, HttpServerResponse } from 'effect/http';
import { NetAddress } from 'effect/net';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { Browser } from '../browser.ts';
import { collect } from '../process.ts';

/** A page with the smallest export handle the browser waits for: its title and its info. */
const PAGE = `<!doctype html><title>idle</title><script>window.__film = { info: { width: 16, height: 16, fps: 30, duration: 1, frames: 30 } };</script>`;

/** That page on loopback until the scope closes: its URL. */
const served = Effect.gen(function* () {
  const server = Context.get(
    yield* Layer.build(BunHttpServer.layerServer({ hostname: '127.0.0.1', port: 0 })),
    HttpServer.HttpServer,
  );
  yield* server.serve(Effect.succeed(HttpServerResponse.html(PAGE)));
  return `${NetAddress.formatUrlUnsafe(server.address)}/`;
});

/** How many Chromes this process launched still run (their parent is this process). */
const ours = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const ps = yield* collect(
    spawner,
    ChildProcess.make('ps', ['-axo', 'ppid=,args='], { forceKillAfter: '5 seconds' }),
  );
  return ps.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([ppid, ...args]) => ppid === String(process.pid) && args.includes('--remote-debugging-pipe'),
    ).length;
});

/** What the test reads: this process's Chromes while a browser is open, once its scope closed, and while a second one is open. */
const Seen = Schema.fromJsonString(
  Schema.Struct({ open: Schema.Finite, closed: Schema.Finite, again: Schema.Finite }),
);

/**
 * A page opened in the `Browser` and closed with the layer's scope, as a
 * command does: its Chrome must be gone with it, so the process exits; a
 * browser made after it launches Chrome again.
 */
Effect.gen(function* () {
  const used = Effect.scoped(
    Effect.gen(function* () {
      const url = yield* served;
      const browser = Context.get(yield* Layer.build(Browser.layer), Browser);
      yield* browser.open(url);
      return yield* ours;
    }),
  );
  const open = yield* used;
  const closed = yield* ours;
  const again = yield* used;
  yield* Console.log(yield* Schema.encodeEffect(Seen)({ open, closed, again }));
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
