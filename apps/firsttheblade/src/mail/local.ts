/**
 * The list off Cloudflare: its model hosted in memory (`./model.ts`), its
 * tables in SQLite in memory with the migrations applied
 * (`./sql-sqlite.ts`), and a token key made fresh each run:
 *
 * - `layerTest`: what the tests run the routes against, with the films they
 *   name (`./films.ts`). Its mailer and its queue keep what they are given
 *   (`Mailbox`, `Queued`), and nothing runs after an answer until
 *   `Settle.settle`: a sign-up's work, then the model's policies and
 *   projections, and every scheduled command come due. The model reads the
 *   `TestClock` the layer brings, which the tests move. Its admin token is
 *   `TEST_ADMIN_TOKEN`.
 * - `layerPreview`: the site on a laptop (`../worker/local.ts`). Each letter is
 *   written to a file in `outbox` instead of being sent; a sign-up's work, the
 *   model's policies and a film's send run at once. The admin token is
 *   `MAIL_ADMIN_TOKEN` when it is set.
 *
 * Both need the platform's file system (`BunServices.layer`).
 */
import * as InMemory from '@alchemy.run/domain/InMemory';
import { BunCrypto } from '@effect/platform-bun';
import { Clock, Config, Context, Crypto, Duration, Effect, Layer, Redacted } from 'effect';
import { Hex } from 'effect/encoding';
import { TestClock } from 'effect/testing';

import { Held, layerHeld, layerInline } from './background.ts';
import { layerInlineQueue } from './deliver.ts';
import { type Films, layerSite } from './films.ts';
import { layerMemory as mailerMemory, layerOutbox } from './mailer.ts';
import { layerModel, layerTables } from './model.ts';
import { layerMemory as queueMemory } from './queue.ts';
import { AdminToken } from './routes.ts';
import { layerSqlite } from './sql-sqlite.ts';
import { layerMemory as throttleMemory } from './throttle.ts';
import { layer as tokensLayer } from './tokens.ts';

export const TEST_ADMIN_TOKEN = 'test-admin-token';

/** A key of 32 random bytes, which no one but this run holds. */
const freshKey = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  return Redacted.make(Hex.encode(yield* crypto.randomBytes(32)));
}).pipe(Effect.orDie);

const freshTokens = Layer.unwrap(Effect.map(freshKey, tokensLayer));

/** Runs what waits in the tests: a sign-up's work, then everything the model has to deliver or has come due. */
export class Settle extends Context.Service<Settle, { readonly settle: Effect.Effect<void> }>()(
  'firsttheblade/Settle',
) {}

/**
 * The model's memory platform, its commands stamped by the clock the layer
 * is built under (a test's `TestClock`). `manual` holds every delivery until
 * `drain`; otherwise each runs in the background as it is made.
 */
const memoryPlatform = (manual: boolean) =>
  Clock.clockWith((clock) =>
    Effect.sync(() => InMemory.make({ manual, now: () => clock.currentTimeMillisUnsafe() })),
  );

/**
 * One turn of the event loop, on the live clock (a test's clock never moves
 * by itself): a promise a policy waits on, as WebCrypto's, settles in it.
 */
const nextTurn = Clock.Clock.defaultValue().sleep(Duration.zero);

/**
 * Delivers until nothing is left: a policy's run is forked, and may commit
 * more to deliver or wait on a promise, so the platform is drained, a turn of
 * the event loop at a time, until it stays idle. A policy or projection that
 * failed is a defect of the test.
 */
const drained = (control: InMemory.Control) =>
  Effect.gen(function* () {
    for (let round = 0; round < 1_000; round += 1) {
      yield* control.drain;
      yield* nextTurn;
      if (yield* control.idle) {
        if (control.failures.length > 0) {
          return yield* Effect.die(new Error(`the model failed: ${String(control.failures[0])}`));
        }
        return;
      }
    }
    return yield* Effect.die(new Error('the model did not settle'));
  });

/** The model in memory over the tables, with `Settle` for the tests. */
const layerModelTest = Layer.unwrap(
  Effect.gen(function* () {
    const platform = yield* memoryPlatform(true);
    const settle = Layer.effect(
      Settle,
      Effect.gen(function* () {
        const held = yield* Held;
        return Settle.of({ settle: Effect.andThen(held.settle, drained(platform.control)) });
      }),
    );
    return Layer.merge(layerModel.pipe(Layer.provide(platform.layer)), settle);
  }),
);

export const layerTest = <E, R>(films: Layer.Layer<Films, E, R>) =>
  Layer.mergeAll(
    films,
    layerModelTest,
    queueMemory,
    throttleMemory,
    Layer.succeed(AdminToken, Redacted.make(TEST_ADMIN_TOKEN)),
  ).pipe(
    Layer.provideMerge(Layer.mergeAll(layerTables, freshTokens, mailerMemory, layerHeld)),
    Layer.provideMerge(layerSqlite),
    Layer.provideMerge(BunCrypto.layer),
    // The model stamps commands with this clock, and the tests move it: the
    // test runner's own TestClock is built beside this layer, and this one
    // takes its place.
    Layer.provideMerge(TestClock.layer()),
  );

const layerModelPreview = Layer.unwrap(
  Effect.map(memoryPlatform(false), (platform) => layerModel.pipe(Layer.provide(platform.layer))),
);

export const layerPreview = (outbox: string) => {
  const core = Layer.mergeAll(layerSite, freshTokens, layerOutbox(outbox)).pipe(
    Layer.provideMerge(layerTables),
    Layer.provideMerge(layerSqlite),
  );
  const admin = Layer.effect(
    AdminToken,
    Effect.gen(function* () {
      const fallback = yield* freshKey;
      return yield* Config.Redacted('MAIL_ADMIN_TOKEN').pipe(Config.withDefault(fallback));
    }).pipe(Effect.orDie),
  );
  return Layer.mergeAll(layerInlineQueue, throttleMemory, layerInline, admin).pipe(
    Layer.provideMerge(layerModelPreview),
    Layer.provideMerge(core),
    Layer.provideMerge(BunCrypto.layer),
  );
};
