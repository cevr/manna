import {
  Clock,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect';
import { TestClock } from 'effect/testing';
import { expect, it } from 'effect-bun-test';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { Offline } from '~/offline/cache';
import { fake } from '~/offline/fixture';
import { audioUrl } from '~/remote';
import { localOver, localOn, savingOn } from './offline';
import {
  Command,
  Playback,
  PlaybackError,
  playerOn,
  type PlaybackApi,
  type Status,
} from './player';
import { recordingsOver, recordingsOn } from './recording';
import { scoreClock, soundOn } from './sound';

const idle = (cache: typeof Offline.Service) =>
  cache.changes.pipe(
    Stream.filter((s) => s.active + s.queued === 0),
    Stream.take(1),
    Stream.runDrain,
  );
const device = () => {
  const calls: { uri: string; at: number; number: number; offset: number }[] = [];
  const control = { failLocal: false, failKey: false, failRemote: false };
  const status: Status = { state: 'playing', positionMs: 32000, durationMs: 120000 };
  const api: PlaybackApi = {
    play: (uri, at, options) =>
      Effect.gen(function* () {
        calls.push({
          uri,
          at,
          number: options?.recording?.number ?? 0,
          offset: options?.recording?.offset ?? 0,
        });
        if (
          (control.failLocal && uri.startsWith('file:')) ||
          (control.failKey && options?.recording?.offset !== 0) ||
          (control.failRemote && uri.startsWith('https:'))
        )
          return yield* PlaybackError.make({ operation: 'play', message: 'synthetic unavailable' });
        return { ...status, positionMs: at };
      }),
    status: Effect.suspend(() => {
      if (control.failRemote) return Effect.succeed({ ...status, state: 'failed' });
      return Effect.succeed(status);
    }),
    pause: Effect.succeed({ ...status, state: 'paused' }),
    resume: Effect.succeed(status),
    seek: (at) => Effect.succeed({ ...status, positionMs: at }),
    stop: Effect.void,
    connection: Stream.make(true),
    remote: Stream.empty,
    announce: () => Effect.void,
  };
  return { api, calls, control };
};
const timeline = { first: 5000, end: 240000, lines: [] };

it.effect('offline missing media keeps the public player failure and retry path', () =>
  Effect.gen(function* () {
    const f = fake(),
      d = device();
    f.control.networkFails = true;
    d.control.failRemote = true;
    const on = yield* SubscriptionRef.make(true);
    const layer = savingOn(
      soundOn(
        recordingsOn(localOn(Layer.succeed(Playback, d.api)).pipe(Layer.provide(f.layer))),
        () => Option.some(timeline),
        on,
      ),
    ).pipe(Layer.provide(f.layer));
    const player = playerOn(layer, 250);
    const registry = yield* Effect.acquireRelease(
      Effect.sync(() => AtomRegistry.make()),
      (r) => Effect.sync(() => r.dispose()),
    );
    registry.mount(player.send);
    registry.set(player.send, Command.Start({ track: { number: 100, title: 'Hymn 100' } }));
    for (let n = 0; n < 40; n++) yield* Effect.yieldNow;
    expect(registry.get(player.state)._tag).toBe('Failed');
    expect(d.calls.map((c) => c.uri)).toEqual([audioUrl(100)]);
    d.control.failRemote = false;
    f.control.networkFails = false;
    registry.set(player.send, Command.Resume());
    for (let n = 0; n < 40; n++) yield* Effect.yieldNow;
    expect(d.calls.map((c) => c.uri)).toEqual([audioUrl(100), audioUrl(100)]);
  }).pipe(Effect.scoped),
);

it.effect(
  'offline real score clock selects local key files and keeps explicit identity and place',
  () => {
    const f = fake();
    return Effect.gen(function* () {
      const cache = yield* Offline;
      const d = device();
      const sound = yield* SubscriptionRef.make(true);
      const id = { number: 100, offset: 2 };
      yield* cache.enqueue(id);
      yield* idle(cache);
      const clock = yield* scoreClock(
        recordingsOver(localOver(d.api, cache)),
        () => Option.some(timeline),
        sound,
      );
      const before = f.calls.length;
      const status = yield* clock.play(audioUrl(100, 2), 32000, {
        recording: id,
        intent: 'pause',
        ready: true,
        continuous: false,
      });
      expect(d.calls).toEqual([
        { uri: 'file:///synthetic/100_2', at: 32000, number: 100, offset: 2 },
      ]);
      expect(f.calls.length).toBe(before);
      expect(status.recording?.number).toBe(100);
      d.control.failLocal = true;
      yield* clock.play(audioUrl(100, 2), 35000, {
        recording: id,
        ready: false,
        continuous: false,
      });
      expect(d.calls.slice(-2).map((c) => c.uri)).toEqual([
        'file:///synthetic/100_2',
        audioUrl(100, 2),
      ]);
      expect(Option.isNone(yield* cache.local(id))).toBe(true);
    }).pipe(Effect.provide(f.layer), Effect.scoped);
  },
);

it.effect(
  'offline fallback uses the printed-key local identity instead of the failed chosen key',
  () => {
    const f = fake();
    return Effect.gen(function* () {
      const cache = yield* Offline;
      const d = device();
      d.control.failKey = true;
      yield* cache.enqueue({ number: 100, offset: 0 });
      yield* idle(cache);
      const api = recordingsOver(localOver(d.api, cache));
      const status = yield* api.play(audioUrl(100, 3), 45000, {
        recording: { number: 100, offset: 3 },
        ready: false,
        continuous: false,
      });
      expect(d.calls.map((c) => [c.uri, c.offset, c.at])).toEqual([
        [audioUrl(100, 3), 3, 45000],
        ['file:///synthetic/100_0', 0, 45000],
      ]);
      expect(status.recording).toEqual({ number: 100, requested: 3, effective: 0 });
    }).pipe(Effect.provide(f.layer));
  },
);

it.effect('offline an interrupted local lookup cannot start after a newer play', () => {
  const f = fake();
  return Effect.gen(function* () {
    const cache = yield* Offline;
    const d = device();
    const entered = yield* Deferred.make<boolean>(),
      release = yield* Deferred.make<Option.Option<string>>();
    const held = {
      ...cache,
      local: (id: { number: number; offset: number }) => {
        if (id.number === 100)
          return Deferred.succeed(entered, true).pipe(Effect.andThen(Deferred.await(release)));
        return cache.local(id);
      },
    };
    const api = localOver(d.api, held);
    const first = yield* api
      .play(audioUrl(100), 0, {
        recording: { number: 100, offset: 0 },
        ready: false,
        continuous: false,
      })
      .pipe(Effect.exit, Effect.forkChild);
    yield* Deferred.await(entered);
    yield* api.play(audioUrl(3), 0, {
      recording: { number: 3, offset: 0 },
      ready: false,
      continuous: false,
    });
    yield* Deferred.succeed(release, Option.some('file:///synthetic/100_0'));
    expect(Exit.isFailure(yield* Fiber.join(first))).toBe(true);
    expect(d.calls.map((c) => c.number)).toEqual([3]);
  }).pipe(Effect.provide(f.layer));
});

it.effect(
  'offline public player saves with sound off without waiting on HTTP; capo changes no identity',
  () =>
    Effect.gen(function* () {
      const f = fake();
      const d = device();
      const reached = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      f.control.before = () =>
        Deferred.succeed(reached, true).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.asVoid,
        );
      const on = yield* SubscriptionRef.make(false);
      const clock = yield* TestClock.testClockWith(Effect.succeed);
      const moves = Atom.family(() => Atom.make({ transpose: 2, capo: 0 }));
      const layer = savingOn(
        soundOn(
          recordingsOn(localOn(Layer.succeed(Playback, d.api)).pipe(Layer.provide(f.layer))),
          () => Option.some(timeline),
          on,
        ),
      ).pipe(Layer.provide(f.layer));
      const player = playerOn(
        layer.pipe(Layer.provideMerge(Layer.succeed(Clock.Clock, clock))),
        250,
        moves,
      );
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => AtomRegistry.make()),
        (r) => Effect.sync(() => r.dispose()),
      );
      registry.mount(player.send);
      registry.mount(player.keys);
      registry.set(player.send, Command.Start({ track: { number: 100, title: 'Hymn 100' } }));
      yield* Deferred.await(reached);
      for (let n = 0; n < 20; n++) yield* Effect.yieldNow;
      yield* clock.adjust(250);
      for (let n = 0; n < 20; n++) yield* Effect.yieldNow;
      yield* clock.adjust(250);
      for (let n = 0; n < 20; n++) yield* Effect.yieldNow;
      expect(registry.get(player.state)._tag).toBe('Playing');
      expect(d.calls.length).toBe(0);
      registry.set(moves(100), { transpose: 2, capo: 11 });
      for (let n = 0; n < 20; n++) yield* Effect.yieldNow;
      expect(f.calls.length).toBe(1);
      expect(f.calls[0]?.id).toEqual({ number: 100, offset: 2 });
      yield* Deferred.succeed(release, true);
    }).pipe(Effect.scoped),
);
