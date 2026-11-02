/* oxlint-disable effect/noNewPromise, effect/noTernary, effect/noFixedWaitInTests, effect/noGlobals, effect/noNullish -- the fake One answers in promises as One's `Audio` does, and the fake's steps and the async file read settle on the host's event loop, which the TestClock does not move: each tick yields to it. */

/**
 * The player's `tempos` tells the device a turn of the held hymn's tempo,
 * and only that: a newly started hymn's play tells its own rate. With Sound
 * on and the recording playing, starting another hymn must not hand the old
 * recording the new hymn's rate while the new one loads (recrate B m5). The
 * stack is the one `LivePlayer` builds: `playerOn` over `cachedPlayback`
 * over `playbackOn` with a fake One that logs each call as it is issued,
 * and the offline fixture, its file read made async (as a phone's is) or
 * kept sync. Hymn 100 at 100 %, hymn 3 at 50 %. Nothing sounds; numbers only.
 */

import { Effect, Layer, Option, SubscriptionRef } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import { expect, it } from 'effect-bun-test';

import { Offline } from '~/offline/cache';
import { fake } from '~/offline/fixture';

import { cachedPlayback } from './offline';
import { playbackOn } from './playback.live';
import { Command, Playback, playerOn } from './player';

const timeline = { first: 5000, end: 240000, lines: [] };

/** One's shared audio session as `playbackOn` drives it: each call logged as issued, with the file then playing. */
const oneLogging = (log: Array<string>) => {
  let state: 'idle' | 'loading' | 'playing' = 'idle';
  let uri = '';
  const playing = () => uri.split('/').at(-1) ?? '';
  const status = () => ({ state, positionMs: 1000, durationMs: 120000 });
  const said = (then?: () => void) =>
    Promise.resolve().then(() => {
      then?.();
      return status();
    });
  return {
    audio: {
      setPlaybackRate: (rate: number) => {
        log.push(`rate ${rate} playing ${playing()}`);
        return said();
      },
      play: (next: string) => {
        log.push(`play ${next.split('/').at(-1)}`);
        return said(() => {
          uri = next;
          state = 'playing';
        });
      },
      pause: () => said(),
      resume: () => said(),
      seek: () => said(),
      getPlaybackStatus: () => said(),
      stop: () => said(),
      setNowPlayingInfo: () => Promise.resolve(),
      watchRemoteCommands: () => () => {},
    },
    network: {
      getState: () => Promise.resolve({ isConnected: true }),
      addStateListener: () => ({ remove: () => {} }),
    },
  };
};

const switching = (asyncRead: boolean) =>
  Effect.gen(function* () {
    const log: Array<string> = [];
    const fixture = fake();
    const one = oneLogging(log);
    const sound = yield* SubscriptionRef.make(true);
    const tempo100 = Atom.make(100).pipe(Atom.keepAlive);
    const tempo3 = Atom.make(50).pipe(Atom.keepAlive);
    const cache = Layer.effect(Offline)(
      Effect.gen(function* () {
        const offline = yield* Offline;
        return {
          ...offline,
          local: (id: Parameters<typeof offline.local>[0]) =>
            asyncRead
              ? Effect.promise(() => new Promise((done) => setTimeout(done, 5))).pipe(
                  Effect.andThen(offline.local(id)),
                )
              : offline.local(id),
        };
      }),
    ).pipe(Layer.provide(fixture.layer));
    const player = playerOn(
      cachedPlayback(
        // The fake One logs only the calls `playbackOn` makes.
        Layer.succeed(
          Playback,
          playbackOn(() => one as any, Option.none()),
        ),
        () => Option.some(timeline),
        sound,
        cache,
      ),
      250,
      undefined,
      (n: number) => (n === 3 ? tempo3 : tempo100),
    );
    const registry = yield* Effect.acquireRelease(
      Effect.sync(() => AtomRegistry.make()),
      (made) => Effect.sync(() => made.dispose()),
    );
    for (const value of Object.values(player))
      if (Atom.isAtom(value)) registry.mount<unknown>(value);
    const tick = Effect.gen(function* () {
      for (let i = 0; i < 20; i++) {
        yield* Effect.promise(() => new Promise((done) => setTimeout(done, 1)));
        yield* TestClock.adjust(50);
      }
    });
    registry.set(player.send, Command.Start({ track: { number: 100, title: 'Hymn 100' } }));
    yield* tick;
    log.push('start 3');
    registry.set(player.send, Command.Start({ track: { number: 3, title: 'Hymn 3' } }));
    yield* tick;
    log.push('turn 3');
    registry.set(tempo3, 70);
    yield* tick;
    return log;
  }).pipe(Effect.provide(TestClock.layer()));

/** The entries of `log` from `from` up to the first that starts with `until`. */
const between = (log: ReadonlyArray<string>, from: string, until: string) => {
  const after = log.slice(log.indexOf(from) + 1);
  const end = after.findIndex((entry) => entry.startsWith(until));
  return end < 0 ? after : after.slice(0, end);
};

for (const asyncRead of [false, true])
  it.live(
    `a new hymn's rate reaches the old recording only in its own play's step (file read ${asyncRead ? 'async' : 'sync'})`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const log = yield* switching(asyncRead);
          const toldBeforePlay = between(log, 'start 3', 'play 3')
            .filter((entry) => entry.startsWith('rate'))
            .map((entry) => entry.split(' playing ')[0]);
          const toldOnTurn = between(log, 'turn 3', '\u0000')
            .filter((entry) => entry.startsWith('rate'))
            .map((entry) => entry.split(' playing ')[0]);
          expect({
            toldBeforePlay,
            toldOnTurn,
            played: log.some((e) => e.startsWith('play 3')),
          }).toEqual({
            // The play's own rate, once, in the step that plays it.
            toldBeforePlay: ['rate 0.5'],
            // A turn of the held hymn's tempo still reaches the device.
            toldOnTurn: ['rate 0.7'],
            played: true,
          });
        }),
      ),
  );
