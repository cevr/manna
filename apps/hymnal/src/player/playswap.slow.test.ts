import { expect, it } from 'effect-bun-test';
import { Clock, Deferred, Effect, Layer, Option, References, Stream } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';

import { audioUrl } from '~/remote';
import type { Move } from '~/hymns/chords';

import { Command, Playback, Player, playerOn, type Status } from './player';

const first = { number: 100, title: 'Hymn 100' };
const second = { number: 3, title: 'Hymn 3' };
const settle = Effect.forEach(Array.from({ length: 40 }), () => Effect.yieldNow);
const ownedRegistry = () => {
  const registry = AtomRegistry.make();
  return { registry, [Symbol.dispose]: () => registry.dispose() };
};

for (const state of ['playing', 'paused', 'ended', 'failed', 'idle'] as const)
  it.effect(`playswap ignores an old ${state} status even when Starts share a millisecond`, () =>
    Effect.gen(function* () {
      const clock = yield* TestClock.testClockWith(Effect.succeed);
      const reply = yield* Deferred.make<Status>();
      const reading = yield* Deferred.make<boolean>();
      const replied = yield* Deferred.make<boolean>();
      const plays: Array<{ uri: string; from: number }> = [];
      const announced: string[] = [];
      let now: Status = { state: 'idle', positionMs: 0 };
      let old = true;
      const moves = Atom.family(() => Atom.make<Move>({ transpose: 0, capo: 0 }));
      const device = Playback.of({
        play: (uri, from) =>
          Effect.sync(() => {
            plays.push({ uri, from });
            now = { state: 'playing', positionMs: from, durationMs: 120_000 };
            return now;
          }),
        status: Effect.suspend(() => {
          if (!old) return Effect.succeed(now);
          old = false;
          return Deferred.succeed(reading, true).pipe(
            Effect.andThen(Deferred.await(reply)),
            Effect.tap(() => Deferred.succeed(replied, true)),
          );
        }),
        pause: Effect.sync(() => (now = { ...now, state: 'paused' })),
        resume: Effect.sync(() => (now = { ...now, state: 'playing' })),
        seek: (positionMs) => Effect.sync(() => (now = { ...now, positionMs })),
        stop: Effect.void,
        connection: Stream.make(true),
        remote: Stream.empty,
        announce: ({ artist }) => Effect.sync(() => void announced.push(artist)),
      });
      const player = playerOn(
        Layer.mergeAll(
          Layer.succeed(Playback, device),
          Layer.succeed(Clock.Clock, clock),
          Layer.succeed(References.MinimumLogLevel, 'None'),
        ),
        250,
        moves,
      );
      using owner = ownedRegistry();
      const { registry } = owner;
      registry.mount(player.send);
      registry.mount(player.keys);
      registry.set(moves(3), { transpose: 2, capo: 7 });
      registry.set(player.send, Command.Start({ track: first }));
      yield* Deferred.await(reading);
      registry.set(player.send, Command.Start({ track: second }));
      yield* settle;
      yield* Deferred.succeed(reply, { state, positionMs: 90_000, durationMs: 240_000 });
      yield* Deferred.await(replied);
      yield* settle;
      // Neither identity, time, terminal state nor follow may come from hymn 100.
      const shown = registry.get(player.state);
      expect(shown._tag).toBe('Loading');
      expect(Player.$is('Loading')(shown) && shown.track.number).toBe(3);
      expect(plays).toEqual([
        { uri: audioUrl(100), from: 0 },
        { uri: audioUrl(3, 2), from: 0 },
      ]);
      expect(announced).toEqual(['Hymn 3']);
      now = { ...now, positionMs: 250 };
      yield* TestClock.adjust(250);
      yield* settle;
      expect(registry.get(player.state)).toEqual(
        Player.Playing({
          track: second,
          at: 0.25,
          length: Option.some(120),
        }),
      );
    }),
  );
