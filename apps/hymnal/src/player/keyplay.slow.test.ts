/* oxlint-disable effect/noNewPromise -- the fake replaces One's Promise-based device API and exposes each reply for controlled schedules. */
import { expect, it } from 'effect-bun-test';
import {
  Clock,
  Console,
  Effect,
  Fiber,
  Layer,
  Match,
  Option,
  References,
  SubscriptionRef,
} from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';

import { audioUrl } from '~/remote';
import { type Move } from '~/hymns/chords';

import { playbackOn, type Device } from './playback.live';
import { Command, Playback, Player, playerOn, type Status, statusEvery } from './player';
import { counted } from '../follow/seeks';
import { scoreClock, soundOn } from './sound';
import { recordingsOn } from './recording';
import type { Timeline } from '../follow/timeline';
import { followerOf } from '../follow/follower';
import { placeAt, timelineOf } from '../follow/timeline';
import { readTiming } from '../../vite/timing';
import { readPlaybackHymns } from '../../vite/chords';
import { sung, type Hymn } from '@manna/hymnal/hymn';

const groupSamples = (hymn: Hymn, timed: Timeline, minimum: number) => {
  const heard = sung(hymn);
  return timed.lines.flatMap((times, line) => {
    const part = heard[line]?.part;
    if (part?._tag !== 'Sung') return [];
    return times.syllables.flatMap((start, syllable) => {
      const count = part.lines[heard[line]?.line ?? 0]?.[syllable]?.notes ?? 0;
      const next = times.syllables[syllable + 1] ?? times.until;
      if (count < minimum || next <= start) return [];
      return [start + 1, (start + next) / 2, next - 1].map((at) => ({ at, line, syllable }));
    });
  });
};

for (const number of [388, 373, 214])
  it.effect(
    `followsync public player and scoreClock retain syllable groups for hymn ${number}`,
    () =>
      Effect.gen(function* () {
        const encoded = readTiming().find(([n]) => n === number)?.[1] ?? '';
        const timed = Option.getOrThrow(timelineOf(encoded));
        const hymn = Option.getOrThrow(
          Option.fromUndefinedOr(readPlaybackHymns().find((hymn) => hymn.number === number)),
        );
        using app = yield* open(false, timed.end, (n) =>
          Option.filter(Option.some(timed), () => n === number),
        );
        const track = { number, title: `Hymn ${number}` };
        app.send(Command.Start({ track }));
        yield* app.playing;
        let minimum = 2;
        if (number === 373) minimum = 1;
        const samples = groupSamples(hymn, timed, minimum);
        for (const { at, line, syllable } of samples) {
          app.send(Command.Seek({ seconds: at / 1000 }));
          yield* settle;
          const state = app.state();
          expect(state._tag).toBe('Playing');
          if (state._tag !== 'Playing') continue;
          const place = placeAt(timed, state.at * 1000);
          expect([place.line, place.syllable]).toEqual([line, syllable]);
        }
        expect(samples.length).toBeGreaterThan(0);
        // A live Key change changes recording identity, never the score place.
        const before = app.state();
        app.move(number, 1);
        yield* settle;
        expect(app.state()).toEqual(before);
        yield* app.tick();
        const after = app.state();
        if (before._tag === 'Playing' && after._tag === 'Playing')
          expect(after.at).toBe(before.at + 0.25);
        expect(app.calls.filter((call) => call.operation === 'play')).toEqual([]);
      }),
  );

it.effect('followsync shared-note groups stay simultaneous through public Start and Seek', () =>
  Effect.gen(function* () {
    const timed: Timeline = {
      first: 1000,
      end: 4000,
      lines: [
        {
          start: 1000,
          until: 4000,
          played: true,
          even: false,
          syllables: [1000, 1000, 2000],
          words: [0, 1, 2],
        },
      ],
    };
    using app = yield* open(false, 4000, () => Option.some(timed));
    app.send(Command.Start({ track }));
    yield* app.playing;
    for (const [at, syllable] of [
      [1000, 1],
      [1500, 1],
      [1999, 1],
      [2000, 2],
      [3999, 2],
    ] as const) {
      app.send(Command.Seek({ seconds: at / 1000 }));
      yield* settle;
      const state = app.state();
      expect(state._tag).toBe('Playing');
      if (state._tag === 'Playing') expect(placeAt(timed, state.at * 1000).syllable).toBe(syllable);
    }
    expect(app.calls.filter((call) => call.operation === 'play')).toEqual([]);
  }),
);

const track = { number: 100, title: 'Hymn 100' };
const other = { number: 3, title: 'Hymn 3' };
const timeline: Timeline = { first: 5000, end: 240_000, lines: [] };

// Flush the registry, Promise adapter and stream queues without advancing time.
const settle = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow);

const native = (clock: Clock.Clock, recorded = 240_000) => {
  let now: Status = { state: 'idle', positionMs: 0, durationMs: recorded };
  let since = clock.currentTimeMillisUnsafe();
  let id = 0;
  let hold = false;
  let holdStatus = false;
  let nextStatus = Option.none<Status>();
  let listener: Parameters<Device['audio']['watchRemoteCommands']>[0] = () => {};
  const statusWaiting: Array<() => void> = [];
  const calls: Array<{ operation: string; uri?: string; at: number; time: number }> = [];
  const pending: Array<{ release: (failed?: boolean) => void; result: () => Promise<Status> }> = [];
  const missing = new Set<string>();
  const read = (): Status => {
    let elapsed = 0;
    if (now.state === 'playing') elapsed = clock.currentTimeMillisUnsafe() - since;
    const positionMs = Math.min(recorded, now.positionMs + elapsed);
    if (now.state === 'playing' && positionMs >= recorded)
      return { ...now, state: 'ended', positionMs };
    return { ...now, positionMs };
  };
  const set = (next: Status) => {
    now = next;
    since = clock.currentTimeMillisUnsafe();
    return read();
  };
  const tell = (operation: string, at = read().positionMs, uri?: string) =>
    calls.push({ operation, at, uri, time: clock.currentTimeMillisUnsafe() });
  const device: Device = {
    audio: {
      play: (uri) => {
        const owner = ++id;
        tell('play', 0, uri);
        set({ state: 'loading', positionMs: 0, durationMs: recorded });
        const finish = (failed = false) => {
          if (owner === id)
            set({
              state: ((failed || missing.has(uri)) && 'failed') || 'playing',
              positionMs: 0,
              durationMs: recorded,
            });
          return read();
        };
        if (!hold) return Promise.resolve(finish());
        hold = false;
        const result: Promise<Status> = new Promise((resolve, reject) =>
          pending.push({
            release: (failed) => {
              if (failed && owner !== id) {
                reject('playback was replaced');
                return;
              }
              resolve(finish(failed));
            },
            result: () => result,
          }),
        );
        return result;
      },
      getPlaybackStatus: () => {
        if (Option.isSome(nextStatus)) {
          const captured = nextStatus.value;
          nextStatus = Option.none();
          return new Promise((resolve) => statusWaiting.push(() => resolve(captured)));
        }
        if (!holdStatus) return Promise.resolve(read());
        return new Promise((resolve) => statusWaiting.push(() => resolve(read())));
      },
      seek: (at) => {
        tell('seek', at);
        if (now.state === 'failed' || now.state === 'loading') return Promise.reject('not ready');
        return Promise.resolve(set({ ...read(), positionMs: at }));
      },
      pause: () => {
        tell('pause');
        return Promise.resolve(set({ ...read(), state: 'paused' }));
      },
      resume: () => {
        tell('resume');
        return Promise.resolve(set({ ...read(), state: 'playing' }));
      },
      stop: () => {
        ++id;
        tell('stop');
        set({ state: 'idle', positionMs: 0 });
        return Promise.resolve();
      },
      setNowPlayingInfo: () => {
        tell('announce');
        return Promise.resolve();
      },
      watchRemoteCommands: (receive) => {
        listener = receive;
        return () => {
          listener = () => {};
        };
      },
    },
    network: {
      getState: () => Promise.resolve({ isConnected: true } as never),
      addStateListener: () => ({ remove: () => {} }),
    },
  };
  return {
    device,
    calls,
    pending,
    missing,
    read,
    remote: (event: Parameters<typeof listener>[0]) => listener(event),
    holdStatus: (on: boolean) => {
      holdStatus = on;
      if (!on) for (const release of statusWaiting.splice(0)) release();
    },
    statusWaiting: () => statusWaiting.length,
    holdNextStatus: (status: Status) => {
      nextStatus = Option.some(status);
    },
    force: set,
    hold: () => {
      hold = true;
    },
  };
};

const open = (
  sound = true,
  recorded = 240_000,
  timelineFor: (number: number) => Option.Option<Timeline> = () => Option.some(timeline),
) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const fake = native(clock, recorded);
    const on = yield* SubscriptionRef.make(sound);
    const seeks = yield* SubscriptionRef.make(0);
    const moves = Atom.family(() =>
      Atom.make<Move>({ transpose: 0, capo: 0 }).pipe(Atom.keepAlive),
    );
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const playback = Layer.succeed(
      Playback,
      playbackOn(() => fake.device, Option.none()),
    );
    const player = playerOn(
      Layer.mergeAll(
        counted(soundOn(recordingsOn(playback), timelineFor, on), seeks).pipe(
          Layer.provide(clockLayer),
        ),
        clockLayer,
        Layer.succeed(References.MinimumLogLevel, 'None'),
      ),
      statusEvery,
      moves,
    );
    const registry = AtomRegistry.make();
    registry.mount(player.send);
    registry.mount(player.keys);
    registry.mount(player.remote);
    const tick = (ms = 250) => TestClock.adjust(ms).pipe(Effect.andThen(settle));
    const deviceReady = () => !sound || fake.read().state === 'playing';
    return {
      ...fake,
      player,
      registry,
      moves,
      seeks,
      sound: on,
      send: (command: Command) => registry.set(player.send, command),
      state: () => registry.get(player.state),
      move: (number: number, transpose: number, capo = 0) =>
        registry.set(moves(number), { transpose, capo }),
      tick,
      playing: Effect.gen(function* () {
        yield* settle;
        for (
          let i = 0;
          i < 8 && (!Player.$is('Playing')(registry.get(player.state)) || !deviceReady());
          i++
        )
          yield* tick();
        expect(registry.get(player.state)._tag).toBe('Playing');
      }),
      [Symbol.dispose]: () => registry.dispose(),
    };
  });

for (const pauseIntent of [false, true])
  it.effect(`keyplay readiness refusal holds sound until landing pauseIntent=${pauseIntent}`, () =>
    Effect.gen(function* () {
      const clock = yield* TestClock.testClockWith(Effect.succeed);
      const fake = native(clock);
      let ready = false;
      const order: string[] = [];
      const device: Device = {
        ...fake.device,
        audio: {
          ...fake.device.audio,
          // One's native Play answers Loading before its seek can land.
          play: (uri) => {
            order.push('play');
            return fake.device.audio
              .play(uri)
              .then(() => fake.force({ state: 'loading', positionMs: 0, durationMs: 240_000 }));
          },
          seek: (at) => {
            order.push('seek');
            if (!ready) return Promise.reject('not ready');
            return fake.device.audio.seek(at);
          },
          pause: () => {
            order.push('pause');
            return fake.device.audio.pause();
          },
          resume: () => {
            order.push('resume');
            return fake.device.audio.resume();
          },
        },
      };
      const playback = playbackOn(() => device, Option.none());
      const playing = yield* playback
        .play(audioUrl(100, 1), 20_000, {
          ready: true,
          continuous: true,
          recording: { number: 100, offset: 1 },
        })
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* settle;
      expect(order.slice(0, 3)).toEqual(['play', 'seek', 'pause']);
      yield* TestClock.adjust(400);
      yield* settle;
      if (pauseIntent) yield* playback.pause;
      expect(fake.read().state).toBe('paused');
      expect(order.filter((it) => it === 'resume')).toEqual([]);
      yield* TestClock.adjust(600);
      yield* settle;
      ready = true;
      yield* TestClock.adjust(100);
      yield* settle;
      const landed = yield* Fiber.join(playing);
      let target = 21_100;
      let state: Status['state'] = 'playing';
      if (pauseIntent) {
        target = 20_400;
        state = 'paused';
      }
      expect(fake.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(target);
      expect(landed.state).toBe(state);
      expect(order.filter((it) => it === 'resume').length).toBe(Number(!pauseIntent));
    }),
  );

it.effect('keyplay a ready source seeks immediately without a pause or resume', () =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const fake = native(clock);
    const playback = playbackOn(() => fake.device, Option.none());
    const landed = yield* playback.play(audioUrl(100, 1), 20_000, {
      ready: true,
      continuous: true,
      recording: { number: 100, offset: 1 },
    });
    expect(fake.calls.map((it) => it.operation)).toEqual(['play', 'seek']);
    expect(landed.positionMs).toBe(20_000);
    expect(landed.state).toBe('playing');
  }),
);

it.effect('keyplay a readiness-hold Pause error stays a provider error', () =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const fake = native(clock);
    const device: Device = {
      ...fake.device,
      audio: {
        ...fake.device.audio,
        seek: () => Promise.reject('not ready'),
        pause: () => Promise.reject('pause unavailable'),
      },
    };
    const playback = playbackOn(() => device, Option.none());
    const error = yield* Effect.flip(
      playback.play(audioUrl(100, 1), 20_000, {
        ready: true,
        continuous: true,
        recording: { number: 100, offset: 1 },
      }),
    );
    expect(error.operation).toBe('pause');
    expect(error.message).toBe('pause unavailable');
    expect(fake.calls.map((it) => it.operation)).toEqual(['play']);
  }),
);

it.effect('keyplay an obsolete readiness read cannot pause the newer recording', () =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const fake = native(clock);
    let release = () => {};
    let reading = false;
    const device: Device = {
      ...fake.device,
      audio: {
        ...fake.device.audio,
        seek: () => Promise.reject('not ready'),
        getPlaybackStatus: () =>
          new Promise((resolve) => {
            reading = true;
            release = () => resolve(fake.read());
          }),
      },
    };
    const playback = playbackOn(() => device, Option.none());
    const former = yield* playback
      .play(audioUrl(100, 1), 20_000, {
        ready: true,
        continuous: true,
        recording: { number: 100, offset: 1 },
      })
      .pipe(Effect.forkChild({ startImmediately: true }));
    yield* settle;
    expect(reading).toBe(true);
    yield* playback.play(audioUrl(100, 2), 0);
    release();
    yield* settle;
    const error = yield* Effect.flip(Fiber.join(former));
    expect(error.operation).toBe('superseded');
    expect(fake.calls.map((it) => it.operation)).toEqual(['play', 'play']);
    expect(fake.read().state).toBe('playing');
  }),
);

// The oracle is independent of the adapters: only an already moving clock
// keeps time during a hand-over. A chosen landing never consumes load time.
const origins = [
  'Playing',
  'Paused',
  'Loading probeA',
  'Buffering probeO',
  'after Seek',
  'Sound-off resume probeL',
  'silent-tail rewind probeM',
] as const;

const pausedLanding = (app: App, keyChange: boolean) =>
  Effect.gen(function* () {
    app.send(Command.Pause());
    yield* settle;
    const paused = app.state();
    expect(paused._tag).toBe('Paused');
    let target = 0;
    if (paused._tag === 'Paused') target = paused.at * 1000;
    yield* SubscriptionRef.set(app.sound, true);
    yield* settle;
    if (keyChange) app.move(100, 1);
    yield* settle;
    app.hold();
    app.send(Command.Resume());
    return target;
  });

const tailLanding = (app: App, keyChange: boolean) =>
  Effect.gen(function* () {
    yield* app.tick(61_000);
    if (keyChange) app.move(100, 1);
    yield* settle;
    app.hold();
    app.send(Command.Seek({ seconds: 40 }));
    return 40_000;
  });

const stalledLanding = (app: App, keyChange: boolean) =>
  Effect.gen(function* () {
    const target = app.read().positionMs;
    app.force({ ...app.read(), state: 'loading' });
    let ticks = 12;
    if (!keyChange) ticks = 68;
    for (let i = 0; i < ticks; i++) yield* app.tick();
    expect(app.state()._tag).toBe('Buffering');
    app.hold();
    if (keyChange) app.move(100, 1);
    else app.send(Command.Resume());
    return target;
  });

const soughtLanding = (app: App) =>
  Effect.gen(function* () {
    app.hold();
    app.move(100, 1);
    yield* settle;
    app.send(Command.Seek({ seconds: 40 }));
    return 40_000;
  });

const playingLanding = (app: App, keyChange: boolean) =>
  Effect.gen(function* () {
    const state = app.state();
    expect(state._tag).toBe('Playing');
    let target = 0;
    if (state._tag === 'Playing') target = state.at * 1000;
    app.hold();
    if (keyChange) app.move(100, 1);
    else yield* SubscriptionRef.set(app.sound, true);
    return target;
  });

const beginLanding = (app: App, origin: (typeof origins)[number], keyChange: boolean) =>
  Effect.gen(function* () {
    if (origin === 'Loading probeA' || (origin === 'after Seek' && !keyChange)) {
      if (origin === 'after Seek') app.move(100, 1);
      app.hold();
      app.send(Command.Start({ track }));
      yield* settle;
      expect(app.state()._tag).toBe('Loading');
      if (origin === 'after Seek') {
        app.send(Command.Seek({ seconds: 40 }));
        return 40_000;
      }
      if (keyChange) {
        app.hold();
        app.move(100, 1);
      }
      return 0;
    }
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(10_000);
    return yield* Match.value(origin).pipe(
      Match.when(Match.is('Paused', 'Sound-off resume probeL'), () =>
        pausedLanding(app, keyChange),
      ),
      Match.when('silent-tail rewind probeM', () => tailLanding(app, keyChange)),
      Match.when('Buffering probeO', () => stalledLanding(app, keyChange)),
      Match.when('after Seek', () => soughtLanding(app)),
      Match.orElse(() => playingLanding(app, keyChange)),
    );
  });

for (const origin of origins)
  for (const keyChange of [false, true])
    for (const loadMs of [0, 100, 1000, 1500])
      it.effect(`keyplay landing property ${origin} key=${keyChange} loadMs=${loadMs}`, () =>
        Effect.gen(function* () {
          const silent =
            (origin === 'Playing' && !keyChange) || origin === 'Sound-off resume probeL';
          let recorded = 240_000;
          if (origin === 'silent-tail rewind probeM') recorded = 60_000;
          using app = yield* open(!silent, recorded);
          // A paused native recording reloads without a Key change when
          // Play retries its missing chosen set. This is distinct from
          // resuming the silent score clock in probeL.
          if (origin === 'Paused' && !keyChange) {
            app.move(100, 1);
            app.missing.add(audioUrl(100, 1));
          }
          const target = yield* beginLanding(app, origin, keyChange);
          yield* settle;
          expect(app.pending.length).toBeGreaterThan(0);
          yield* app.tick(loadMs);
          app.pending.at(-1)?.release();
          yield* settle;
          let expected = target;
          if (origin === 'Playing') expected += loadMs;
          expect(app.read().positionMs).toBe(expected);
          const lastSeek = app.calls.filter((it) => it.operation === 'seek').at(-1);
          if (lastSeek) expect(lastSeek.at).toBe(expected);
        }),
      );

for (const origin of ['Loading probeA', 'after Seek', 'Sound-off resume probeL'] as const)
  it.effect(
    `keyplay fixed origin stays fixed after another Resume during preparation ${origin}`,
    () =>
      Effect.gen(function* () {
        using app = yield* open(origin !== 'Sound-off resume probeL');
        const target = yield* beginLanding(app, origin, true);
        yield* settle;
        expect(app.pending.length).toBeGreaterThan(0);
        app.send(Command.Resume());
        yield* settle;
        // The device still waits for its source; Resume expresses intent,
        // not evidence that music moved during the pending preparation.
        app.force({ state: 'loading', positionMs: 0, durationMs: 240_000 });
        yield* app.tick(1000);
        app.pending.at(-1)?.release();
        yield* settle;
        expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(target);
      }),
  );

it.effect('keyplay a moving origin resumes its clock after Pause during preparation probeC', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(10_000);
    const before = app.read().positionMs;
    app.hold();
    app.move(100, 3);
    yield* settle;
    app.send(Command.Pause());
    yield* settle;
    yield* app.tick(300);
    app.send(Command.Resume());
    yield* settle;
    yield* app.tick(400);
    app.pending.at(-1)?.release();
    yield* settle;
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(before + 400);
  }),
);

it.effect(
  'keyplay probeD probeN replacement reports keep follow forward and the hand pause held',
  () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      yield* app.tick(10_000);
      let now = 0;
      let timers: Array<{ at: number; run: () => void }> = [];
      const scrolled: number[] = [];
      const follower = followerOf(
        {
          first: 0,
          end: 30_000,
          lines: Array.from({ length: 30 }, (_, k) => ({
            start: k * 1000,
            until: (k + 1) * 1000,
            played: true,
            even: false,
            syllables: [k * 1000, k * 1000 + 500],
            words: [0, 1],
          })),
        },
        {
          now: () => now,
          wake: (ms, run) => {
            const timer = { at: now + ms, run };
            timers.push(timer);
            return () => {
              timers = timers.filter((it) => it !== timer);
            };
          },
          scrollTo: (line) => scrolled.push(line),
          log: () => {},
        },
      );
      const advance = (to: number) => {
        for (;;) {
          const due = timers.filter((it) => it.at <= to).toSorted((a, b) => a.at - b.at)[0];
          if (!due) break;
          timers = timers.filter((it) => it !== due);
          now = due.at;
          due.run();
        }
        now = to;
      };
      const report = (state: Player) => {
        if (state._tag === 'Playing')
          follower.report({ _tag: 'Here', state: 'playing', at: state.at * 1000 });
      };
      report(app.state());
      follower.drag();
      const scrollCount = scrolled.length;
      const unsubscribe = app.registry.subscribe(app.player.state, report);
      app.hold();
      app.move(100, 1);
      yield* settle;
      let last = -1;
      for (let k = 1; k <= 6; k++) {
        advance(k * 250);
        yield* app.tick();
        const state = app.state();
        expect(state._tag).toBe('Playing');
        if (state._tag === 'Playing') expect(state.at * 1000).toBe(10_250 + k * 250);
        const line = follower.marks.line();
        const mark = line * 2 + follower.marks.markOf(line);
        expect(mark).toBeGreaterThanOrEqual(last);
        last = mark;
        expect(follower.held.get()).toBe(true);
      }
      app.pending.at(-1)?.release();
      yield* settle;
      expect(follower.held.get()).toBe(true);
      expect(scrolled.length).toBe(scrollCount);
      unsubscribe();
      follower.stop();
    }),
);

for (const loadMs of [0, 1000])
  it.effect(
    `keyplay probeK7 a Seek during the key status read cannot lose the chosen set loadMs=${loadMs}`,
    () =>
      Effect.gen(function* () {
        using app = yield* open();
        app.send(Command.Start({ track }));
        yield* app.playing;
        yield* app.tick(10_000);
        app.holdStatus(true);
        yield* app.tick();
        app.move(100, 1);
        yield* settle;
        expect(app.statusWaiting()).toBeGreaterThan(0);
        app.send(Command.Seek({ seconds: 40 }));
        yield* settle;
        if (loadMs > 0) app.hold();
        app.holdStatus(false);
        yield* settle;
        if (loadMs > 0) {
          expect(app.pending.length).toBe(1);
          yield* app.tick(loadMs);
          app.pending.at(-1)?.release();
          yield* settle;
        }
        yield* app.tick();
        expect(app.calls.filter((it) => it.operation === 'play').at(-1)?.uri).toBe(
          audioUrl(100, 1),
        );
        expect(app.registry.get(app.player.recording)).toEqual(
          Option.some({ number: 100, requested: 1, effective: 1 }),
        );
        expect(app.read().positionMs).toBe(40_250);
      }),
  );

for (const command of ['Pause', 'Start', 'Key'] as const)
  it.effect(`keyplay a claimed key status read yields to a newer ${command}`, () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      app.holdStatus(true);
      yield* app.tick();
      app.move(100, 1);
      yield* settle;
      if (command === 'Pause') app.send(Command.Pause());
      if (command === 'Start') app.send(Command.Start({ track: other }));
      if (command === 'Key') app.move(100, 2);
      yield* settle;
      app.holdStatus(false);
      yield* app.tick();
      expect(
        app.calls.filter((it) => it.operation === 'play' && it.uri === audioUrl(100, 1)),
      ).toEqual([]);
      if (command === 'Pause') {
        expect(app.state()._tag).toBe('Paused');
        app.send(Command.Resume());
        yield* app.playing;
        expect(app.calls.filter((it) => it.operation === 'play').at(-1)?.uri).toBe(
          audioUrl(100, 1),
        );
      } else {
        let uri = audioUrl(100, 2);
        if (command === 'Start') uri = audioUrl(3);
        expect(app.calls.filter((it) => it.operation === 'play').at(-1)?.uri).toBe(uri);
      }
    }),
  );

for (const action of ['printed selection', 'remote Play'] as const)
  it.effect(`keyplay fallback ${action} does not reload the sounding set probeB probeE`, () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      app.missing.add(audioUrl(100, 2));
      app.move(100, 2);
      yield* app.tick();
      yield* app.playing;
      const count = app.calls.filter((it) =>
        ['play', 'seek', 'stop'].includes(it.operation),
      ).length;
      if (action === 'printed selection') app.move(100, 0);
      else app.remote({ type: 'play' });
      yield* app.tick();
      expect(app.state()._tag).toBe('Playing');
      expect(app.calls.filter((it) => ['play', 'seek', 'stop'].includes(it.operation)).length).toBe(
        count,
      );
      let requested = 2;
      if (action === 'printed selection') requested = 0;
      expect(app.registry.get(app.player.recording)).toEqual(
        Option.some({
          number: 100,
          requested,
          effective: 0,
        }),
      );
    }),
  );

it.effect('keyplay playing switch keeps musical place and maps preparation time', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(20_000);
    const before = app.read().positionMs;
    app.hold();
    app.move(100, 1);
    yield* settle;
    expect(app.calls.filter((it) => it.operation === 'play').at(-1)?.uri).toBe(audioUrl(100, 1));
    yield* app.tick(750);
    app.pending[0]?.release();
    yield* app.playing;
    const seek = app.calls.filter((it) => it.operation === 'seek').at(-1);
    expect(seek?.at).toBe(before + 750);
    expect(yield* SubscriptionRef.get(app.seeks)).toBe(0);
    yield* Console.log(`keyplay-proof switchGapMs=750 startAtMs=${before} landedAtMs=${seek?.at}`);
  }),
);

it.effect('keyplay paused selection waits for Play and resumes at its held place', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(12_000);
    app.send(Command.Pause());
    yield* settle;
    const before = app.read().positionMs;
    const count = app.calls.length;
    app.move(100, -2);
    yield* app.tick(1000);
    expect(app.state()._tag).toBe('Paused');
    expect(app.calls.length).toBe(count);
    app.send(Command.Resume());
    yield* app.playing;
    expect(app.calls.filter((it) => it.operation === 'play').at(-1)?.uri).toBe(audioUrl(100, -2));
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(before);
  }),
);

it.effect('keyplay rapid delayed keys retain the entire preparation interval', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(10_000);
    const before = app.read().positionMs;
    app.hold();
    app.move(100, 1);
    yield* app.tick(300);
    app.hold();
    app.move(100, 2);
    yield* app.tick(700);
    app.pending[1]?.release();
    yield* app.playing;
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(before + 1000);
    const count = app.calls.length;
    app.pending[0]?.release(true);
    yield* app.tick();
    expect(app.calls.length).toBe(count);
  }),
);

it.effect('keyplay Sound on uses the selected set and its printed fallback', () =>
  Effect.gen(function* () {
    using app = yield* open(false);
    app.move(100, 1);
    app.missing.add(audioUrl(100, 1));
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(10_000);
    yield* SubscriptionRef.set(app.sound, true);
    yield* app.tick();
    expect(app.calls.filter((it) => it.operation === 'play').map((it) => it.uri)).toEqual([
      audioUrl(100, 1),
      audioUrl(100),
    ]);
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: 1, effective: 0 }),
    );
  }),
);

it.effect('keyplay Sound on keeps reading through a failed preparation and fallback', () =>
  Effect.gen(function* () {
    using app = yield* open(false);
    app.move(100, 1);
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(10_000);
    const before = app.state();
    expect(before._tag).toBe('Playing');
    app.hold();
    yield* SubscriptionRef.set(app.sound, true);
    yield* settle;
    // The native status can report failure before its play Promise answers.
    app.force({ state: 'failed', positionMs: 0, durationMs: 240_000 });
    yield* app.tick(500);
    expect(app.state()._tag).not.toBe('Failed');
    app.pending[0]?.release(true);
    yield* settle;
    if (before._tag === 'Playing')
      expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(
        before.at * 1000 + 500,
      );
    yield* app.tick();
    yield* app.playing;
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: 1, effective: 0 }),
    );
  }),
);

it.effect('keyplay a silent score tail keeps place across Key and falls back on rewind', () =>
  Effect.gen(function* () {
    using app = yield* open(true, 60_000);
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(70_000);
    yield* app.tick(1000);
    const before = app.state();
    expect(before._tag).toBe('Playing');
    const calls = app.calls.filter((it) => it.operation === 'play').length;
    app.move(100, 2);
    yield* app.tick(1000);
    const after = app.state();
    expect(after._tag).toBe('Playing');
    if (before._tag === 'Playing' && after._tag === 'Playing') expect(after.at).toBe(before.at + 1);
    expect(app.calls.filter((it) => it.operation === 'play').length).toBe(calls);
    app.missing.add(audioUrl(100, 2));
    app.send(Command.Seek({ seconds: 40 }));
    yield* app.tick();
    yield* app.playing;
    expect(
      app.calls
        .filter((it) => it.operation === 'play')
        .slice(-2)
        .map((it) => it.uri),
    ).toEqual([audioUrl(100, 2), audioUrl(100)]);
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(40_000);
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: 2, effective: 0 }),
    );
  }),
);

it.effect('keyplay missing set falls back once at retained place and a later Play retries', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(10_000);
    const before = app.read().positionMs;
    app.missing.add(audioUrl(100, 2));
    app.move(100, 2);
    yield* settle;
    yield* app.tick();
    yield* app.playing;
    expect(app.calls.filter((it) => it.operation === 'play').map((it) => it.uri)).toEqual([
      audioUrl(100),
      audioUrl(100, 2),
      audioUrl(100),
    ]);
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(before);
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: 2, effective: 0 }),
    );
    app.send(Command.Pause());
    yield* settle;
    app.missing.clear();
    app.send(Command.Resume());
    yield* app.playing;
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: 2, effective: 2 }),
    );
  }),
);

it.effect('keyplay late failed old load cannot override the newest key or seek it', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    app.hold();
    app.move(100, 1);
    yield* settle;
    app.move(100, -1);
    yield* app.tick();
    yield* app.playing;
    const count = app.calls.length;
    app.pending[0]?.release(true);
    yield* app.tick();
    expect(
      app.calls
        .slice(count)
        .filter((it) => ['play', 'seek', 'pause', 'announce'].includes(it.operation)),
    ).toEqual([]);
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: -1, effective: -1 }),
    );
  }),
);

it.effect('keyplay pause and seek during replacement supersede its time and intent', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    app.hold();
    app.move(100, 3);
    yield* settle;
    app.send(Command.Pause());
    yield* settle;
    yield* app.tick(500);
    app.pending[0]?.release();
    yield* app.tick();
    expect(app.read().state).toBe('paused');
    expect(app.state()._tag).toBe('Paused');
    app.send(Command.Seek({ seconds: 40 }));
    yield* app.tick();
    expect(app.read().positionMs).toBe(40_000);
  }),
);

it.effect('keyplay a seek during a pending key load owns the final landing', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    app.hold();
    app.move(100, 1);
    yield* settle;
    app.send(Command.Seek({ seconds: 40 }));
    yield* app.tick(500);
    app.pending[0]?.release();
    yield* app.playing;
    yield* app.tick();
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(40_000);
    yield* Console.log('keyplay-proof pendingSeekMs=40000 prepareMs=500 landedAtMs=40000');
  }),
);

it.effect('keyplay all capo frets leave a playing recording and its dispatch trace unchanged', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    const before = app.calls.length;
    const selected = app.registry.get(app.player.recording);
    for (let capo = 0; capo < 12; capo++) {
      app.move(100, 0, capo);
      yield* settle;
      expect(app.calls.length).toBe(before);
      expect(app.state()._tag).toBe('Playing');
      expect(app.registry.get(app.player.recording)).toBe(selected);
    }
  }),
);

it.effect('keyplay an old recording that fails at zero keeps the last proved musical place', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    yield* app.tick(20_000);
    const before = app.read().positionMs;
    app.force({ state: 'failed', positionMs: 0, durationMs: 240_000 });
    app.move(100, 1);
    yield* app.playing;
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(before);
  }),
);

it.effect('keyplay a fresh printed-key Start supersedes a pending transposed load', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.send(Command.Start({ track }));
    yield* app.playing;
    app.hold();
    app.move(100, 1);
    yield* settle;
    app.send(Command.Start({ track: other }));
    yield* app.playing;
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 3, requested: 0, effective: 0 }),
    );
    const count = app.calls.length;
    app.pending[0]?.release(true);
    yield* app.tick();
    expect(app.state()._tag).toBe('Playing');
    expect(
      app.calls.slice(count).filter((it) => it.operation === 'play' || it.operation === 'announce'),
    ).toEqual([]);
  }),
);

for (const failed of [false, true]) {
  it.effect(`keyplay a seek retains key-load ownership and fallback failed=${failed}`, () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      app.hold();
      app.move(100, 1);
      yield* settle;
      app.send(Command.Seek({ seconds: 40 }));
      yield* app.tick(500);
      app.pending[0]?.release(failed);
      yield* app.playing;
      yield* app.tick();
      let effective = 1;
      if (failed) effective = 0;
      expect(app.registry.get(app.player.recording)).toEqual(
        Option.some({ number: 100, requested: 1, effective }),
      );
      expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(40_000);
      expect(app.calls.filter((it) => it.operation === 'play').length).toBe(2 + Number(failed));
    }),
  );
}

it.effect('keyplay an initial chosen-key load lands a newer seek without losing identity', () =>
  Effect.gen(function* () {
    using app = yield* open();
    app.move(100, -2);
    app.hold();
    app.send(Command.Start({ track }));
    yield* settle;
    app.send(Command.Seek({ seconds: 40 }));
    yield* app.tick(500);
    app.pending[0]?.release();
    yield* app.playing;
    yield* app.tick();
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: -2, effective: -2 }),
    );
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(40_000);
  }),
);

it.effect(
  'keyplay silent scoreClock keeps the line time across keys and capo without device calls',
  () =>
    Effect.gen(function* () {
      using app = yield* open(false);
      app.send(Command.Start({ track }));
      yield* app.playing;
      yield* app.tick(10_000);
      const before = app.state();
      expect(Player.$is('Playing')(before)).toBe(true);
      app.move(100, 1);
      yield* app.tick(1000);
      const after = app.state();
      if (Player.$is('Playing')(before) && Player.$is('Playing')(after))
        expect(after.at).toBe(before.at + 1);
      for (const capo of [1, 11, 0]) {
        app.move(100, 1, capo);
        yield* app.tick();
      }
      expect(app.calls.filter((it) => it.operation !== 'announce')).toEqual([]);
      expect(yield* SubscriptionRef.get(app.seeks)).toBe(0);
    }),
);

it.effect(
  'keyplay held settings alone select the recording across the entire identity and capo domain',
  () =>
    Effect.gen(function* () {
      using app = yield* open(false);
      let cases = 0;
      for (let number = 1; number <= 695; number++)
        for (let offset = -5; offset <= 6; offset++) {
          app.move(number, offset);
          app.send(Command.Start({ track: { number, title: `Hymn ${number}` } }));
          yield* settle;
          expect(app.registry.get(app.player.recording)).toEqual(
            Option.some({ number, requested: offset, effective: offset }),
          );
          const selected = app.registry.get(app.player.recording);
          for (let capo = 0; capo < 12; capo++) {
            app.move(number, offset, capo);
            yield* settle;
            expect(app.registry.get(app.player.recording)).toBe(selected);
            cases++;
          }
        }
      expect(cases).toBe(100_080);
      expect(app.calls.filter((it) => it.operation !== 'announce')).toEqual([]);
      yield* Console.log(`keyplay-proof identityCases=${cases} hymns=695 offsets=12 capos=12`);
    }),
);

it.effect(
  'keyplay another page key cannot move the held hymn and a fresh Start reads its own key',
  () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      const before = app.calls.length;
      app.move(3, -5);
      yield* app.tick();
      expect(app.calls.length).toBe(before);
      app.send(Command.Start({ track: other }));
      yield* app.playing;
      expect(app.calls.filter((it) => it.operation === 'play').at(-1)?.uri).toBe(audioUrl(3, -5));
    }),
);

it.effect(
  'keyplay octave-equivalent settings keep the sounding set and dispatch across all capo frets',
  () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      for (let offset = -5; offset <= 6; offset++) {
        app.move(100, offset);
        yield* settle;
        const selected = app.registry.get(app.player.recording);
        const count = app.calls.filter((it) =>
          ['play', 'seek', 'stop'].includes(it.operation),
        ).length;
        expect(selected).toEqual(
          Option.some({ number: 100, requested: offset, effective: offset }),
        );
        expect(app.calls.filter((it) => it.operation === 'play').at(-1)?.uri).toBe(
          audioUrl(100, offset),
        );
        for (const octave of [-2, 0, 1])
          for (let capo = 0; capo < 12; capo++) {
            app.move(100, offset + octave * 12, capo);
            yield* settle;
            expect(app.registry.get(app.player.recording)).toBe(selected);
            expect(
              app.calls.filter((it) => ['play', 'seek', 'stop'].includes(it.operation)).length,
            ).toBe(count);
          }
      }
    }),
);

type App = Effect.Success<ReturnType<typeof open>>;

for (const failed of [false, true])
  it.effect(
    `playswap interrupted old loads cannot trigger fallback after native rejection=${failed}`,
    () =>
      Effect.gen(function* () {
        using app = yield* open();
        app.hold();
        app.send(Command.Start({ track }));
        yield* settle;
        app.move(3, 2, 7);
        app.hold();
        app.send(Command.Start({ track: other }));
        yield* settle;
        app.move(100, -2, 11);
        app.hold();
        app.send(Command.Start({ track }));
        yield* settle;
        expect(app.pending).toHaveLength(3);
        // The adapter's stale callers have been interrupted. Observe the native
        // outcomes and prove neither completion can trigger a printed fallback.
        const outcomes = Promise.allSettled(app.pending.map((pending) => pending.result()));
        app.pending.forEach((pending, index) => pending.release(index < 2 && failed));
        expect((yield* Effect.promise(() => outcomes)).map((outcome) => outcome.status)).toEqual([
          ...Match.value(failed).pipe(
            Match.when(true, () => ['rejected', 'rejected'] as const),
            Match.orElse(() => ['fulfilled', 'fulfilled'] as const),
          ),
          'fulfilled',
        ]);
        yield* app.playing;
        expect(app.registry.get(app.player.recording)).toEqual(
          Option.some({ number: 100, requested: -2, effective: -2 }),
        );
        expect(
          app.calls.filter((call) => call.operation === 'play').map((call) => call.uri),
        ).toEqual([audioUrl(100), audioUrl(3, 2), audioUrl(100, -2)]);
        expect(app.calls.filter((call) => call.operation === 'seek').at(-1)?.at).toBe(0);
      }),
  );

it.effect('keyplay a handed-over play cannot delay a third Start behind native status', () =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const app = native(clock);
    const on = yield* SubscriptionRef.make(true);
    const api = yield* scoreClock(
      playbackOn(() => app.device, Option.none()),
      () => Option.some(timeline),
      on,
    );
    app.hold();
    const first = yield* api.play(audioUrl(100), 0).pipe(Effect.forkChild);
    yield* settle;
    expect(app.pending).toHaveLength(1);
    app.holdStatus(true);
    app.hold();
    const second = yield* api.play(audioUrl(3), 0).pipe(Effect.forkChild);
    yield* settle;
    app.hold();
    const third = yield* api.play(audioUrl(100), 0).pipe(Effect.forkChild);
    yield* settle;
    expect(app.calls.filter((call) => call.operation === 'play').map((call) => call.uri)).toEqual([
      audioUrl(100),
      audioUrl(3),
      audioUrl(100),
    ]);
    app.holdStatus(false);
    app.pending.forEach((pending) => pending.release());
    yield* Fiber.join(first);
    yield* Fiber.join(second);
    yield* Fiber.join(third);
  }).pipe(Effect.scoped),
);

it.effect('keyplay a Sound-on hand-over cannot delay the third public Start', () =>
  Effect.gen(function* () {
    using app = yield* open(false);
    app.send(Command.Start({ track }));
    yield* app.playing;
    // The Sound switch owns this load independently of the command's scope.
    app.hold();
    yield* SubscriptionRef.set(app.sound, true);
    yield* settle;
    expect(app.pending).toHaveLength(1);
    app.holdStatus(true);
    app.hold();
    app.send(Command.Start({ track: other }));
    yield* settle;
    app.hold();
    app.send(Command.Start({ track }));
    yield* settle;
    expect(app.calls.filter((call) => call.operation === 'play').map((call) => call.uri)).toEqual([
      audioUrl(100),
      audioUrl(3),
      audioUrl(100),
    ]);
    app.holdStatus(false);
    app.pending.forEach((pending) => pending.release());
    yield* app.playing;
    expect(app.registry.get(app.player.recording)).toEqual(
      Option.some({ number: 100, requested: 0, effective: 0 }),
    );
  }),
);

for (const state of ['playing', 'ended', 'failed'] as const)
  it.effect(`playswap Sound on starts before a former ${state} status answers`, () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      app.holdNextStatus({ state, positionMs: 90_000, durationMs: 90_000 });
      yield* app.tick();
      expect(app.statusWaiting()).toBe(1);
      app.move(3, 2, 7);
      app.send(Command.Start({ track: other }));
      yield* settle;
      // The old observer stays unresolved until the new recording plays.
      expect(
        app.calls.filter((call) => call.operation === 'play' && call.uri === audioUrl(3, 2)),
      ).toHaveLength(1);
      yield* app.playing;
      expect(app.statusWaiting()).toBe(1);
      const before = Option.getOrThrow(Option.liftPredicate(app.state(), Player.$is('Playing')));
      expect(before.track.number).toBe(3);
      app.holdStatus(false);
      yield* app.tick();
      expect(app.state()).toEqual(
        Player.Playing({ track: other, at: before.at + 0.25, length: before.length }),
      );
      expect(app.registry.get(app.player.recording)).toEqual(
        Option.some({ number: 3, requested: 2, effective: 2 }),
      );
      expect(app.calls.filter((call) => call.operation === 'pause')).toEqual([]);
    }),
  );

const enterState = (app: App, state: Player['_tag']) =>
  Effect.gen(function* () {
    if (state === 'Idle') return;
    if (state === 'Loading' || state === 'Stopped') app.hold();
    app.send(Command.Start({ track }));
    yield* settle;
    if (state !== 'Loading' && state !== 'Stopped') yield* app.playing;
    if (state === 'Paused' || state === 'Stopped') {
      app.send(Command.Pause());
      yield* app.tick();
    }
    if (state === 'Buffering') {
      app.force({ ...app.read(), state: 'loading' });
      for (let i = 0; i < 12; i++) yield* app.tick();
    }
    if (state === 'Ended') app.force({ state: 'ended', positionMs: 240_000, durationMs: 240_000 });
    if (state === 'Failed') app.force({ state: 'failed', positionMs: 20_000, durationMs: 240_000 });
    yield* app.tick();
  });

for (const command of ['Seek', 'Pause'] as const)
  it.effect(`playswap independent observation cannot revive a former tail after ${command}`, () =>
    Effect.gen(function* () {
      using app = yield* open();
      app.send(Command.Start({ track }));
      yield* app.playing;
      app.holdNextStatus({ state: 'ended', positionMs: 90_000, durationMs: 90_000 });
      yield* app.tick();
      expect(app.statusWaiting()).toBe(1);
      const at = app.read().positionMs / 1000;
      app.send(
        Match.value(command).pipe(
          Match.when('Seek', () => Command.Seek({ seconds: 20 })),
          Match.orElse(() => Command.Pause()),
        ),
      );
      yield* settle;
      app.holdStatus(false);
      yield* app.tick();
      const expected = Match.value(command).pipe(
        Match.when('Seek', () => Player.Playing({ track, at: 20.25, length: Option.some(240) })),
        Match.orElse(() => Player.Paused({ track, at, length: Option.some(240) })),
      );
      expect(app.state()).toEqual(expected);
      expect(app.calls.filter((call) => call.operation === 'play')).toHaveLength(1);
    }),
  );

for (const state of [
  'Idle',
  'Loading',
  'Playing',
  'Paused',
  'Buffering',
  'Ended',
  'Stopped',
  'Failed',
] as const) {
  it.effect(`playswap Start from ${state} starts at the new hymn and chosen Key`, () =>
    Effect.gen(function* () {
      using app = yield* open();
      yield* enterState(app, state);
      expect(app.state()._tag).toBe(state);
      app.move(3, 2, 7);
      app.send(Command.Start({ track: other }));
      yield* app.playing;
      expect(app.registry.get(app.player.recording)).toEqual(
        Option.some({ number: 3, requested: 2, effective: 2 }),
      );
      expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(0);
      // Return to the former page: this is a new Start, never its old place.
      app.move(100, -2, 11);
      app.send(Command.Start({ track }));
      yield* app.playing;
      const selected = Option.some({ number: 100, requested: -2, effective: -2 });
      expect(app.registry.get(app.player.recording)).toEqual(selected);
      expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(0);
      const calls = app.calls.length;
      for (const pending of app.pending) pending.release();
      yield* app.tick();
      expect(app.state()._tag).toBe('Playing');
      expect(app.registry.get(app.player.recording)).toEqual(selected);
      expect(
        app.calls.slice(calls).filter((it) => ['play', 'seek', 'announce'].includes(it.operation)),
      ).toEqual([]);
    }),
  );

  it.effect(`keyplay state ${state} keeps intent and rejects old replies`, () =>
    Effect.gen(function* () {
      using app = yield* open();
      yield* enterState(app, state);
      expect(app.state()._tag).toBe(state);
      const count = app.calls.filter((it) => it.operation === 'play').length;
      app.move(100, -3);
      yield* settle;
      if (['Idle', 'Paused', 'Stopped', 'Failed', 'Ended'].includes(state)) {
        expect(app.calls.filter((it) => it.operation === 'play').length).toBe(count);
        expect(app.state()._tag).toBe(state);
        if (state === 'Idle') app.send(Command.Start({ track }));
        else app.send(Command.Resume());
      }
      yield* app.playing;
      const selected = app.registry.get(app.player.recording);
      expect(selected).toEqual(Option.some({ number: 100, requested: -3, effective: -3 }));
      for (const pending of app.pending) pending.release(true);
      yield* app.tick();
      expect(app.registry.get(app.player.recording)).toEqual(selected);
    }),
  );
}

it.effect(
  "playswap silent Starts use each hymn's first sung line and discard the former place",
  () =>
    Effect.gen(function* () {
      using app = yield* open(false, 240_000, (number) =>
        Option.some({
          ...timeline,
          first: Match.value(number).pipe(
            Match.when(3, () => 12_000),
            Match.orElse(() => 5000),
          ),
        }),
      );
      app.send(Command.Start({ track }));
      yield* app.playing;
      app.send(Command.Seek({ seconds: 90 }));
      yield* app.tick();
      app.move(3, -3, 5);
      const began = yield* Clock.currentTimeMillis;
      app.send(Command.Start({ track: other }));
      yield* app.playing;
      const elapsed = (yield* Clock.currentTimeMillis) - began;
      const shown = app.state();
      expect(shown._tag).toBe('Playing');
      expect(
        Player.$is('Playing')(shown) && {
          number: shown.track.number,
          start: shown.at - elapsed / 1000,
        },
      ).toEqual({ number: 3, start: 12 });
      expect(app.registry.get(app.player.recording)).toEqual(
        Option.some({ number: 3, requested: -3, effective: -3 }),
      );
      expect(app.calls.filter((it) => it.operation !== 'announce')).toEqual([]);
    }),
);

const replacementStep = (app: App, seed: number, step: number) =>
  Effect.gen(function* () {
    const offset = ((seed * 7 + step * 5) % 12) - 5;
    app.hold();
    app.move(100, offset);
    yield* settle;
    // One held reply can lose to a newer key, or finish under a Pause.
    if (step % 3 === 0) {
      let next = offset + 1;
      if (offset === 6) next = -5;
      app.move(100, next);
    }
    if (step % 3 === 1) {
      app.send(Command.Pause());
      yield* settle;
    }
    yield* app.tick(((seed % 4) + 1) * 100);
    for (const pending of app.pending.splice(0)) pending.release(step % 4 === 0);
    yield* app.tick();
    if (step % 3 === 1) {
      if (app.read().state === 'failed') expect(offset).toBe(0);
      else expect(app.read().state).toBe('paused');
      app.send(Command.Resume());
    } else if (app.read().state === 'failed') app.send(Command.Resume());
    yield* app.playing;
    app.send(Command.Seek({ seconds: 20 + seed + step }));
    yield* app.tick();
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(
      (20 + seed + step) * 1000,
    );
  });

it.effect(
  'keyplay generated replacements preserve latest selection through failures seek pause and resume',
  () =>
    Effect.gen(function* () {
      let samples = 0;
      for (let seed = 1; seed <= 24; seed++) {
        using app = yield* open();
        app.send(Command.Start({ track }));
        yield* app.playing;
        for (let step = 0; step < 8; step++) {
          yield* replacementStep(app, seed, step);
          samples++;
        }
      }
      expect(samples).toBe(192);
      yield* Console.log(`keyplay-proof scheduleSeeds=24 scheduleSteps=${samples}`);
    }),
);

it.effect('keyplay stopped and disposed device requests cannot issue a late seek', () =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const fake = native(clock);
    const api = playbackOn(() => fake.device, Option.none());
    fake.hold();
    const pending = yield* Effect.forkChild(
      api.play(audioUrl(100, 2), 42_000, { continuous: true, ready: true }),
      { startImmediately: true },
    );
    yield* settle;
    yield* api.stop;
    const count = fake.calls.length;
    fake.pending[0]?.release();
    yield* settle;
    expect(fake.calls.length).toBe(count);
    expect(fake.read().state).toBe('idle');
    expect((yield* Fiber.await(pending))._tag).toBe('Failure');
    fake.hold();
    const disposed = yield* Effect.forkChild(
      api.play(audioUrl(100, -1), 15_000, { continuous: true, ready: true }),
      { startImmediately: true },
    );
    yield* settle;
    yield* Fiber.interrupt(disposed);
    const before = fake.calls.length;
    fake.pending[1]?.release();
    yield* settle;
    expect(fake.calls.length).toBe(before);
  }),
);
