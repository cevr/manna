/**
 * A play after the end obeys `Intro` however it is asked (spec Risk 3,
 * Decided 9): Sound on, hymn 116 played to its end, then the in-app Resume,
 * or a lock-screen Play the phone acts on first (it starts the ended
 * recording again from 0:00, then the app hears `Remote.Play`). With
 * `Intro` off, at most one poll of the recording below the first sung line
 * sounds after the press; with it on, the intro sounds as the recording
 * plays from 0:00.
 *
 * On the TestClock with a fake device: nothing sounds. Hymn numbers and ms only.
 */

import {
  Clock,
  Effect,
  Layer,
  Match,
  Option,
  Queue,
  References,
  Stream,
  SubscriptionRef,
} from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import bundled from 'virtual:hymnal-timing';

import { timingBook } from '~/follow/timeline';
import { still } from '~/hymns/chords';

import {
  Command,
  Playback,
  type PlaybackApi,
  playerOn,
  Remote,
  type Status,
  statusEvery,
} from './player';
import { soundOn } from './sound';

const book = timingBook(bundled);
const POLL = 250;
const HYMN = 116;
const TAIL = 1500;

/** A device whose recording plays in host time, keeping each span it sounds, and the phone's own play of a lock-screen press. */
const recorded = (length: number, presses: Queue.Queue<Remote>) => {
  const heard = new Array<{ readonly from: number; readonly to: number; readonly now: number }>();
  let state: Status['state'] = 'idle';
  let at = 0;
  let since = 0;
  const read = Effect.map(Clock.currentTimeMillis, (now): Status => {
    if (state === 'playing') {
      const to = Math.min(length, at + (now - since));
      if (to > at) heard.push({ from: at, to, now });
      at = to;
    }
    since = now;
    if (state === 'playing' && at >= length) state = 'ended';
    return { state, positionMs: Math.floor(at), durationMs: length };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  /** What the phone does on a play of an ended recording: it starts again from 0:00. */
  const restart = () => {
    if (state === 'ended') at = 0;
    state = 'playing';
  };
  const device: PlaybackApi = {
    play: (_uri, fromMs) =>
      then(() => {
        state = 'playing';
        at = fromMs;
      }),
    pause: then(() => {
      state = 'paused';
    }),
    resume: then(restart),
    seek: (ms) =>
      then(() => {
        at = ms;
      }),
    status: read,
    setRate: () => Effect.void,
    stop: Effect.asVoid(
      then(() => {
        state = 'idle';
      }),
    ),
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.fromQueue(presses),
  };
  return { device, heard, lockPlay: Effect.asVoid(then(restart)) };
};

const settle = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, {
  discard: true,
});

/** Hymn 116 played with Sound on to its end, `Intro` as given; then a play asked `via`; the ms heard below its first sung line after it. */
const heardAfterTheEnd = (intro: boolean, via: 'in-app' | 'lock-screen') =>
  Effect.gen(function* () {
    const timeline = Option.getOrThrow(book.of(HYMN));
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const presses = yield* Queue.unbounded<Remote>();
    const fake = recorded(timeline.end + TAIL, presses);
    const sound = yield* SubscriptionRef.make(true);
    const playback = soundOn(Layer.succeed(Playback, fake.device), book.of, sound).pipe(
      Layer.provide(clockLayer),
    );
    const layer = Layer.mergeAll(
      playback,
      clockLayer,
      Layer.succeed(References.MinimumLogLevel, 'None'),
    );
    const every = Atom.make<ReadonlyArray<number>>([]).pipe(Atom.keepAlive);
    const move = Atom.make(still).pipe(Atom.keepAlive);
    const tempo = Atom.make(100).pipe(Atom.keepAlive);
    const on = Atom.make(intro).pipe(Atom.keepAlive);
    const player = playerOn(
      layer,
      statusEvery,
      () => move,
      () => tempo,
      () => every,
      on,
    );
    const registry = AtomRegistry.make();
    registry.mount(player.send);
    registry.mount(player.remote);
    for (const key of Object.values(player)) if (Atom.isAtom(key)) registry.mount<unknown>(key);
    const send = (command: Command) =>
      Effect.andThen(
        Effect.sync(() => registry.set(player.send, command)),
        Effect.andThen(settle, Clock.currentTimeMillis),
      );
    const walk = (ms: number) =>
      Effect.gen(function* () {
        for (let t = 0; t < ms; t += POLL) {
          yield* TestClock.adjust(POLL);
          yield* settle;
        }
      });
    yield* send(Command.Start({ track: { number: HYMN, title: `Hymn ${HYMN}` } }));
    yield* walk(1000);
    yield* send(Command.Seek({ seconds: (timeline.end - 2000) / 1000 }));
    yield* walk(6000);
    const lockScreen = fake.lockPlay.pipe(
      Effect.andThen(Queue.offer(presses, Remote.Play())),
      Effect.andThen(settle),
      Effect.andThen(Clock.currentTimeMillis),
    );
    const t = yield* Match.value(via).pipe(
      Match.when('in-app', () => send(Command.Resume())),
      Match.orElse(() => lockScreen),
    );
    yield* walk(6000);
    registry.dispose();
    return Math.round(
      fake.heard
        .filter((span) => span.now >= t)
        .reduce((sum, span) => sum + Math.max(0, Math.min(span.to, timeline.first) - span.from), 0),
    );
  });

describe('a play after the end, Sound on', () => {
  it.effect(
    'with Intro off, sounds at most one poll below the first sung line, in the app or from the lock screen',
    () =>
      Effect.gen(function* () {
        const heard = {
          inApp: yield* heardAfterTheEnd(false, 'in-app'),
          lockScreen: yield* heardAfterTheEnd(false, 'lock-screen'),
        };
        expect({ inApp: heard.inApp <= POLL, lockScreen: heard.lockScreen <= POLL, heard }).toEqual(
          {
            inApp: true,
            lockScreen: true,
            heard,
          },
        );
      }),
  );

  it.effect('with Intro on, sounds the intro from the lock screen', () =>
    Effect.gen(function* () {
      expect(yield* heardAfterTheEnd(true, 'lock-screen')).toBeGreaterThan(5000);
    }),
  );
});
