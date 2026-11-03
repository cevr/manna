import { Clock, Duration, Effect, Layer, Match, Option, Queue, Stream } from 'effect';
import { One } from 'one';
import { Platform } from 'react-native';

import { clockAt, placeOf, type Clock as Run } from '../follow/clock';
import {
  Playback,
  type PlaybackApi,
  PlaybackError,
  type PlayOptions,
  Remote,
  type Status,
  type Intent,
} from './player';

export interface Device {
  readonly audio: Pick<
    typeof One.Audio,
    | 'setPlaybackRate'
    | 'play'
    | 'pause'
    | 'resume'
    | 'seek'
    | 'stop'
    | 'getPlaybackStatus'
    | 'setNowPlayingInfo'
    | 'watchRemoteCommands'
  >;
  readonly network: Pick<typeof One.Network, 'getState' | 'addStateListener'>;
}

export type Session = Pick<MediaSession, 'setActionHandler'>;

const askAgainAfter = Duration.millis(100);

const holdsRecording = (status: Status) =>
  status.state === 'loading' || status.state === 'playing' || status.state === 'paused';

const awaitsPlay = (status: Status) => status.state === 'paused' || status.state === 'loading';

const rateOf = (options?: PlayOptions) => options?.rate ?? 1;

const call = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => PlaybackError.make({ operation, message: String(cause) }),
  });

export const playbackOn = (device: () => Device, session: Option.Option<Session>): PlaybackApi => {
  const audio = () => device().audio;
  let turn = 0;
  let wants: Intent = 'play';
  let heldForLanding = false;
  let rate = 1;
  const paused = () => wants === 'pause';
  let retained: Option.Option<{ readonly clock: Run; readonly continuous: boolean }> =
    Option.none();
  const retainedStatus = (status: Status) =>
    Effect.map(Clock.currentTimeMillis, (now): Status =>
      Option.match(retained, {
        onNone: () => status,
        onSome: ({ clock }) => ({ ...status, replacementMs: placeOf(clock, now) }),
      }),
    );
  const stale = () =>
    PlaybackError.make({ operation: 'superseded', message: 'newer playback owns the session' });
  const pressed = Effect.runSync(Queue.unbounded<Remote>());
  const tell = (remote: Remote) => void Queue.offerUnsafe(pressed, remote);
  const own = () =>
    Option.map(session, (it) => {
      it.setActionHandler('play', () => tell(Remote.Play()));
      it.setActionHandler('pause', () => tell(Remote.Pause()));
      it.setActionHandler('seekto', (details) =>
        tell(Remote.Seek({ seconds: Option.fromNullishOr(details.seekTime) })),
      );
    });
  const native = Stream.callback<Remote>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        audio().watchRemoteCommands((event) =>
          Queue.offerUnsafe(
            queue,
            Match.value(event.type).pipe(
              Match.when('play', () => Remote.Play()),
              Match.when('pause', () => Remote.Pause()),
              Match.orElse(() =>
                Remote.Seek({
                  seconds: Option.map(Option.fromNullishOr(event.positionMs), (ms) => ms / 1000),
                }),
              ),
            ),
          ),
        ),
      ),
      (stop) => Effect.sync(stop),
    ),
  );
  const connection = Stream.callback<boolean>((queue) =>
    Effect.gen(function* () {
      const early = new Array<boolean>();
      let tell = (online: boolean) => void early.push(online);
      yield* Effect.acquireRelease(
        Effect.sync(() => device().network.addStateListener((state) => tell(state.isConnected))),
        (subscription) => Effect.sync(() => subscription.remove()),
      );
      const now = yield* call('connection', () => device().network.getState()).pipe(
        Effect.map((state) => state.isConnected),
        Effect.orElseSucceed(() => true),
      );
      for (const online of [now, ...early]) Queue.offerUnsafe(queue, online);
      tell = (online) => void Queue.offerUnsafe(queue, online);
    }),
  );
  const landAt = (
    fromMs: number,
    owner: number,
    holdDuringLoad: boolean,
  ): Effect.Effect<Status, PlaybackError> =>
    Effect.gen(function* () {
      if (owner !== turn) return yield* stale();
      const now = yield* Clock.currentTimeMillis;
      const to = Option.match(retained, {
        onNone: () => fromMs,
        onSome: ({ clock }) => placeOf(clock, now),
      });
      return yield* call('seek', () => audio().seek(to));
    }).pipe(
      Effect.catchTag('PlaybackError', (refused) =>
        Effect.suspend(() => {
          if (owner !== turn) return Effect.fail(stale());
          return Effect.gen(function* () {
            const status = yield* call('status', () => audio().getPlaybackStatus()).pipe(
              Effect.filterOrFail(holdsRecording, () => refused),
            );
            if (owner !== turn) return yield* stale();
            if (holdDuringLoad && (!heldForLanding || status.state === 'playing')) {
              yield* call('pause', () => audio().pause()).pipe(
                Effect.filterOrFail(holdsRecording, () => refused),
              );
              if (owner !== turn) return yield* stale();
              heldForLanding = true;
            }
            yield* Effect.sleep(askAgainAfter);
            return yield* landAt(fromMs, owner, holdDuringLoad);
          });
        }),
      ),
    );
  const playAt = (uri: string, to: number) =>
    Effect.try({
      try: () => {
        const rated = audio().setPlaybackRate(to);
        const playing = audio().play(uri);
        own();
        return { rated, playing };
      },
      catch: (cause) => PlaybackError.make({ operation: 'play', message: String(cause) }),
    }).pipe(
      Effect.flatMap(({ rated, playing }) =>
        Effect.all([call('rate', () => rated), call('play', () => playing)], {
          concurrency: 'unbounded',
        }),
      ),
      Effect.map(([, played]) => played),
    );
  return Playback.of({
    play: (uri, fromMs, options) =>
      Effect.gen(function* () {
        const owner = ++turn;
        heldForLanding = false;
        wants = options?.intent ?? 'play';
        rate = rateOf(options);
        const began = yield* Clock.currentTimeMillis;
        retained = Option.liftPredicate(
          {
            clock: clockAt(fromMs, options?.continuous === true && !paused(), began, rate),
            continuous: options?.continuous === true,
          },
          () => options?.ready === true || options?.continuous === true,
        );
        const status = yield* playAt(uri, rate);
        if (owner !== turn) {
          if (fromMs > 0) return yield* stale();
          return status;
        }
        let landed = status;
        if (fromMs > 0 || options?.ready)
          landed = yield* landAt(fromMs, owner, Option.isSome(retained));
        if (owner !== turn) return landed;
        if (heldForLanding && !paused() && awaitsPlay(landed))
          landed = yield* call('resume', () => audio().resume());
        if (owner !== turn) return landed;
        heldForLanding = false;
        landed = yield* retainedStatus(landed);
        retained = Option.none();
        if ((options?.ready || options?.continuous) && paused())
          return yield* call('pause', () => audio().pause());
        return landed;
      }).pipe(
        Effect.catchTag('PlaybackError', (error) =>
          Effect.gen(function* () {
            if (error.operation === 'superseded' || Option.isNone(retained)) return yield* error;
            return yield* PlaybackError.make({
              operation: error.operation,
              message: error.message,
              positionMs: placeOf(retained.value.clock, yield* Clock.currentTimeMillis),
            });
          }),
        ),
      ),
    pause: Effect.gen(function* () {
      wants = 'pause';
      const now = yield* Clock.currentTimeMillis;
      retained = Option.map(retained, (run) => ({
        ...run,
        clock: clockAt(placeOf(run.clock, now), false, now, rate),
      }));
      return yield* call('pause', () => audio().pause());
    }),
    resume: Effect.gen(function* () {
      wants = 'play';
      const now = yield* Clock.currentTimeMillis;
      retained = Option.map(retained, (run) => ({
        ...run,
        clock: clockAt(placeOf(run.clock, now), run.continuous, now, rate),
      }));
      return yield* call('resume', () => audio().resume());
    }),
    seek: (positionMs) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        retained = Option.map(retained, () => ({
          clock: clockAt(positionMs, false, now, rate),
          continuous: false,
        }));
        return yield* call('seek', () => audio().seek(positionMs));
      }),
    setRate: (to) =>
      Effect.gen(function* () {
        const owner = turn;
        yield* call('rate', () => audio().setPlaybackRate(to));
        if (owner !== turn) return;
        const now = yield* Clock.currentTimeMillis;
        rate = to;
        retained = Option.map(retained, (run) => ({
          ...run,
          clock: clockAt(placeOf(run.clock, now), run.clock.playing, now, to),
        }));
      }).pipe(
        Effect.catchTag('PlaybackError', (error) =>
          Effect.logWarning(`[playback] rate.failed rate=${to} message=${error.message}`),
        ),
      ),
    status: call('status', () => audio().getPlaybackStatus()).pipe(Effect.flatMap(retainedStatus)),
    stop: Effect.suspend(() => {
      turn += 1;
      heldForLanding = false;
      retained = Option.none();
      return call('stop', () => audio().stop()).pipe(Effect.tap(() => Effect.sync(own)));
    }),
    connection,
    announce: (announcement) =>
      call('announce', () => audio().setNowPlayingInfo(announcement)).pipe(
        Effect.tap(() => Effect.sync(own)),
      ),
    remote: Option.match(session, {
      onNone: () => native,
      onSome: () => Stream.fromQueue(pressed),
    }),
  });
};

const webSession = (): Option.Option<Session> =>
  Option.liftPredicate(Platform.OS, (os) => os === 'web').pipe(
    Option.flatMap(() => Option.fromNullishOr(globalThis.navigator?.mediaSession)),
  );

export const playbackLive = Layer.succeed(
  Playback,
  playbackOn(() => ({ audio: One.Audio, network: One.Network }), webSession()),
);
