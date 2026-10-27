/**
 * The score clock: a silent `PlaybackApi` under the player (`player.ts`),
 * over the device's own.
 *
 * With sound on, the device plays the recording. A hymn whose timeline runs
 * past the recording's end (stanzas the recording does not play) goes on
 * silently from there to the timeline's end, and the status gives the
 * timeline's length. With sound off, nothing sounds: the clock runs at
 * 1000 ms a second from the first sung line, with no count-in, and gives
 * the status the device would. A switch mid-play hands the place over: off
 * pauses the device and runs the clock from the device's place; on plays
 * the recording from the clock's place.
 *
 * Commands and Sound switches update the clock under one lock. The status
 * observer reads the device outside it and accepts replies only for the
 * current generation, so a former observer cannot delay a new Play. Pending
 * device plays also hold no lock: Pause, Stop and Sound switches go on while
 * they load. A hand-over (a switch, a new play, a stop) answers that play with the
 * place as it stands, and the device's late answer is dropped.
 */

import {
  Clock,
  Data,
  Deferred,
  Effect,
  type Exit,
  Layer,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect';
import * as Semaphore from 'effect/Semaphore';

import { type Clock as Run, clockAt, placeOf } from '../follow/clock';
import type { Timeline } from '../follow/timeline';
import { audioUrl } from '~/remote';
import {
  Playback,
  type PlaybackApi,
  PlaybackError,
  type Status,
  type PlayOptions,
  type RecordingSelection,
  type Intent,
} from './player';

/** The hymn a recording's URL plays: its file is `<number>.mp3` (`src/remote.ts`). */
export const hymnOf = (uri: string): Option.Option<number> =>
  Option.fromNullishOr(/\/(\d+)\.mp3$/.exec(uri)?.[1]).pipe(Option.map(Number));

const stateOf = (ended: boolean, playing: boolean): Status['state'] => {
  if (ended) return 'ended';
  if (playing) return 'playing';
  return 'paused';
};

/** The silent clock's status at `now`, held at the timeline's `end`. */
const clockStatus = (run: Run, end: number, now: number): Status => {
  const at = Math.min(placeOf(run, now), end);
  return { state: stateOf(at >= end, run.playing), positionMs: at, durationMs: end };
};

/** Whether the device moves, or is about to. */
const moving = (status: Status) => status.state === 'playing' || status.state === 'loading';

/**
 * What a call does once it has set what the clock holds: answer with a
 * status, or ask the device to play `uri` from `at` (outside the lock), as
 * hand-over `turn`, which ends early once `over` is done.
 */
type Step = Data.TaggedEnum<{
  Answer: { readonly status: Status };
  Sound: {
    readonly uri: string;
    readonly at: number;
    readonly turn: number;
    readonly over: Deferred.Deferred<number>;
    readonly options?: PlayOptions;
  };
}>;
const Step = Data.taggedEnum<Step>();

/** What the score clock holds across the calls. */
interface Held {
  uri: Option.Option<string>;
  timeline: Option.Option<Timeline>;
  /** The silent clock while it runs (sound off, or past the recording's end); none while the device plays. */
  clock: Option.Option<Run>;
  /** The recording's length as the device last told it, ms. */
  recorded: Option.Option<number>;
  /** Whether the device holds a recording this clock asked it to play. */
  sounding: boolean;
  /** How many times the place was handed over; a device play answers only its own turn. */
  turn: number;
  /** Done with the next turn at the next hand-over: a device play still loading answers then. */
  over: Deferred.Deferred<number>;
  options: Option.Option<PlayOptions>;
  selection: Option.Option<RecordingSelection>;
  intent: Intent;
}

/**
 * The score clock over `device`: `timelineFor` gives a hymn's timeline, and
 * `sound` says whether the recording sounds; each change of it hands the
 * place over, for as long as the scope lasts.
 */
export const scoreClock = (
  device: PlaybackApi,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1);
    let revision = 0;
    let lastStatus: Status = { state: 'idle', positionMs: 0 };
    /** A command or play answer invalidates observations made before it. */
    const changing = <A, E>(change: Effect.Effect<A, E>) =>
      lock.withPermit(
        Effect.sync(() => {
          revision += 1;
        }).pipe(Effect.andThen(change)),
      );
    const held: Held = {
      uri: Option.none(),
      timeline: Option.none(),
      clock: Option.none(),
      recorded: Option.none(),
      sounding: false,
      turn: 0,
      over: yield* Deferred.make<number>(),
      intent: 'play',
      options: Option.none(),
      selection: Option.none(),
    };
    const end = () => Option.match(held.timeline, { onNone: () => 0, onSome: (t) => t.end });
    const first = () => Option.match(held.timeline, { onNone: () => 0, onSome: (t) => t.first });
    const selected = (status: Status): Status =>
      Option.match(held.selection, {
        onNone: () => status,
        onSome: (recording) => ({ ...status, recording }),
      });

    /** The place changes hands: a device play still loading answers now, and its own answer is dropped. */
    const handOver = Effect.gen(function* () {
      held.turn += 1;
      yield* Deferred.succeed(held.over, held.turn);
      held.over = yield* Deferred.make<number>();
    });

    /** Run the clock from `at`, playing or held. */
    const run = (at: number, playing: boolean) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        const clock = clockAt(at, playing, now);
        held.clock = Option.some(clock);
        held.intent = 'pause';
        if (playing) held.intent = 'play';
        return selected(clockStatus(clock, end(), now));
      });

    /**
     * The device's status as the player reads it: the timeline's length, and
     * past the recording's end, the silent clock on to the timeline's end.
     */
    const fromDevice = (status: Status) => {
      lastStatus = status;
      if (status.recording) held.selection = Option.some(status.recording);
      held.recorded = Option.orElse(Option.fromNullishOr(status.durationMs), () => held.recorded);
      const at = status.durationMs ?? status.positionMs;
      if (status.state === 'ended' && Option.isSome(held.timeline) && end() > at)
        return run(Math.max(at, status.replacementMs ?? at), held.intent === 'play');
      return Effect.succeed(
        Option.match(Option.fromNullishOr(status.durationMs), {
          onNone: () => status,
          onSome: (ms) => ({ ...status, durationMs: Math.max(ms, end()) }),
        }),
      );
    };

    /** A stale play answers from memory and never waits on a native observer. */
    const current = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      if (Option.isSome(held.clock)) return selected(clockStatus(held.clock.value, end(), now));
      return selected(lastStatus);
    });

    /** Observe without holding a command behind a native status round trip. */
    const readStatus: Effect.Effect<Status, PlaybackError> = Effect.gen(function* () {
      const snapshot = yield* lock.withPermit(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          return {
            revision,
            clock: Option.map(held.clock, (clock) => selected(clockStatus(clock, end(), now))),
          };
        }),
      );
      if (Option.isSome(snapshot.clock)) return snapshot.clock.value;
      // A failed former read is stale too. Neither its status nor its error
      // may change the replacement's selection, duration or silent tail.
      const reply = yield* Effect.exit(device.status);
      const accepted = yield* lock.withPermit(
        Effect.gen(function* () {
          if (snapshot.revision !== revision || Option.isSome(held.clock))
            return Option.none<Status>();
          return Option.some(yield* fromDevice(yield* reply));
        }),
      );
      return yield* Option.match(accepted, {
        // Retries stop once a device round trip has no intervening command;
        // continuous mutations can defer this observer until they stop.
        onNone: () => readStatus,
        onSome: Effect.succeed,
      });
    });

    /** Whether the recording holds place `at`, as far as the device has told. */
    const recordedAt = (at: number) =>
      at < end() && Option.match(held.recorded, { onNone: () => true, onSome: (ms) => at < ms });

    /** Hand the place to the device: it is to play the recording from `at`. */
    const sounded = (uri: string, at: number, continuous: boolean, options?: PlayOptions) =>
      Effect.gen(function* () {
        yield* handOver;
        held.clock = Option.none();
        held.sounding = true;
        const retained =
          options ??
          Option.getOrUndefined(
            Option.map(held.options, (options) => ({
              ...options,
              ready: true,
              continuous,
              intent: held.intent,
            })),
          );
        return Step.Sound({ uri, at, turn: held.turn, over: held.over, options: retained });
      });

    const answer = (status: Effect.Effect<Status, PlaybackError>) =>
      Effect.map(status, (it) => Step.Answer({ status: it }));

    /**
     * The device's answer to the play of `turn`, or none when the place was
     * handed over first. A play handed over answers with the place as it
     * stands; the clock runs then, so a device that starts late is paused.
     */
    const played = (turn: number, told: Option.Option<Exit.Exit<Status, PlaybackError>>) =>
      Effect.gen(function* () {
        if (held.turn === turn && Option.isSome(told)) return yield* fromDevice(yield* told.value);
        if (Option.isSome(held.clock) && held.sounding) yield* Effect.ignore(device.pause);
        return yield* current;
      });

    /** Carry a step out: a device play runs outside the lock, and its answer is taken under it. */
    const settle = (step: Step): Effect.Effect<Status, PlaybackError> =>
      Step.$match(step, {
        Answer: ({ status }) => Effect.succeed(status),
        Sound: ({ uri, at, turn, over, options }) =>
          Effect.raceFirst(
            Effect.asSome(Effect.exit(device.play(uri, at, options))),
            Effect.as(Deferred.await(over), Option.none()),
          ).pipe(Effect.flatMap((told) => changing(played(turn, told)))),
      });

    /** `step` under the lock, then carried out. */
    const locked = (step: Effect.Effect<Step, PlaybackError>) =>
      Effect.flatMap(changing(step), settle);

    const play = (uri: string, fromMs: number, options?: PlayOptions) =>
      Effect.gen(function* () {
        yield* handOver;
        const tail =
          options?.continuous &&
          Option.isSome(held.clock) &&
          Option.exists(held.recorded, (ms) => fromMs >= ms) &&
          Option.exists(
            held.options,
            (previous) => options.recording?.number === previous.recording?.number,
          );
        held.uri = Option.some(uri);
        held.timeline = Option.flatMap(
          Option.fromNullishOr(options?.recording?.number).pipe(Option.orElse(() => hymnOf(uri))),
          timelineFor,
        );
        held.options = Option.fromNullishOr(options);
        held.intent = options?.intent ?? 'play';
        held.selection = Option.map(Option.fromNullishOr(options?.recording), (identity) => ({
          number: identity.number,
          requested: identity.offset,
          effective: identity.offset,
        }));
        if (tail) return yield* answer(run(fromMs, held.intent === 'play'));
        held.recorded = Option.none();
        if (yield* SubscriptionRef.get(sound))
          return yield* sounded(uri, fromMs, options?.continuous === true, options);
        if (Option.isNone(held.timeline))
          return yield* PlaybackError.make({ operation: 'play', message: `no timing for ${uri}` });
        if (held.sounding) yield* device.stop;
        held.sounding = false;
        return yield* answer(run(Math.max(fromMs, 0) || first(), held.intent === 'play'));
      });

    /** The clock's place and whether it plays, at `now`. */
    const placed = (clock: Run, now: number) => ({
      at: Math.min(placeOf(clock, now), end()),
      playing: clock.playing,
    });

    const resumeClock = (clock: Run) =>
      Effect.gen(function* () {
        held.intent = 'play';
        const { at } = placed(clock, yield* Clock.currentTimeMillis);
        const on = yield* SubscriptionRef.get(sound);
        const uri = Option.getOrElse(held.uri, () => '');
        if (at >= end()) {
          if (on) return yield* sounded(uri, 0, false);
          return yield* answer(run(first(), true));
        }
        if (on && recordedAt(at)) return yield* sounded(uri, at, false);
        return yield* answer(run(at, true));
      });

    const seekClock = (clock: Run, ms: number) =>
      Effect.gen(function* () {
        const on = yield* SubscriptionRef.get(sound);
        const uri = Option.getOrElse(held.uri, () => '');
        if (on && clock.playing && recordedAt(ms)) return yield* sounded(uri, ms, false);
        return yield* answer(run(Math.min(ms, end()), clock.playing));
      });

    /** A seek while the device plays: past the recording's end, the silent clock takes it. */
    const seekDevice = (ms: number) =>
      Effect.gen(function* () {
        if (Option.isNone(held.timeline) || recordedAt(ms) || ms >= end())
          return yield* fromDevice(yield* device.seek(ms));
        const before = yield* device.status;
        yield* device.pause;
        return yield* run(ms, moving(before));
      });

    /** On a switch of `sound`: hand the place over; on, the device's play to carry out. */
    const switchTo = (on: boolean) =>
      Effect.gen(function* () {
        const uri = Option.getOrElse(held.uri, () => '');
        if (Option.isNone(held.uri)) return Option.none<Step>();
        if (!on && Option.isNone(held.clock)) {
          yield* handOver;
          const status = yield* device.status;
          yield* device.pause;
          yield* run(status.positionMs, moving(status));
          return Option.none<Step>();
        }
        const now = yield* Clock.currentTimeMillis;
        const clock = Option.filter(held.clock, (c) => on && c.playing);
        const at = Option.filter(
          Option.map(clock, (c) => placed(c, now).at),
          recordedAt,
        );
        if (Option.isNone(at)) return Option.none<Step>();
        return Option.some(yield* sounded(uri, at.value, true));
      });

    yield* SubscriptionRef.changes(sound).pipe(
      Stream.changes,
      Stream.drop(1),
      Stream.runForEach((on) =>
        changing(switchTo(on)).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: (step) => Effect.asVoid(settle(step)),
            }),
          ),
          Effect.catch((error) =>
            Effect.logWarning(`[sound] switch.failed on=${on} message=${error.message}`),
          ),
        ),
      ),
      Effect.forkScoped,
    );

    const api: PlaybackApi = {
      play: (uri, fromMs, options) => locked(play(uri, fromMs, options)),
      pause: changing(
        Effect.gen(function* () {
          held.intent = 'pause';
          const now = yield* Clock.currentTimeMillis;
          if (Option.isSome(held.clock)) return yield* run(placed(held.clock.value, now).at, false);
          return yield* fromDevice(yield* device.pause);
        }),
      ),
      resume: locked(
        Effect.gen(function* () {
          held.intent = 'play';
          if (Option.isSome(held.clock)) return yield* resumeClock(held.clock.value);
          return yield* answer(Effect.flatMap(device.resume, fromDevice));
        }),
      ),
      seek: (ms) =>
        locked(
          Effect.gen(function* () {
            if (Option.isSome(held.clock)) return yield* seekClock(held.clock.value, ms);
            return yield* answer(seekDevice(ms));
          }),
        ),
      status: readStatus,
      selectRecording: (selection) =>
        changing(
          Effect.gen(function* () {
            held.selection = Option.some(selection);
            held.uri = Option.some(audioUrl(selection.number, selection.requested));
            held.options = Option.map(held.options, (options) => ({
              ...options,
              recording: { number: selection.number, offset: selection.requested },
            }));
            yield* device.selectRecording?.(selection) ?? Effect.void;
          }),
        ),
      stop: changing(
        Effect.gen(function* () {
          yield* handOver;
          held.uri = Option.none();
          held.timeline = Option.none();
          held.clock = Option.none();
          held.recorded = Option.none();
          held.sounding = false;
          held.options = Option.none();
          held.selection = Option.none();
          yield* device.stop;
        }),
      ),
      connection: device.connection,
      announce: device.announce,
      remote: device.remote,
    };
    return api;
  });

/** The player's playback: the score clock over `device`'s (`LivePlayer.tsx`). */
export const soundOn = (
  device: Layer.Layer<Playback>,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
): Layer.Layer<Playback> =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      return yield* scoreClock(yield* Playback, timelineFor, sound);
    }),
  ).pipe(Layer.provide(device));
