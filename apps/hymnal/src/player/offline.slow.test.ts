import {
  Clock,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Predicate,
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
import { cachedPlayback, localOver, localOn, savingOn } from './offline';
import { downloadsOn } from '~/offline/live';
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
  const control = { failLocal: false, failKey: false, failRemote: false, played: Effect.void };
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
        yield* control.played;
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
const starting = Predicate.or(Predicate.isTagged('Loading'), Predicate.isTagged('Playing'));

it.effect('offline a session play rejection keeps an intact saved recording', () => {
  const f = fake(),
    d = device(),
    id = { number: 100, offset: 2 };
  return Effect.gen(function* () {
    const cache = yield* Offline;
    yield* cache.enqueue(id);
    yield* idle(cache);
    d.control.failLocal = true;
    const api = localOver(d.api, cache);
    expect(
      Exit.isFailure(
        yield* Effect.exit(
          api.play(audioUrl(100, 2), 32000, { recording: id, ready: false, continuous: false }),
        ),
      ),
    ).toBe(true);
    expect((yield* cache.snapshot).saved).toBe(1);
    expect(d.calls.map((c) => c.uri)).toEqual(['file:///synthetic/100_2']);
    d.control.failLocal = false;
    yield* api.play(audioUrl(100, 2), 32000, { recording: id, ready: false, continuous: false });
    expect(d.calls.map((c) => c.uri)).toEqual([
      'file:///synthetic/100_2',
      'file:///synthetic/100_2',
    ]);
    // The platform read boundary also validates media bytes, not just size.
    const bytes = f.files.get('100_2');
    if (bytes) bytes[0] = 0;
    yield* api.play(audioUrl(100, 2), 32000, { recording: id, ready: false, continuous: false });
    expect(d.calls.at(-1)?.uri).toBe(audioUrl(100, 2));
    expect((yield* cache.snapshot).saved).toBe(0);
  }).pipe(Effect.provide(f.layer));
});

it.effect('offline a hung storage index cannot delay public Start', () => {
  const f = fake(),
    d = device();
  f.control.listing = Effect.never;
  return Effect.gen(function* () {
    const called = yield* Deferred.make<boolean>();
    d.control.played = Deferred.succeed(called, true).pipe(Effect.asVoid);
    const sound = yield* SubscriptionRef.make(true);
    const player = playerOn(
      cachedPlayback(Layer.succeed(Playback, d.api), () => Option.some(timeline), sound, f.layer),
      250,
    );
    const registry = yield* Effect.acquireRelease(
      Effect.sync(() => AtomRegistry.make()),
      (r) => Effect.sync(() => r.dispose()),
    );
    registry.mount(player.send);
    registry.set(player.send, Command.Start({ track: { number: 100, title: 'Hymn 100' } }));
    yield* Deferred.await(called);
    expect(d.calls.map((c) => c.uri)).toEqual([audioUrl(100)]);
  }).pipe(Effect.scoped);
});

it.effect('offline live playback and Downloads share exactly one queue in their registry', () => {
  const f = fake(),
    d = device();
  return Effect.gen(function* () {
    const sound = yield* SubscriptionRef.make(true);
    const player = playerOn(
      cachedPlayback(Layer.succeed(Playback, d.api), () => Option.some(timeline), sound, f.layer),
      250,
    );
    const downloads = downloadsOn(f.layer);
    const registry = yield* Effect.acquireRelease(
      Effect.sync(() => AtomRegistry.make()),
      (r) => Effect.sync(() => r.dispose()),
    );
    registry.mount(downloads.progress);
    registry.mount(player.send);
    registry.set(player.send, Command.Start({ track: { number: 100, title: 'Hymn 100' } }));
    yield* AtomRegistry.toStreamResult(registry, downloads.progress).pipe(
      Stream.filter((s) => s.saved === 1),
      Stream.take(1),
      Stream.runDrain,
    );
    expect(f.control.lists).toBe(1);
    expect(f.calls.length).toBe(1);
  }).pipe(Effect.scoped);
});

for (const continuous of [true, false])
  it.effect(`offline pending lookup keeps pause and resume time continuous=${continuous}`, () => {
    const f = fake();
    return Effect.gen(function* () {
      const cache = yield* Offline,
        d = device();
      const entered = yield* Deferred.make<boolean>(),
        release = yield* Deferred.make<Option.Option<string>>();
      const held = {
        ...cache,
        local: () => Deferred.succeed(entered, true).pipe(Effect.andThen(Deferred.await(release))),
      };
      const api = localOver(d.api, held);
      const pending = yield* api
        .play(audioUrl(100, 2), 32000, {
          recording: { number: 100, offset: 2 },
          continuous,
          ready: true,
          intent: 'play',
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* TestClock.adjust(1000);
      yield* api.pause;
      yield* TestClock.adjust(2000);
      yield* api.resume;
      yield* TestClock.adjust(500);
      yield* Deferred.succeed(release, Option.none());
      yield* Fiber.join(pending);
      let expected = 32000;
      if (continuous) expected = 33500;
      expect(d.calls.at(-1)?.at).toBe(expected);
    }).pipe(Effect.provide(f.layer), Effect.scoped);
  });

it.effect('offline local read failure retries remote at the provider retained position', () => {
  const f = fake();
  return Effect.gen(function* () {
    const cache = yield* Offline,
      d = device(),
      id = { number: 100, offset: 2 };
    yield* cache.enqueue(id);
    yield* idle(cache);
    const failed: PlaybackApi = {
      ...d.api,
      play: (uri, at, options) => {
        if (uri.startsWith('file:')) {
          f.control.readFails = true;
          return PlaybackError.make({ operation: 'play', message: 'synthetic', positionMs: 57000 });
        }
        return d.api.play(uri, at, options);
      },
    };
    yield* localOver(failed, cache).play(audioUrl(100, 2), 32000, {
      recording: id,
      continuous: true,
      ready: true,
      intent: 'play',
    });
    expect(d.calls.at(-1)?.at).toBe(57000);
  }).pipe(Effect.provide(f.layer));
});

it.effect('offline Pause during a failed local prepare stays paused on the remote retry', () => {
  const f = fake();
  return Effect.gen(function* () {
    const cache = yield* Offline,
      d = device(),
      id = { number: 100, offset: 2 };
    yield* cache.enqueue(id);
    yield* idle(cache);
    const entered = yield* Deferred.make<boolean>(),
      reply = yield* Deferred.make<Status, PlaybackError>();
    const intents: string[] = [];
    const delayed: PlaybackApi = {
      ...d.api,
      play: (uri, at, options) => {
        if (uri.startsWith('file:'))
          return Deferred.succeed(entered, true).pipe(Effect.andThen(Deferred.await(reply)));
        intents.push(options?.intent ?? 'play');
        return d.api.play(uri, at, options);
      },
    };
    const api = localOver(delayed, cache);
    const pending = yield* api
      .play(audioUrl(100, 2), 32000, {
        recording: id,
        continuous: true,
        ready: true,
        intent: 'play',
      })
      .pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    yield* api.pause;
    f.control.readFails = true;
    yield* Deferred.fail(
      reply,
      PlaybackError.make({ operation: 'play', message: 'synthetic', positionMs: 32000 }),
    );
    yield* Fiber.join(pending);
    expect(intents).toEqual(['pause']);
  }).pipe(Effect.provide(f.layer), Effect.scoped);
});

it.effect('offline a former invalidation cannot start remote after a newer Play', () => {
  const f = fake();
  return Effect.gen(function* () {
    const cache = yield* Offline,
      d = device(),
      id = { number: 100, offset: 2 };
    yield* cache.enqueue(id);
    yield* idle(cache);
    const entered = yield* Deferred.make<boolean>(),
      release = yield* Deferred.make<boolean>();
    const delayed = {
      ...cache,
      local: (selected: { number: number; offset: number }) => {
        if (selected.number !== 100 || !f.control.readFails) return cache.local(selected);
        return Deferred.succeed(entered, true).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as(Option.none<string>()),
        );
      },
    };
    const failed: PlaybackApi = {
      ...d.api,
      play: (uri, at, options) => {
        if (uri.startsWith('file:')) {
          f.control.readFails = true;
          return PlaybackError.make({ operation: 'play', message: 'synthetic' });
        }
        return d.api.play(uri, at, options);
      },
    };
    const api = localOver(failed, delayed);
    const pending = yield* api
      .play(audioUrl(100, 2), 32000, { recording: id, continuous: true, ready: true })
      .pipe(Effect.exit, Effect.forkChild);
    yield* Deferred.await(entered);
    yield* api.play(audioUrl(3), 0, {
      recording: { number: 3, offset: 0 },
      continuous: false,
      ready: false,
    });
    yield* Deferred.succeed(release, true);
    expect(Exit.isFailure(yield* Fiber.join(pending))).toBe(true);
    expect(d.calls.map((c) => c.number)).toEqual([3]);
  }).pipe(Effect.provide(f.layer), Effect.scoped);
});

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
    yield* AtomRegistry.toStream(registry, player.state).pipe(
      Stream.filter((s) => s._tag === 'Failed'),
      Stream.take(1),
      Stream.runDrain,
    );
    expect(registry.get(player.state)._tag).toBe('Failed');
    expect(d.calls.map((c) => c.uri)).toEqual([audioUrl(100)]);
    d.control.failRemote = false;
    f.control.networkFails = false;
    const retried = yield* Deferred.make<boolean>();
    d.control.played = Deferred.succeed(retried, true).pipe(Effect.asVoid);
    registry.set(player.send, Command.Resume());
    yield* Deferred.await(retried);
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
      expect((yield* cache.snapshot).saved).toBe(1);
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
      yield* AtomRegistry.toStream(registry, player.state).pipe(
        Stream.filter(starting),
        Stream.take(1),
        Stream.runDrain,
      );
      yield* clock.adjust(250);
      yield* clock.adjust(250);
      yield* AtomRegistry.toStream(registry, player.state).pipe(
        Stream.filter(starting),
        Stream.take(1),
        Stream.runDrain,
      );
      expect(['Loading', 'Playing'].includes(registry.get(player.state)._tag)).toBe(true);
      expect(d.calls.length).toBe(0);
      registry.set(moves(100), { transpose: 2, capo: 11 });
      yield* AtomRegistry.toStream(registry, moves(100)).pipe(
        Stream.filter((m) => m.capo === 11),
        Stream.take(1),
        Stream.runDrain,
      );
      expect(f.calls.length).toBe(1);
      expect(f.calls[0]?.id).toEqual({ number: 100, offset: 2 });
      yield* Deferred.succeed(release, true);
    }).pipe(Effect.scoped),
);
