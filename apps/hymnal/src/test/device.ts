import { Effect, Layer, Match, Option, Queue, Stream, SubscriptionRef } from 'effect';

import { type Announcement, Playback, PlaybackError, Remote, type Status } from '../player/player';

const sounds = 3;

export const fakeDevice = () => {
  const remote = Effect.runSync(Queue.unbounded<Remote>());
  const connection = Effect.runSync(SubscriptionRef.make(true));
  const reads = Effect.runSync(Queue.unbounded<true>());
  let now: Status = { state: 'idle', positionMs: 0 };
  let fresh = false;
  let landings = new Array<{ readonly to: number; readonly answer: (status: Status) => void }>();
  const device = {
    get now(): Status {
      return now;
    },
    set now(next: Status) {
      fresh = next.state === 'playing' && next.positionMs >= sounds;
      now = next;
      const landed = landings.filter((it) => Math.abs(it.to - next.positionMs) <= 2);
      landings = landings.filter((it) => !landed.includes(it));
      for (const it of landed) it.answer(said(next));
    },
    get online() {
      return Effect.runSync(SubscriptionRef.get(connection));
    },
    set online(online: boolean) {
      Effect.runSync(SubscriptionRef.set(connection, online));
    },
    played: new Array<string>(),
    sought: new Array<number>(),
    lagging: false,
    waiting: 0,
    advancing: false,
    announced: new Array<Announcement>(),
    reads: (n: number) =>
      Queue.clear(reads).pipe(
        Effect.andThen(Effect.forEach(Array.from({ length: n }), () => Queue.take(reads))),
        Effect.asVoid,
      ),
    stopped: 0,
    press: (kind: 'play' | 'pause', next: Status) => {
      device.now = next;
      Queue.offerUnsafe(
        remote,
        Match.value(kind).pipe(
          Match.when('play', () => Remote.Play()),
          Match.orElse(() => Remote.Pause()),
        ),
      );
    },
  };
  const said = (status: Status): Status =>
    Option.match(
      Option.liftPredicate(status, () => device.waiting > 0),
      { onNone: () => status, onSome: (waiting) => ({ ...waiting, state: 'loading' }) },
    );
  const at = (next: Status) =>
    Effect.sync(() => {
      device.now = next;
      return said(next);
    });
  const layer = Layer.succeed(
    Playback,
    Playback.of({
      play: (uri, fromMs) =>
        Effect.suspend(() => {
          device.played.push(uri);
          if (!device.online) {
            return Effect.fail(
              PlaybackError.make({
                operation: 'play',
                message: 'The Internet connection appears to be offline.',
              }),
            );
          }
          return at({ state: 'loading', positionMs: fromMs });
        }),
      pause: Effect.suspend(() => at({ ...device.now, state: 'paused' })),
      resume: Effect.suspend(() =>
        at({
          ...device.now,
          state: 'playing',
          positionMs: Match.value(device.now).pipe(
            Match.when({ state: 'ended' }, () => 0),
            Match.orElse((now) => now.positionMs),
          ),
        }),
      ),
      seek: (positionMs) =>
        Effect.suspend(() => {
          device.sought.push(positionMs);
          return Match.value(device.lagging).pipe(
            Match.when(true, () =>
              Effect.callback<Status>((resume) => {
                const landing = {
                  to: positionMs,
                  answer: (status: Status) => resume(Effect.succeed(status)),
                };
                landings.push(landing);
                return Effect.sync(() => {
                  landings = landings.filter((it) => it !== landing);
                });
              }),
            ),
            Match.orElse(() => at({ ...device.now, positionMs })),
          );
        }),
      status: Effect.sync(() => {
        Queue.offerUnsafe(reads, true);
        const read = said(device.now);
        if (device.advancing && now.state === 'playing')
          now = { ...now, positionMs: now.positionMs + sounds };
        device.waiting = Math.max(0, device.waiting - 1);
        if (!fresh || read.state !== 'playing') return read;
        fresh = false;
        return { ...read, state: 'loading', positionMs: read.positionMs - sounds } satisfies Status;
      }),
      stop: Effect.sync(() => {
        device.stopped += 1;
        device.now = { state: 'idle', positionMs: 0 };
      }),
      connection: SubscriptionRef.changes(connection),
      announce: (announcement) => Effect.sync(() => void device.announced.push(announcement)),
      remote: Stream.fromQueue(remote),
    }),
  );
  return { device, layer };
};
