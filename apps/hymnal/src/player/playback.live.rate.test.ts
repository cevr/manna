import { Effect, Fiber, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';

import { type Device, playbackOn } from './playback.live';

const URI = 'https://hymns.cvr.im/audio/sdah/100.mp3';
const TEMPI = Array.from({ length: 21 }, (_, i) => 50 + 5 * i);
const AGAIN = 100;

const fake = () => {
  const asked = new Array<string>();
  const sought = new Array<number>();
  const held = { refusing: false };
  const status = { state: 'loading', positionMs: 0 } as const;
  const said = (call: string) =>
    Effect.runPromise(
      Effect.sync(() => {
        asked.push(call);
        return status;
      }),
    );
  const device: Device = {
    audio: {
      setPlaybackRate: (rate) => said(`rate ${rate}`),
      play: (uri) => said(`play ${uri}`),
      pause: () => said('pause'),
      resume: () => said('resume'),
      seek: (positionMs) =>
        Effect.runPromise(
          Effect.suspend(() => {
            asked.push(`seek ${positionMs}`);
            sought.push(positionMs);
            if (held.refusing) return Effect.fail('E_AUDIO_STATE: not ready');
            return Effect.succeed({ state: 'playing', positionMs } as const);
          }),
        ),
      getPlaybackStatus: () => said('status'),
      stop: () => Effect.runPromise(Effect.sync(() => void asked.push('stop'))),
      setNowPlayingInfo: () => Effect.runPromise(Effect.sync(() => void asked.push('announce'))),
      watchRemoteCommands: () => () => {},
    },
    network: {
      getState: () => Effect.runPromise(Effect.succeed({ isConnected: true } as never)),
      addStateListener: () => ({ remove: () => {} }),
    },
  };
  return { asked, sought, held, device };
};

const rateBefore = (asked: ReadonlyArray<string>, uri: string) =>
  Option.fromNullishOr(
    asked
      .slice(0, asked.lastIndexOf(`play ${uri}`))
      .filter((call) => call.startsWith('rate '))
      .at(-1),
  );

const settle = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, {
  discard: true,
});

describe('the live playback at a tempo', () => {
  it.effect('tells One the rate before each play, for every tempo of the dial', () =>
    Effect.gen(function* () {
      for (const tempo of TEMPI) {
        const { asked, device } = fake();
        const playback = playbackOn(() => device, Option.none());
        const rate = tempo / 100;
        yield* playback.play(URI, 0, { continuous: false, ready: false, rate });
        expect(asked.includes(`play ${URI}`)).toBe(true);
        expect(rateBefore(asked, URI)).toEqual(Option.some(`rate ${rate}`));
      }
    }),
  );

  it.effect('plays at 1 when a play names no rate, after one at 0.8', () =>
    Effect.gen(function* () {
      const { asked, device } = fake();
      const playback = playbackOn(() => device, Option.none());
      yield* playback.play(URI, 0, { continuous: false, ready: false, rate: 0.8 });
      const next = 'https://hymns.cvr.im/audio/sdah/101.mp3';
      yield* playback.play(next, 0);
      expect(rateBefore(asked, next)).toEqual(Option.some('rate 1'));
    }),
  );

  it.effect('tells One a tempo turned while it holds the recording, with no new play', () =>
    Effect.gen(function* () {
      const { asked, device } = fake();
      const playback = playbackOn(() => device, Option.none());
      yield* playback.play(URI, 0, { continuous: false, ready: false, rate: 0.8 });
      const setRate = Option.getOrThrow(Option.fromNullishOr(playback.setRate));
      const plays = asked.filter((call) => call.startsWith('play ')).length;
      yield* setRate(1.25);
      expect(asked.at(-1)).toBe('rate 1.25');
      expect(asked.filter((call) => call.startsWith('play ')).length).toBe(plays);
    }),
  );

  it.effect('runs a hand-over’s retained place on at the play’s rate until One lands it', () =>
    Effect.gen(function* () {
      const { sought, held, device } = fake();
      const playback = playbackOn(() => device, Option.none());
      held.refusing = true;
      const playing = yield* Effect.forkChild(
        playback.play(URI, 30_000, { continuous: true, ready: true, rate: 0.8 }),
        { startImmediately: true },
      );
      yield* settle;
      for (let k = 0; k < 10; k += 1) {
        yield* TestClock.adjust(AGAIN);
        yield* settle;
      }
      held.refusing = false;
      yield* TestClock.adjust(AGAIN);
      yield* settle;
      yield* Fiber.join(playing);
      expect(sought.map(Math.round)).toEqual(Array.from({ length: 12 }, (_, k) => 30_000 + 80 * k));
    }),
  );
});
