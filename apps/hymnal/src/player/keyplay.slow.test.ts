/* oxlint-disable effect/noNewPromise -- the fake replaces One's Promise-based device API and exposes each reply for controlled schedules. */
import { expect, it } from 'effect-bun-test';
import { Clock, Console, Effect, Fiber, Layer, Option, References, SubscriptionRef } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import { keyFromSignature } from '@manna/hymnal/chord';

import { audioUrl } from '~/remote';
import { type Move, soundingKey, playedKey, transposed } from '~/hymns/chords';

import { playbackOn, type Device } from './playback.live';
import { Command, Playback, Player, playerOn, type Status, statusEvery } from './player';
import { counted } from '../follow/seeks';
import { soundOn } from './sound';
import { recordingsOn } from './recording';
import type { Timeline } from '../follow/timeline';

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
  const calls: Array<{ operation: string; uri?: string; at: number; time: number }> = [];
  const pending: Array<{ release: (failed?: boolean) => void }> = [];
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
        return new Promise((resolve) =>
          pending.push({ release: (failed) => resolve(finish(failed)) }),
        );
      },
      getPlaybackStatus: () => Promise.resolve(read()),
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
      watchRemoteCommands: () => () => {},
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
    force: set,
    hold: () => {
      hold = true;
    },
  };
};

const open = (sound = true, recorded = 240_000) =>
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
        counted(
          soundOn(recordingsOn(playback), () => Option.some(timeline), on),
          seeks,
        ).pipe(Layer.provide(clockLayer)),
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
    expect(app.read().positionMs).toBeGreaterThanOrEqual(before + 750);
    expect(app.read().positionMs).toBeLessThanOrEqual(before + 1000);
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
    expect(app.read().positionMs).toBeGreaterThanOrEqual(40_000);
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
    yield* app.tick();
    yield* app.playing;
    expect(app.calls.filter((it) => it.operation === 'play').map((it) => it.uri)).toEqual([
      audioUrl(100),
      audioUrl(100, 2),
      audioUrl(100),
    ]);
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBeGreaterThanOrEqual(
      before,
    );
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
    expect(app.read().positionMs).toBeGreaterThanOrEqual(40_000);
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBe(40_500);
    yield* Console.log('keyplay-proof pendingSeekMs=40000 prepareMs=500 landedAtMs=40500');
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
    expect(app.calls.filter((it) => it.operation === 'seek').at(-1)?.at).toBeGreaterThanOrEqual(
      before,
    );
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
      expect(app.read().positionMs).toBeGreaterThanOrEqual(40_000);
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
    expect(app.read().positionMs).toBeGreaterThanOrEqual(40_000);
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
  'keyplay sounding identity is independent of major minor enharmonic spelling and octave turns',
  () =>
    Effect.sync(() => {
      for (let fifths = -7; fifths <= 7; fifths++)
        for (const minor of [true, false]) {
          const key = keyFromSignature(fifths, minor);
          for (let offset = -5; offset <= 6; offset++)
            for (let capo = 0; capo < 12; capo++) {
              const move = { transpose: offset, capo };
              expect(soundingKey(key, move)).toEqual(soundingKey(key, { ...move, capo: 0 }));
              expect(transposed(move, 12)).toEqual(move);
              expect(transposed(move, -24)).toEqual(move);
              expect(playedKey(key, move).minor).toBe(minor);
            }
        }
    }),
);

type App = Effect.Success<ReturnType<typeof open>>;

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
    expect(app.read().positionMs).toBeGreaterThanOrEqual((20 + seed + step) * 1000);
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
