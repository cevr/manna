/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/noAsyncFunction -- the current app's score clock is imported once, after the stand-ins its import graph needs; the port's side is one plain loop over the contract's calls, and a broken rule throws naming its seed and history as JSON. */

/**
 * `step`'s Sound against the current app's score clock (`sound.ts`'s
 * `scoreClock`, imported, never copied), run under Effect's TestClock over
 * a device the test holds that moves with the clock: seeded histories of
 * Play, Pause, Resume, a seek the bar sends, Stop, the Sound switch and time
 * going by, each given to both. The port runs as its contract runs it: its
 * element answers each command at once and tells its place at each of
 * `TICK`'s steps, and while the silent clock plays it is ticked every
 * `TICK` ms and once more before each of the reader's asks and each switch
 * (`features/player.contract`'s `playerClock`, `playerAsk`). After each step
 * the port shows the clock's phase, place and length, and its element
 * sounds exactly while the current app's device does.
 *
 * Both hymns have the fixtures' timeline (first line at 0.5 s, end at 6.5 s)
 * and a recording 8 s long, so the recording holds every sung line and the
 * silent clock ends before the recording does. A pause is asked only while
 * the bar offers Pause, a seek only when the bar sends it (`sends`, the
 * current scrub rules), and none from a recording the device played to its
 * end, whose answer there is the device's own.
 */

import { describe, expect, it } from 'bun:test';
import { sends } from '@manna/hymnal-app/player/scrub-rules';
import type { PlaybackApi, scoreClock as ScoreClock, Told } from '@manna/hymnal-app/player/sound';
import { Clock, Effect, Option, Stream, SubscriptionRef } from 'effect';
import { TestClock } from 'effect/testing';

import { type Random, below, pick, seeded } from '../../test/random.ts';
import { current } from '../current.testing.ts';
import { TIMELINE, TRACKS, titleOf } from '../fixtures.testing.ts';
import { type Command, type Input, type State, deviceOf, initial, step } from '../step.ts';
import { viewOf } from '../view.ts';

const HISTORIES = 120;
const STEPS = 40;
/** How often the contract ticks the silent clock and the element tells its place, in ms. */
const TICK = 250;
/** The recording's length, in seconds. */
const RECORDING = 8;

const TIMED = TRACKS.slice(0, 2);

type Act =
  | { readonly _tag: 'play'; readonly number: number }
  | { readonly _tag: 'pause' }
  | { readonly _tag: 'resume' }
  | { readonly _tag: 'seek'; readonly seconds: number }
  | { readonly _tag: 'stop' }
  | { readonly _tag: 'switch' }
  | { readonly _tag: 'wait'; readonly ms: number };

const actOf = (random: Random): Act =>
  pick<() => Act>(random, [
    () => ({ _tag: 'play', number: pick(random, TIMED).number }),
    () => ({ _tag: 'play', number: pick(random, TIMED).number }),
    () => ({ _tag: 'pause' }),
    () => ({ _tag: 'resume' }),
    () => ({ _tag: 'seek', seconds: pick(random, [0, 0.4, 1, 2.6, 3, 5.2, 6.4, 7, 7.9]) }),
    () => ({ _tag: 'seek', seconds: pick(random, [0, 1, 3, 6]) }),
    () => ({ _tag: 'stop' }),
    () => ({ _tag: 'switch' }),
    () => ({ _tag: 'switch' }),
    () => ({ _tag: 'wait', ms: TICK * (1 + below(random, 16)) }),
    () => ({ _tag: 'wait', ms: TICK * (1 + below(random, 4)) }),
    () => ({ _tag: 'wait', ms: TICK * (1 + below(random, 4)) }),
  ])();

/** A device holding a recording `length` ms long that moves with the clock while it plays, as the current app's `sound.test.ts` holds one. */
const recording = (length: number): PlaybackApi => {
  let state: Told['state'] = 'idle';
  let at = 0;
  let since = 0;
  const read = Effect.map(Clock.currentTimeMillis, (now): Told => {
    if (state === 'playing') at = Math.min(length, at + (now - since));
    since = now;
    if (state === 'playing' && at >= length) state = 'ended';
    return { state, positionMs: at, durationMs: length };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  return {
    play: (_uri, fromMs) =>
      then(() => {
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
    stop: Effect.asVoid(
      then(() => {
        state = 'idle';
      }),
    ),
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.empty,
  };
};

/** The port as its contract runs it: the step, its one element, and the silent clock's ticks. */
const portOf = () => {
  let state: State = initial;
  let element: { load: number; at: number; playing: boolean } | undefined;
  let now = 0;
  let base = 0;
  let ticking = false;
  const inbox: Array<Input> = [];
  const seekOf = () => state.held?.seek ?? 0;
  const obey = (command: Command | undefined) => {
    if (command?._tag === 'load') {
      element = { load: command.id, at: command.from, playing: false };
      inbox.push({ _tag: 'loaded', id: command.id, duration: RECORDING });
    } else if (command?._tag === 'unload') element = undefined;
    else if (command?._tag === 'seek' && element !== undefined) {
      element.at = command.seconds;
      inbox.push({ _tag: 'seeked', id: element.load, serial: command.serial });
      inbox.push({ _tag: 'time', id: element.load, serial: command.serial, seconds: element.at });
    }
  };
  const render = () => {
    const device = deviceOf(state);
    if (element === undefined || device === undefined || device.load !== element.load) return;
    if (!device.paused && !element.playing && element.at < RECORDING) {
      element.playing = true;
      inbox.push({ _tag: 'played', id: element.load }, { _tag: 'playing', id: element.load });
    } else if (device.paused && element.playing) {
      element.playing = false;
      inbox.push({ _tag: 'paused', id: element.load });
    }
  };
  const took = () => {
    const shown = viewOf(state, undefined, titleOf).ticking;
    if (shown && !ticking) base = now;
    ticking = shown;
  };
  const feed = (input: Input) => {
    const next = step(state, input);
    state = next.state;
    obey(next.command);
    render();
    took();
  };
  const drain = () => {
    for (let input = inbox.shift(); input !== undefined; input = inbox.shift()) feed(input);
  };
  const tick = () => {
    if (!ticking) return;
    feed({ _tag: 'tick', id: state.held?.load ?? 0, ms: now - base });
    base = now;
    drain();
  };
  return {
    state: () => state,
    sounds: () => element?.playing ?? false,
    ask: (input: Input) => {
      tick();
      feed(input);
      drain();
    },
    wait: (ms: number) => {
      for (let gone = 0; gone < ms; gone += TICK) {
        now += TICK;
        if (element?.playing === true) {
          element.at = Math.min(element.at + TICK / 1000, RECORDING);
          inbox.push({ _tag: 'time', id: element.load, serial: seekOf(), seconds: element.at });
          if (element.at >= RECORDING) {
            element.playing = false;
            inbox.push({ _tag: 'ended', id: element.load });
          }
        }
        drain();
        tick();
      }
    },
  };
};

/** Let the score clock's fibers run what the last change woke: its switch's hand-over. */
const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, { discard: true });

const urlOf = (number: number) => TIMED.find((track) => track.number === number)?.url ?? '';

/** What the histories walked: each hand-over and each move of the clock, which the test needs every one of. */
const seen = new Set<string>();

/** One history of `seed`, given to both; it throws at the first step where they part, with the history so far. */
const history = (scoreClock: typeof ScoreClock, seed: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const random = seeded(seed);
      const device = recording(RECORDING * 1000);
      const sound = yield* SubscriptionRef.make(true);
      const api = yield* scoreClock(
        device,
        (hymn) => (urlOf(hymn) === '' ? Option.none() : Option.some(TIMELINE)),
        sound,
      );
      yield* settle;
      const port = portOf();
      let on = true;
      let held: number | undefined;
      const acts: Array<Act> = [];
      for (let index = 0; index < STEPS; index += 1) {
        const act = actOf(random);
        acts.push(act);
        const shown = viewOf(port.state(), undefined, titleOf);
        switch (act._tag) {
          case 'play': {
            const track = TIMED.find((each) => each.number === act.number);
            if (track === undefined) break;
            port.ask({ _tag: 'play', track });
            yield* held === act.number ? api.resume : api.play(track.url, 0);
            held = act.number;
            break;
          }
          case 'pause':
            if (held === undefined || shown.toggle !== 'pause') break;
            port.ask({ _tag: 'pause' });
            yield* api.pause;
            break;
          case 'resume':
            if (held === undefined) break;
            port.ask({ _tag: 'resume' });
            yield* api.resume;
            break;
          case 'seek': {
            const silent = port.state().held?.silent === true;
            if (held === undefined || (shown.phase === 'ended' && !silent)) break;
            const to = Math.min(Math.max(act.seconds, 0), shown.length);
            if (!sends(shown.at, to)) break;
            port.ask({ _tag: 'seekTo', seconds: act.seconds });
            yield* api.seek(to * 1000);
            break;
          }
          case 'stop':
            if (held === undefined) break;
            port.ask({ _tag: 'stop' });
            yield* api.stop;
            held = undefined;
            break;
          case 'switch':
            on = !on;
            port.ask({ _tag: 'sound', on });
            yield* SubscriptionRef.set(sound, on);
            yield* settle;
            break;
          case 'wait':
            port.wait(act.ms);
            yield* TestClock.adjust(act.ms);
            yield* settle;
            break;
        }
        const view = viewOf(port.state(), undefined, titleOf);
        const fail = (rule: string, told: Told | boolean | undefined) => {
          throw new Error(
            JSON.stringify({ rule, seed, acts, port: view, held: port.state().held, told }),
          );
        };
        if (held === undefined) {
          if (view.held) fail('nothing held', undefined);
        } else {
          const told = yield* api.status;
          const phase =
            view.phase === 'loading' || view.phase === 'buffering' ? 'playing' : view.phase;
          if (phase !== told.state) fail('phase', told);
          if (Math.abs(view.at - told.positionMs / 1000) > 1e-6) fail('place', told);
          if (Math.abs(view.length - (told.durationMs ?? 0) / 1000) > 1e-6) fail('length', told);
        }
        const sounding = (yield* device.status).state === 'playing';
        if (sounding !== port.sounds()) fail('sounds only while the device does', sounding);
        if (!on && port.sounds()) fail('nothing sounds with Sound off', undefined);
        const was = shown.held ? (shown.src === '' ? 'clock' : 'device') : 'none';
        const is = view.held ? (view.src === '' ? 'clock' : 'device') : 'none';
        if (act._tag === 'wait' && is === 'clock' && view.at > shown.at) seen.add('the clock runs');
        if (act._tag === 'wait' && is === 'clock' && view.phase === 'ended') seen.add('it ends');
        if (act._tag === 'seek' && is === 'clock') seen.add('a seek moves the clock');
        if (act._tag === 'switch' && was === 'device' && is === 'clock') seen.add('off hands over');
        if (act._tag === 'switch' && was === 'clock' && is === 'device') seen.add('on hands over');
        if (act._tag === 'switch' && was === 'clock' && is === 'clock' && on)
          seen.add('on keeps a clock held');
        if (act._tag !== 'switch' && was === 'clock' && is === 'device')
          seen.add('on, a resume sounds');
      }
    }),
  ).pipe(Effect.provide(TestClock.layer()));

describe('Sound, as the current app’s score clock', () => {
  it('holds every generated history of play, pause, seek and switch to the clock', async () => {
    await current();
    const { scoreClock } = await import('@manna/hymnal-app/player/sound');
    const seeds = Array.from({ length: HISTORIES }, (_, index) => index + 1);
    await Effect.runPromise(
      Effect.forEach(seeds, (seed) => history(scoreClock, seed), { discard: true }),
    );
    expect([...seen].toSorted()).toEqual([
      'a seek moves the clock',
      'it ends',
      'off hands over',
      'on hands over',
      'on keeps a clock held',
      'on, a resume sounds',
      'the clock runs',
    ]);
  });
});
