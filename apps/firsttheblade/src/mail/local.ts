import { SecureRandom } from 'effect/crypto';
import * as InMemory from '@alchemy.run/domain/InMemory';
import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import { Clock, Config, Context, Duration, Effect, Layer, Redacted } from 'effect';
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

const freshKey = Effect.gen(function* () {
  const crypto = yield* SecureRandom.SecureRandom;
  return Redacted.make(Hex.encode(yield* crypto.randomBytes(32)));
}).pipe(Effect.orDie);

const freshTokens = Layer.unwrap(Effect.map(freshKey, tokensLayer));

export class Settle extends Context.Service<Settle, { readonly settle: Effect.Effect<void> }>()(
  'firsttheblade/Settle',
) {}

const memoryPlatform = (manual: boolean) =>
  Clock.clockWith((clock) =>
    Effect.sync(() => InMemory.make({ manual, now: () => clock.currentTimeMillisUnsafe() })),
  );

const live = Clock.Clock.defaultValue();

const SETTLE_WITHIN = Duration.seconds(5);

const drained = (control: InMemory.Control) =>
  Effect.gen(function* () {
    const until = live.currentTimeMillisUnsafe() + Duration.toMillis(SETTLE_WITHIN);
    while (live.currentTimeMillisUnsafe() < until) {
      yield* control.drain;
      yield* live.sleep(Duration.zero);
      if (yield* control.idle) {
        if (control.failures.length > 0) {
          return yield* Effect.die(new Error(`the model failed: ${String(control.failures[0])}`));
        }
        return;
      }
    }
    return yield* Effect.die(new Error('the model did not settle'));
  });

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
