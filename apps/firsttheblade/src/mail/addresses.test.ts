import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';

import { SubscriberId } from '../list/Subscriber.id.ts';
import { Address } from './address.ts';
import { Addresses, layer } from './addresses.ts';
import { layerSqlite } from './sql-sqlite.ts';

const test = it.effect.layer(
  layer.pipe(Layer.provide(layerSqlite), Layer.provide(BunServices.layer)),
);

const ANN = SubscriberId.make('ann');
const BEN = SubscriberId.make('ben');

describe('the address book', () => {
  test('keeps one address a subscriber, the newest written', () =>
    Effect.gen(function* () {
      const addresses = yield* Addresses;
      expect(yield* addresses.find(ANN)).toEqual(Option.none());
      yield* addresses.keep(ANN, Address.make('ann@example.com'), 1);
      yield* addresses.keep(ANN, Address.make('ann@example.org'), 2);
      expect(yield* addresses.find(ANN)).toEqual(Option.some(Address.make('ann@example.org')));
    }));

  test('forgets an address kept by the time given, and keeps one written after it', () =>
    Effect.gen(function* () {
      const addresses = yield* Addresses;
      yield* addresses.keep(ANN, Address.make('ann@example.com'), 10);
      yield* addresses.keep(BEN, Address.make('ben@example.com'), 30);
      yield* addresses.forget([
        { subscriber: ANN, before: 10 },
        { subscriber: BEN, before: 20 },
        { subscriber: SubscriberId.make('never-kept'), before: 99 },
      ]);
      expect(yield* addresses.find(ANN)).toEqual(Option.none());
      expect(yield* addresses.find(BEN)).toEqual(Option.some(Address.make('ben@example.com')));
    }));
});
