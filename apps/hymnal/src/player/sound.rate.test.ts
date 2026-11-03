/**
 * The player at a hymn's tempo with Sound on (unit `recrate`, acceptance
 * A2): the recording plays at the held hymn's tempo, for every tempo the
 * Tempo dial offers, and the place the player shows moves with it; a tempo
 * turned mid-play reaches the device and moves on from where the place
 * stands; a Sound switch off and on keeps the tempo turned last; the silent
 * tail past the recording's end runs at the tempo; and the statuses name the
 * rate. Nothing sounds: the device is the test's fake, which moves its place
 * at the rate it was told (a play's `rate`, else 1, then each `setRate`) on
 * the TestClock, and whose statuses name no rate, as One's do.
 *
 * Final path: `apps/hymnal/src/player/sound.rate.test.ts`.
 */

import { Clock, Effect, Layer, Match, Option, References, Stream, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import bundled from 'virtual:hymnal-timing';

import { still } from '~/hymns/chords';
import { audioUrl } from '~/remote';

import { type Timeline, timingBook } from '../follow/timeline';
import {
  Command,
  Playback,
  type PlaybackApi,
  Player,
  playerOn,
  type Status,
  statusEvery,
} from './player';
import { scoreClock, soundOn } from './sound';

const book = timingBook(bundled);

/** One poll of the player (`statusEvery`), ms. */
const POLL = 250;
/** Every detent of the Tempo dial, in percent. */
const TEMPI = Array.from({ length: 21 }, (_, i) => 50 + 5 * i);
/** Hymn 100's recording is longer than any run here at any tempo, ms. */
const LONG = 600_000;

const morning = { number: 100, title: 'Hymn 100' };
/** Every hymn as printed: no transpose, no capo. */
const printed = Atom.make(still);

/**
 * A hymn whose recording plays its first two lines and leaves the last two
 * unplayed: 8 s of recording, then 12 s of silent stanzas to the timeline's end.
 */
const unplayedTail: Timeline = {
  tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
  lines: [
    [0, 4000],
    [4000, 8000],
    [8000, 14_000],
    [14_000, 20_000],
  ].map(([start = 0, until = 0], k) => ({
    start,
    until,
    played: k < 2,
    even: k % 2 === 1,
    syllables: [start],
    words: [start],
  })),
  first: 0,
  end: 20_000,
};

/**
 * A device holding a recording `length` ms long whose place moves at the rate
 * it was told, and each rate it took, in order (`rates`), with each play.
 */
const rated = (length: number) => {
  const asked = {
    plays: new Array<{ readonly uri: string; readonly fromMs: number; readonly rate: number }>(),
    rates: new Array<number>(),
  };
  let state: Status['state'] = 'idle';
  let at = 0;
  let since = 0;
  let rate = 1;
  const read = Effect.map(Clock.currentTimeMillis, (now): Status => {
    if (state === 'playing') at = Math.min(length, at + (now - since) * rate);
    since = now;
    if (state === 'playing' && at >= length) state = 'ended';
    return { state, positionMs: at, durationMs: length };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  const device: PlaybackApi = {
    play: (uri, fromMs, options) =>
      then(() => {
        rate = options?.rate ?? 1;
        asked.plays.push({ uri, fromMs, rate });
        asked.rates.push(rate);
        at = fromMs;
        state = 'playing';
      }),
    pause: then(() => {
      state = 'paused';
    }),
    resume: then(() => {
      if (state === 'ended') at = 0;
      state = 'playing';
    }),
    seek: (ms) =>
      then(() => {
        at = ms;
      }),
    status: read,
    setRate: (to) =>
      Effect.asVoid(
        then(() => {
          rate = to;
          asked.rates.push(to);
        }),
      ),
    stop: Effect.asVoid(
      then(() => {
        state = 'idle';
      }),
    ),
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.empty,
  };
  return { device, asked };
};

/** Let the player's fibers run what the clock's last move woke. */
const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
  discard: true,
});

/** The place the player shows, ms, while it plays. */
const placeOf = (player: Player) =>
  Option.getOrThrow(Option.liftPredicate(player, Player.$is('Playing'))).at * 1000;

/**
 * The app's player as `LivePlayer.tsx` builds it, over the score clock over
 * the rate-keeping device, Sound on, with hymn 100's tempo held in `tempo`
 * (percent) and every other hymn at 100.
 */
const composed = (initial: number) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const fake = rated(LONG);
    const sound = yield* SubscriptionRef.make(true);
    const tempo = Atom.make(initial).pipe(Atom.keepAlive);
    const other = Atom.make(100).pipe(Atom.keepAlive);
    const player = playerOn(
      Layer.mergeAll(
        soundOn(Layer.succeed(Playback, fake.device), book.of, sound).pipe(
          Layer.provide(clockLayer),
        ),
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
      asked: fake.asked,
      sound,
      state,
      /** The rate the screens show the place moving at (`player.rate`). */
      rate: () => registry.get(player.rate),
      setTempo: (percent: number) => registry.set(tempo, percent),
      send: (command: Command) => registry.set(player.send, command),
      /** Move the clock on `ms`, a poll at a time. */
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

describe('the player at a tempo, Sound on', () => {
  it.effect('plays the recording at rate × elapsed, for every tempo of the dial', () =>
    Effect.gen(function* () {
      for (const tempo of TEMPI) {
        using app = yield* composed(tempo);
        app.send(Command.Start({ track: morning }));
        const start = placeOf(yield* app.until(Player.$is('Playing'), 2000));
        yield* app.run(10_000);
        const moved = placeOf(app.state()) - start;
        expect(Math.abs(moved - (10_000 * tempo) / 100)).toBeLessThanOrEqual(POLL);
        expect(app.asked.plays.map((play) => [play.uri, play.rate])).toEqual([
          [audioUrl(100), tempo / 100],
        ]);
      }
    }),
  );

  it.effect('shows the place moving at the tempo (`rate` 0.8 at 80 %)', () =>
    Effect.gen(function* () {
      using app = yield* composed(80);
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Playing'), 2000);
      yield* app.run(POLL);
      expect(app.rate()).toBe(0.8);
    }),
  );

  it.effect('a tempo turned mid-play reaches the device and moves on with no jump', () =>
    Effect.gen(function* () {
      using app = yield* composed(80);
      app.send(Command.Start({ track: morning }));
      const start = placeOf(yield* app.until(Player.$is('Playing'), 2000));
      yield* app.run(5000);
      const atTurn = placeOf(app.state());
      expect(Math.abs(atTurn - start - 4000)).toBeLessThanOrEqual(POLL);
      app.setTempo(120);
      yield* settle;
      expect(app.asked.rates.at(-1)).toBe(1.2);
      expect(app.asked.plays).toHaveLength(1);
      yield* app.run(5000);
      expect(Math.abs(placeOf(app.state()) - atTurn - 6000)).toBeLessThanOrEqual(POLL);
      expect(app.rate()).toBe(1.2);
    }),
  );

  it.effect('a Sound switch off and on keeps the tempo turned last', () =>
    Effect.gen(function* () {
      using app = yield* composed(80);
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Playing'), 2000);
      yield* app.run(2000);
      app.setTempo(120);
      yield* settle;
      yield* SubscriptionRef.set(app.sound, false);
      yield* settle;
      yield* app.run(2000);
      yield* SubscriptionRef.set(app.sound, true);
      yield* settle;
      yield* app.run(POLL);
      const handed = placeOf(app.state());
      expect(app.asked.plays.at(-1)?.rate).toBe(1.2);
      yield* app.run(5000);
      expect(Math.abs(placeOf(app.state()) - handed - 6000)).toBeLessThanOrEqual(POLL);
      expect(app.rate()).toBe(1.2);
    }),
  );
});

describe('the score clock at a tempo, Sound on', () => {
  it.effect('names the rate in its statuses, the place moving at it', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { device, asked } = rated(LONG);
        const sound = yield* SubscriptionRef.make(true);
        const api = yield* scoreClock(device, book.of, sound);
        yield* api.play(audioUrl(100), 0, { continuous: false, ready: false, rate: 0.8 });
        expect(asked.plays.map((play) => play.rate)).toEqual([0.8]);
        yield* TestClock.adjust(1000);
        const status = yield* api.status;
        expect(status.positionMs).toBe(800);
        expect(status.rate).toBe(0.8);
      }),
    ),
  );

  it.effect('runs the silent tail past the recording’s end at the tempo', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const timeline = unplayedTail;
        const { device } = rated(8000);
        const sound = yield* SubscriptionRef.make(true);
        const api = yield* scoreClock(
          device,
          (hymn) => Option.liftPredicate(timeline, () => hymn === 100),
          sound,
        );
        yield* api.play(audioUrl(100), 0, { continuous: false, ready: false, rate: 0.5 });
        for (let t = 0; t < 20_000; t += POLL) {
          yield* TestClock.adjust(POLL);
          yield* api.status;
        }
        expect((yield* device.status).state).toBe('ended');
        const past = yield* api.status;
        expect(past.state).toBe('playing');
        expect(Math.abs(past.positionMs - 10_000)).toBeLessThanOrEqual(POLL);
        expect(past.rate).toBe(0.5);
      }),
    ),
  );
});
