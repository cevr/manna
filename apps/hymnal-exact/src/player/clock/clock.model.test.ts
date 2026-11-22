/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/noAsyncFunction -- the current app's score clock is imported once, after the stand-ins its import graph needs; the port's side is one plain loop over the contract's calls, and a broken rule throws naming its seed and history as JSON. */

/**
 * `step`'s clock against the current app's score clock (`sound.ts`'s
 * `scoreClock`, imported, never copied), run under Effect's TestClock over
 * a device the test holds that moves with the clock at the rate it was
 * told: seeded histories of Play, Pause, Resume, a seek the bar sends,
 * Stop, the Sound switch, a turn of the tempo dial, a stanza chip and
 * `All`, the `Start` group's Intro and time going by, each given to both.
 * A play asks what the current player asks: the hymn's tempo's rate, its
 * stanzas, and the Intro as it stands as `intro` and `countIn`; a turn is
 * `setRate`, a choice `setStanzas`.
 *
 * The port runs as its contract runs it: its element answers each command
 * at once, plays at the rate it was told and tells its place at each of
 * `TICK`'s steps; near a span the choice leaves out the runner's clock
 * sends `due` as the element reaches its start (`playerSkipCheck`); while
 * the silent clock plays it is ticked every `TICK` ms and once more before
 * each of the reader's asks and each switch (`playerClock`, `playerAsk`).
 * After each step the port shows the clock's phase, place, length, rate and
 * count-in (its time left and its beat), and its element sounds exactly
 * while the current app's device does, the same recording at the same rate.
 *
 * Both hymns have the fixtures' timeline (first line at 0.5 s, end at 6.5 s,
 * 4/4 at 120 bpm, so a count-in is four beats of 500 ms) and a recording 8 s
 * long, so the recording holds every sung line and the silent clock ends
 * before the recording does. A pause is asked only while the bar offers
 * Pause, a seek only when the bar sends it (`sends`, the current scrub
 * rules), and none from a recording the device played to its end or to
 * its end, whose answer there is the device's own. A Play of an ended hymn with the Intro
 * off is a new play, as the current player's `Ended` resume loads one.
 */

import { describe, expect, it } from 'bun:test';
import { sends } from '@manna/hymnal-app/player/scrub-rules';
import type {
  PlaybackApi,
  PlayOptions,
  scoreClock as ScoreClock,
  Told,
} from '@manna/hymnal-app/player/sound';
import { keptOf, toggle } from '@manna/hymnal-app/player/stanzas';
import { STOPS, rateOf } from '@manna/hymnal-app/player/tempo';
import { Clock, Effect, Option, Stream, SubscriptionRef } from 'effect';
import { TestClock } from 'effect/testing';

import { type Random, below, pick, seeded } from '../../test/random.ts';
import { current } from '../current.testing.ts';
import { SECTIONS, TIMELINE, TRACKS, titleOf } from '../fixtures.testing.ts';
import { type Command, type Input, type State, deviceOf, initial, step } from '../step.ts';
import { viewOf } from '../view.ts';

const HISTORIES = 100;
/**
 * How long the test clock waits on a fiber it woke before going on, in real
 * ms: a woken skipper whose race is still unwinding is settled by the next
 * step anyway, so the default second is only real time lost.
 */
const WARN = 5;
const STEPS = 40;
/** How often the contract ticks the silent clock and the element tells its place, in ms. */
const TICK = 250;
/**
 * The least step of the test clock, in ms: a sleep due sooner than this after
 * the last is run this much later, so the current skipper's wait for a span's
 * start, which a floating place can leave a hair short of it, ends.
 */
const NUDGE = 0.01;
/** How near the port's place keeps to the current clock's, in seconds: what `NUDGE` can move a recording at the fastest stop. */
const PLACE = 1e-4;
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
  | { readonly _tag: 'tempo'; readonly at: number }
  | { readonly _tag: 'stanza'; readonly stanza: number }
  | { readonly _tag: 'all' }
  | { readonly _tag: 'intro' }
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
    () => ({ _tag: 'tempo', at: below(random, STOPS.length) }),
    () => ({ _tag: 'tempo', at: pick(random, [0, 5, 10, 15, 20]) }),
    () => ({ _tag: 'stanza', stanza: 1 + below(random, 3) }),
    () => ({ _tag: 'all' }),
    () => ({ _tag: 'intro' }),
    () => ({ _tag: 'wait', ms: TICK * (1 + below(random, 16)) }),
    () => ({ _tag: 'wait', ms: TICK * (1 + below(random, 4)) }),
    () => ({ _tag: 'wait', ms: TICK * (1 + below(random, 4)) }),
  ])();

/** A device holding a recording `length` ms long that moves with the clock at its rate while it plays. */
const recording = (length: number) => {
  let state: Told['state'] = 'idle';
  let at = 0;
  let since = 0;
  let rate = 1;
  let uri = '';
  const read = Effect.map(Clock.currentTimeMillis, (now): Told => {
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
  const api: PlaybackApi = {
    play: (source, fromMs, options) =>
      then(() => {
        uri = source;
        at = fromMs;
        rate = options?.rate ?? 1;
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
    setRate: (to) =>
      Effect.asVoid(
        then(() => {
          rate = to;
        }),
      ),
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
  return { api, rate: () => rate, uri: () => uri };
};

/** The port as its contract runs it: the step, its one element, the runner's clock's `due` and the silent clock's ticks. */
const portOf = () => {
  let state: State = initial;
  let element:
    | { load: number; at: number; playing: boolean; rate: number; url: string }
    | undefined;
  let now = 0;
  let base = 0;
  let ticking = false;
  let skips = 0;
  const inbox: Array<Input> = [];
  const seekOf = () => state.held?.seek ?? 0;
  const obey = (command: Command | undefined) => {
    if (command?._tag === 'load') {
      element = {
        load: command.id,
        at: command.from,
        playing: false,
        rate: command.rate,
        url: command.url,
      };
      inbox.push({ _tag: 'loaded', id: command.id, duration: RECORDING });
    } else if (command?._tag === 'unload') element = undefined;
    else if (command?._tag === 'rate' && element !== undefined) element.rate = command.rate;
    else if (command?._tag === 'seek' && element !== undefined) {
      if (command.skip) skips += 1;
      element.at = command.seconds;
      inbox.push({ _tag: 'seeked', id: element.load, serial: command.serial });
      inbox.push({ _tag: 'time', id: element.load, serial: command.serial, seconds: element.at });
      if (element.playing && element.at >= RECORDING) {
        element.playing = false;
        inbox.push({ _tag: 'ended', id: element.load });
      }
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
  /** The element plays on `ms` of the host's clock, `due` sent as it reaches a span's start. */
  const play = (ms: number) => {
    let left = ms;
    for (let guard = 0; guard < 8; guard += 1) {
      if (element?.playing !== true) break;
      const skipAt = viewOf(state, undefined, titleOf).skipAt;
      if (skipAt < 0) break;
      const dt = ((skipAt - element.at) * 1000) / element.rate;
      if (dt > left) break;
      element.at = skipAt;
      left -= dt;
      feed({ _tag: 'due', id: element.load, serial: seekOf(), seconds: skipAt });
      drain();
    }
    if (element?.playing !== true) return;
    element.at = Math.min(element.at + (left * element.rate) / 1000, RECORDING);
    inbox.push({ _tag: 'time', id: element.load, serial: seekOf(), seconds: element.at });
    if (element.at >= RECORDING) {
      element.playing = false;
      inbox.push({ _tag: 'ended', id: element.load });
    }
  };
  return {
    state: () => state,
    sounds: () => element?.playing ?? false,
    element: () => element,
    skips: () => skips,
    ask: (input: Input) => {
      tick();
      feed(input);
      drain();
    },
    wait: (ms: number) => {
      for (let gone = 0; gone < ms; gone += TICK) {
        now += TICK;
        play(TICK);
        drain();
        tick();
      }
    },
  };
};

/** Let the score clock's fibers run what the last change woke: its switch's hand-over, its beats. */
const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, { discard: true });

/** The test clock's sleeps, by the time each is due: its own field, which its interface does not name. */
interface Sleeping {
  readonly sleeps: ReadonlyArray<{ readonly timestamp: number }>;
}

/**
 * `ms` of the test clock, set to each sleep's deadline on the way and settled
 * there, so a fiber a sleep wakes (the skipper, the count-in's ticker) runs
 * at its deadline, not at the end of the step that passed it.
 */
const advance = (ms: number) =>
  TestClock.testClockWith((clock) =>
    Effect.gen(function* () {
      yield* settle;
      const end = clock.currentTimeMillisUnsafe() + ms;
      for (let guard = 0; guard < 64; guard += 1) {
        const { sleeps } = clock as unknown as Sleeping;
        const next = Math.min(...sleeps.map((sleep) => sleep.timestamp));
        const due = Math.min(end, Math.max(next, clock.currentTimeMillisUnsafe() + NUDGE));
        yield* TestClock.setTime(due);
        yield* settle;
        if (due >= end) return;
        yield* TestClock.setTime(Math.min(end, due + NUDGE));
        yield* settle;
      }
      yield* TestClock.setTime(end);
      yield* settle;
    }),
  );

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
        device.api,
        (hymn) => (urlOf(hymn) === '' ? Option.none() : Option.some(TIMELINE)),
        sound,
        (_hymn, stanzas) => keptOf(SECTIONS, stanzas),
      );
      let beat: Option.Option<{ readonly index: number; readonly of: number }> = Option.none();
      yield* Effect.forkScoped(
        Stream.runForEach(api.beats ?? Stream.empty, (to) =>
          Effect.sync(() => {
            beat = to;
          }),
        ),
      );
      yield* settle;
      const port = portOf();
      let on = true;
      let intro = true;
      let held: number | undefined;
      const tempos = new Map<number, number>();
      const choices = new Map<number, ReadonlyArray<number>>();
      const optionsOf = (number: number): PlayOptions => ({
        continuous: false,
        ready: false,
        intent: 'play',
        rate: rateOf(tempos.get(number) ?? 100),
        stanzas: choices.get(number) ?? [],
        intro,
        countIn: intro,
      });
      const acts: Array<Act> = [];
      for (let index = 0; index < STEPS; index += 1) {
        const act = actOf(random);
        acts.push(act);
        const shown = viewOf(port.state(), undefined, titleOf);
        const skipped = port.skips();
        const again = (number: number) =>
          shown.phase === 'ended' && !intro
            ? api.play(urlOf(number), 0, optionsOf(number))
            : api.resume;
        switch (act._tag) {
          case 'play': {
            const track = TIMED.find((each) => each.number === act.number);
            if (track === undefined) break;
            port.ask({ _tag: 'play', track });
            yield* held === act.number
              ? again(act.number)
              : api.play(track.url, 0, optionsOf(act.number));
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
            yield* again(held);
            break;
          case 'seek': {
            const silent = port.state().held?.silent === true;
            if (held === undefined || (shown.phase === 'ended' && !silent)) break;
            const to = Math.min(Math.max(act.seconds, 0), shown.length);
            if (!sends(shown.at, to)) break;
            const track = port.state().held?.track;
            const choice = choices.get(held) ?? [];
            if (!silent && (track?.score.recording(choice, to) ?? 0) >= RECORDING) break;
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
          case 'tempo': {
            if (held === undefined) break;
            const tempo = STOPS[act.at] ?? 100;
            tempos.set(held, tempo);
            port.ask({ _tag: 'tempo', at: act.at });
            yield* api.setRate?.(rateOf(tempo)) ?? Effect.void;
            yield* settle;
            if (shown.phase === 'playing') seen.add('a turn mid-play');
            break;
          }
          case 'stanza':
          case 'all': {
            if (held === undefined) break;
            const was = choices.get(held) ?? [];
            const choice = act._tag === 'all' ? [] : toggle(was, act.stanza, 3);
            choices.set(held, choice);
            port.ask(
              act._tag === 'all'
                ? { _tag: 'chooseAll' }
                : { _tag: 'chooseStanza', stanza: act.stanza },
            );
            yield* api.setStanzas?.(choice) ?? Effect.void;
            yield* settle;
            break;
          }
          case 'intro':
            intro = !intro;
            port.ask({ _tag: 'start', intro });
            break;
          case 'wait':
            port.wait(act.ms);
            yield* advance(act.ms);
            break;
        }
        const view = viewOf(port.state(), undefined, titleOf);
        const close = (a: number, b: number) => Math.abs(a - b) <= PLACE;
        const fail = (
          rule: string,
          told: Told | number | boolean | string | { readonly index: number } | undefined,
        ) => {
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
          if (!close(view.at, told.positionMs / 1000)) fail('place', told);
          if (Math.abs(view.length - (told.durationMs ?? 0) / 1000) > 1e-6) fail('length', told);
          if (Math.abs(view.rate - (told.rate ?? 1)) > 1e-9) fail('rate', told);
          if (view.count.on !== (told.countInMs !== undefined)) fail('counting', told);
          if (view.count.on && Math.abs(view.count.left - (told.countInMs ?? 0)) > 1e-6)
            fail('count left', told);
          const counted = Option.getOrUndefined(beat);
          if (
            view.count.on &&
            (counted?.index !== view.count.beat || counted.of !== view.count.beats)
          )
            fail('beat', counted);
          if (view.count.on && view.count.beat > 0) seen.add('a count-in counts');
          if (act._tag === 'wait' && shown.count.on && !view.count.on && view.at > shown.at)
            seen.add('a count-in ends and the place runs');
        }
        const sounding = (yield* device.api.status).state === 'playing';
        if (sounding !== port.sounds()) fail('sounds only while the device does', sounding);
        if (!on && port.sounds()) fail('nothing sounds with Sound off', undefined);
        const element = port.element();
        if (sounding && element !== undefined) {
          if (Math.abs(element.rate - device.rate()) > 1e-9)
            fail('the element’s rate', device.rate());
          if (element.url !== device.uri()) fail('the element’s source', device.uri());
          if (element.rate !== 1) seen.add('a recording plays at a tempo');
        }
        const was = shown.held ? (shown.src === '' ? 'clock' : 'device') : 'none';
        const is = view.held ? (view.src === '' ? 'clock' : 'device') : 'none';
        if (act._tag === 'wait' && is === 'clock' && view.at > shown.at) seen.add('the clock runs');
        if (act._tag === 'wait' && is === 'clock' && view.rate !== 1 && view.at > shown.at)
          seen.add('the clock runs at a tempo');
        if (act._tag === 'wait' && is === 'clock' && view.phase === 'ended') seen.add('it ends');
        if (act._tag === 'seek' && is === 'clock') seen.add('a seek moves the clock');
        if (act._tag === 'switch' && was === 'device' && is === 'clock') seen.add('off hands over');
        if (act._tag === 'switch' && was === 'clock' && is === 'device') seen.add('on hands over');
        if (act._tag === 'switch' && was === 'clock' && is === 'clock' && on)
          seen.add('on keeps a clock held');
        if (act._tag !== 'switch' && was === 'clock' && is === 'device')
          seen.add('on, a resume sounds');
        if (
          act._tag === 'play' &&
          is === 'device' &&
          !intro &&
          view.place === TIMELINE.first / 1000
        )
          seen.add('intro off starts at the first sung line');
        if (act._tag === 'wait' && port.skips() > skipped) seen.add('a skip');
      }
    }),
  ).pipe(Effect.provide(TestClock.layer({ warningDelay: WARN })));

describe('the player’s clock, as the current app’s score clock', () => {
  it('holds every generated history of play, pause, seek, switch, tempo, stanzas and intro to the clock', async () => {
    await current();
    const { scoreClock } = await import('@manna/hymnal-app/player/sound');
    const seeds = Array.from({ length: HISTORIES }, (_, index) => index + 1);
    await Effect.runPromise(
      Effect.forEach(seeds, (seed) => history(scoreClock, seed), { discard: true }),
    );
    expect([...seen].toSorted()).toEqual([
      'a count-in counts',
      'a count-in ends and the place runs',
      'a recording plays at a tempo',
      'a seek moves the clock',
      'a skip',
      'a turn mid-play',
      'intro off starts at the first sung line',
      'it ends',
      'off hands over',
      'on hands over',
      'on keeps a clock held',
      'on, a resume sounds',
      'the clock runs',
      'the clock runs at a tempo',
    ]);
  });
});
