/**
 * The device's playback: One's `Audio` session, the same calls on a phone
 * (AVPlayer on iOS, with the lock screen and Control Center through
 * `MPNowPlayingSession`) and on the web (an `HTMLAudioElement` and the Media
 * Session). Each call's failure is a `PlaybackError` naming the call.
 *
 * A phone's session plays or pauses at the lock screen's press, then tells
 * One's listeners. On the web One's own Media Session handlers wait for the
 * element to play before they tell (`Audio.resume` waits on `play()`), so
 * the page would show the old state for as long as the recording loads.
 * There the page owns the handlers: each press is told at once and does
 * nothing else, and the player's command asks One. One drops the handlers
 * at each `play` and `stop` and sets its own at each `setNowPlayingInfo`,
 * so the page sets its own after each.
 */

import { Clock, Duration, Effect, Layer, Match, Option, Queue, Stream } from 'effect';
import { One } from 'one';
import { Platform } from 'react-native';

import { clockAt, placeOf, type Clock as Run } from '../follow/clock';
import {
  Playback,
  type PlaybackApi,
  PlaybackError,
  Remote,
  type Status,
  type Intent,
} from './player';

/** One's `Audio` and `Network` as the playback uses them. */
export interface Device {
  readonly audio: Pick<
    typeof One.Audio,
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

/** The Media Session's handlers as the page sets them. */
export type Session = Pick<MediaSession, 'setActionHandler'>;

/** How soon a refused seek is asked again: a cadence, never a limit. */
const askAgainAfter = Duration.millis(100);

/** Whether the device holds a recording that can take a seek. */
const holdsRecording = (status: Status) =>
  status.state === 'loading' || status.state === 'playing' || status.state === 'paused';

const awaitsPlay = (status: Status) => status.state === 'paused' || status.state === 'loading';

const call = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => PlaybackError.make({ operation, message: String(cause) }),
  });

/**
 * The playback over `device`, read at each call; on the web, `session` is
 * the page's Media Session, whose presses reach the player at once.
 */
export const playbackOn = (device: () => Device, session: Option.Option<Session>): PlaybackApi => {
  const audio = () => device().audio;
  let turn = 0;
  let wants: Intent = 'play';
  let heldForLanding = false;
  const paused = () => wants === 'pause';
  // Intent may pause/resume a moving hand-over. It cannot promote a
  // fixed landing into musical time before that recording has landed.
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
  /** The page's Media Session presses, kept until the player takes them. */
  const pressed = Effect.runSync(Queue.unbounded<Remote>());
  const tell = (remote: Remote) => void Queue.offerUnsafe(pressed, remote);
  /** The page's handlers in place of One's: each press told at once. */
  const own = () =>
    Option.map(session, (it) => {
      it.setActionHandler('play', () => tell(Remote.Play()));
      it.setActionHandler('pause', () => tell(Remote.Pause()));
      it.setActionHandler('seekto', (details) =>
        tell(Remote.Seek({ seconds: Option.fromNullishOr(details.seekTime) })),
      );
    });
  /** One's own lock-screen listener, on a phone. */
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
  /**
   * One's connection: the state now, then each change One tells, in order.
   * A change told while the state now is read waits behind it. A device
   * whose connection cannot be read is taken as online, so a failure says
   * the recording could not play, never that it needs a connection the
   * device may have.
   */
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
  /**
   * Seek to `fromMs` until the device takes it: a phone refuses a seek until
   * the recording is ready, so a refused seek is asked again while the
   * device holds the recording (loading, playing or paused). The adapter
   * gives nothing up by a time or a count of its own: the player owns the
   * wait, and a newer command cuts the asking off.
   */
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
            // Seek immediately when ready. If it is refused, hold the
            // hand-over before the retry wait; a separate Pause cannot
            // prevent opening samples before it takes effect. Ordinary
            // loads keep their device-driven preparation contract.
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
  return Playback.of({
    play: (uri, fromMs, options) =>
      Effect.gen(function* () {
        const owner = ++turn;
        heldForLanding = false;
        wants = options?.intent ?? 'play';
        const began = yield* Clock.currentTimeMillis;
        retained = Option.liftPredicate(
          {
            clock: clockAt(fromMs, options?.continuous === true && !paused(), began),
            continuous: options?.continuous === true,
          },
          () => options?.ready === true || options?.continuous === true,
        );
        const status = yield* call('play', () => {
          // One drops the Media Session's handlers before this returns.
          const playing = audio().play(uri);
          own();
          return playing;
        });
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
        // Pause may arrive while play/seek waits for the native session.
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
        clock: clockAt(placeOf(run.clock, now), false, now),
      }));
      return yield* call('pause', () => audio().pause());
    }),
    resume: Effect.gen(function* () {
      wants = 'play';
      const now = yield* Clock.currentTimeMillis;
      retained = Option.map(retained, (run) => ({
        ...run,
        clock: clockAt(placeOf(run.clock, now), run.continuous, now),
      }));
      return yield* call('resume', () => audio().resume());
    }),
    seek: (positionMs) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        // A seek chooses a fixed landing. Music has not moved there while
        // its recording is still preparing, even if Play remains the intent.
        retained = Option.map(retained, () => ({
          clock: clockAt(positionMs, false, now),
          continuous: false,
        }));
        return yield* call('seek', () => audio().seek(positionMs));
      }),
    status: call('status', () => audio().getPlaybackStatus()).pipe(Effect.flatMap(retainedStatus)),
    // One drops the Media Session's handlers with the recording; the page's
    // Play starts it again, so its handlers stay.
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

/** The page's Media Session: the web's, where the browser has one. */
const webSession = (): Option.Option<Session> =>
  Option.liftPredicate(Platform.OS, (os) => os === 'web').pipe(
    Option.flatMap(() => Option.fromNullishOr(globalThis.navigator?.mediaSession)),
  );

export const playbackLive = Layer.succeed(
  Playback,
  playbackOn(() => ({ audio: One.Audio, network: One.Network }), webSession()),
);
