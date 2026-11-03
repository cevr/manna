import { Clock, Effect, Layer, Match, Option, References, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import bundled from 'virtual:hymnal-timing';

import { still } from '~/hymns/chords';
import { audioUrl } from '~/remote';

import { type Timeline, timingBook } from '../follow/timeline';
import { fakeDevice } from '../test/device';
import { Command, Player, playerOn, statusEvery } from './player';
import { soundOn } from './sound';

const book = timingBook(bundled);
const timelineOf = (hymn: number): Timeline => Option.getOrThrow(book.of(hymn));

const POLL = 250;
const TEMPI = Array.from({ length: 21 }, (_, i) => 50 + 5 * i);

const morning = { number: 100, title: 'Hymn 100' };
const printed = Atom.make(still);

const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
  discard: true,
});

const placeOf = (player: Player) =>
  Option.getOrThrow(Option.liftPredicate(player, Player.$is('Playing'))).at * 1000;

const composed = (on: boolean, initial: number) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const fake = fakeDevice();
    const sound = yield* SubscriptionRef.make(on);
    const tempo = Atom.make(initial).pipe(Atom.keepAlive);
    const other = Atom.make(100).pipe(Atom.keepAlive);
    const player = playerOn(
      Layer.mergeAll(
        soundOn(fake.layer, book.of, sound).pipe(Layer.provide(clockLayer)),
        clockLayer,
        Layer.succeed(References.MinimumLogLevel, 'None'),
      ),
      statusEvery,
      () => printed,
      (number: number) =>
        Match.value(number).pipe(
          Match.when(100, () => tempo),
          Match.orElse(() => other),
        ),
    );
    const registry = AtomRegistry.make();
    registry.mount(player.send);
    registry.mount(player.remote);
    for (const key of Object.values(player)) if (Atom.isAtom(key)) registry.mount<unknown>(key);
    const state = () => registry.get(player.state);
    return {
      device: fake.device,
      sound,
      state,
      setTempo: (percent: number) => registry.set(tempo, percent),
      send: (command: Command) => registry.set(player.send, command),
      run: (ms: number) =>
        Effect.gen(function* () {
          for (let t = 0; t < ms; t += POLL) {
            yield* TestClock.adjust(POLL);
            yield* settle;
          }
        }),
      until: (holds: (player: Player) => boolean, ms: number) =>
        Effect.gen(function* () {
          yield* settle;
          for (let t = 0; t < ms && !holds(state()); t += POLL) {
            yield* TestClock.adjust(POLL);
            yield* settle;
          }
          return state();
        }),
      [Symbol.dispose]: () => registry.dispose(),
    };
  });

describe('the player at a tempo, Sound off', () => {
  it.effect('plays from the first sung line at rate × elapsed, for every tempo of the dial', () =>
    Effect.gen(function* () {
      const first = timelineOf(100).first;
      for (const tempo of TEMPI) {
        using app = yield* composed(false, tempo);
        app.send(Command.Start({ track: morning }));
        const start = placeOf(yield* app.until(Player.$is('Playing'), 2000));
        expect(start).toBeGreaterThanOrEqual(first);
        expect(start - first).toBeLessThanOrEqual(POLL);
        yield* app.run(10_000);
        const moved = placeOf(app.state()) - start;
        expect(Math.abs(moved - (10_000 * tempo) / 100)).toBeLessThanOrEqual(POLL);
        expect(app.device.played).toEqual([]);
      }
    }),
  );

  it.effect('a tempo turned mid-play moves on from the place as it stands, with no jump', () =>
    Effect.gen(function* () {
      using app = yield* composed(false, 80);
      app.send(Command.Start({ track: morning }));
      const start = placeOf(yield* app.until(Player.$is('Playing'), 2000));
      yield* app.run(5000);
      const atTurn = placeOf(app.state());
      expect(Math.abs(atTurn - start - 4000)).toBeLessThanOrEqual(POLL);
      app.setTempo(120);
      yield* settle;
      yield* app.run(5000);
      expect(Math.abs(placeOf(app.state()) - atTurn - 6000)).toBeLessThanOrEqual(POLL);
    }),
  );

  it.effect('a Sound switch off mid-play runs on from the device place at the tempo', () =>
    Effect.gen(function* () {
      using app = yield* composed(true, 50);
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Loading'), 0);
      app.device.now = { state: 'playing', positionMs: 20_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'), 2000);
      yield* SubscriptionRef.set(app.sound, false);
      yield* settle;
      yield* app.run(POLL);
      const handed = placeOf(app.state());
      yield* app.run(10_000);
      expect(Math.abs(placeOf(app.state()) - handed - 5000)).toBeLessThanOrEqual(POLL);
    }),
  );
});

describe('the player at a tempo, Sound on (the control)', () => {
  it.effect('plays the recording, and the place is the device place', () =>
    Effect.gen(function* () {
      using app = yield* composed(true, 80);
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Loading'), 0);
      app.device.now = { state: 'playing', positionMs: 30_000, durationMs: 151_000 };
      const shown = yield* app.until(Player.$is('Playing'), 2000);
      expect(placeOf(shown)).toBe(30_000);
      expect(app.device.played).toEqual([audioUrl(100)]);
    }),
  );
});
