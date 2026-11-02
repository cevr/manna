/**
 * The score clock: a silent `PlaybackApi` under the player (`player.ts`),
 * over the device's own.
 *
 * The place moves at the held hymn's tempo (`rate` of the play's options,
 * then each `setRate`; 1000 ms a second until told), with sound on or off.
 * With sound on, the device plays the recording at the tempo: each device
 * play carries the tempo as it stands, a turn reaches the device's
 * `setRate`, and the device's statuses, which name no rate, get the tempo's.
 * A hymn whose timeline runs past the recording's end (stanzas the
 * recording does not play) goes on silently at the tempo from there to the
 * timeline's end, and the status gives the timeline's length. With sound
 * off, nothing sounds: the clock runs from the first sung line, with no
 * count-in, and gives the status the device would. A switch mid-play hands
 * the place over: off pauses the device and runs the clock from the
 * device's place; on plays the recording from the clock's place. `pace`
 * tells the rate the place moves at.
 *
 * Every change of rate, place or playing takes the place at the old run's
 * rate first, then starts the new run from it (`run`).
 *
 * A play sings the stanzas its options name (`PlayOptions.stanzas`, all when
 * none), and `setStanzas` changes them mid-play. The clock holds the place in
 * sung time: the held hymn's timeline cut to the choice (`stanzas.ts`'s
 * `cutOf`), whose length, place and seeks the player reads and asks. The
 * device's place is the recording's: each play and seek asks it at
 * `recordingAt` of the sung place, and each status it tells is read at
 * `sungAt`, as is a lock screen's seek. A change of choice keeps the place
 * in the recording, or moves it on to the next sung line's start when its
 * line is no longer sung. With sound on, the skipper seeks the device across
 * each span of the recording the choice skips, from a sleep that ends at the
 * span's start at the tempo; each change wakes it to look again, and so does
 * a move the device makes of its own (a load that began to sound).
 *
 * Commands, tempo changes and Sound switches update the clock under one lock. The status
 * observer reads the device outside it and accepts replies only for the
 * current generation, so a former observer cannot delay a new Play. Pending
 * device plays also hold no lock: Pause, Stop and Sound switches go on while
 * they load. A hand-over (a switch, a new play, a stop) answers that play with the
 * place as it stands, and the device's late answer is dropped.
 */

import {
  Array as Arr,
  Clock,
  Data,
  Deferred,
  Effect,
  Exit,
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
  Remote,
  type Status,
  type PlayOptions,
  type RecordingSelection,
  type Intent,
} from './player';
import { ALL, type Cut, cutOf, whole } from './stanzas';

/** The hymn a recording's URL plays: its file is `<number>.mp3` (`src/remote.ts`). */
export const hymnOf = (uri: string): Option.Option<number> =>
  Option.fromNullishOr(/\/(\d+)\.mp3$/.exec(uri)?.[1]).pipe(Option.map(Number));

const stateOf = (ended: boolean, playing: boolean): Status['state'] => {
  if (ended) return 'ended';
  if (playing) return 'playing';
  return 'paused';
};

/**
 * The silent clock's status at `now`, held at the timeline's `end`; off 1000 ms a second, with
 * the rate it runs at (a status that names none moves at 1).
 */
const clockStatus = (run: Run, end: number, now: number): Status => {
  const at = Math.min(placeOf(run, now), end);
  const status: Status = {
    state: stateOf(at >= end, run.playing),
    positionMs: at,
    durationMs: end,
  };
  if (run.rate === 1) return status;
  return { ...status, rate: run.rate };
};

/**
 * The device's status with the rate it plays at: One's statuses name none, and the device
 * plays at the tempo it was told (a status that names none moves at 1).
 */
const atTempo = (status: Status, rate: number): Status => {
  if (rate === 1) return status;
  return { ...status, rate };
};

/** Whether the device moves, or is about to. */
const moving = (status: Status) => status.state === 'playing' || status.state === 'loading';

/** A tempo's rate as the clock takes it: one that is not a positive number runs at 1. */
const rateOf = (rate?: number) =>
  Option.fromNullishOr(rate).pipe(
    Option.filter((it) => Number.isFinite(it) && it > 0),
    Option.getOrElse(() => 1),
  );

/**
 * Which sung lines of hymn `hymn`'s timeline a choice of `stanzas` keeps, one flag per line
 * (`stanzas.ts`'s `keptOf` over the hymn's words).
 */
export type KeptFor = (hymn: number, stanzas: ReadonlyArray<number>) => ReadonlyArray<boolean>;

/** No flags: every line is kept. */
const keepsAll: KeptFor = () => [];

/** A hymn's timeline and the cut of it the held choice sings. */
interface Score {
  readonly hymn: number;
  readonly timeline: Timeline;
  readonly cut: Cut;
}

/** Hymn `hymn`'s `timeline` cut to `stanzas` by `keptFor` (`cutOf` keeps every line when the flags disagree). */
const scoreOf = (
  hymn: number,
  timeline: Timeline,
  stanzas: ReadonlyArray<number>,
  keptFor: KeptFor,
): Score => {
  if (stanzas.length === 0) return { hymn, timeline, cut: whole(timeline) };
  return { hymn, timeline, cut: cutOf(timeline, keptFor(hymn, stanzas)) };
};

/** A device's status, its places in the recording's time, read in `cut`'s sung time. */
const sungStatus = (status: Status, cut: Cut): Status => {
  if (cut.skips.length === 0) return status;
  const sung = (ms: Option.Option<number>) => Option.map(ms, cut.sungAt);
  return {
    ...status,
    positionMs: cut.sungAt(status.positionMs),
    ...Option.match(sung(Option.fromNullishOr(status.durationMs)), {
      onNone: () => ({}),
      onSome: (durationMs) => ({ durationMs }),
    }),
    ...Option.match(sung(Option.fromNullishOr(status.replacementMs)), {
      onNone: () => ({}),
      onSome: (replacementMs) => ({ replacementMs }),
    }),
  };
};

/**
 * What a call does once it has set what the clock holds: answer with a
 * status, or ask the device to play `uri` from `at` in the recording's time
 * (outside the lock), as hand-over `turn`, which ends early once `over` is
 * done.
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
  /** The held hymn's timeline and its cut to `stanzas`. */
  score: Option.Option<Score>;
  /** The stanzas the held play sings, `[]` for all. */
  stanzas: ReadonlyArray<number>;
  /** The silent clock while it runs (sound off, or past the recording's end); none while the device plays. */
  clock: Option.Option<Run>;
  /** The recording's length as the device last told it, in the recording's ms. */
  recorded: Option.Option<number>;
  /** Whether the device holds a recording this clock asked it to play. */
  sounding: boolean;
  /** Whether a device play this clock asked is still loading (its answer not yet taken). */
  loading: boolean;
  /** How many times the place was handed over; a device play answers only its own turn. */
  turn: number;
  /** Done with the next turn at the next hand-over: a device play still loading answers then. */
  over: Deferred.Deferred<number>;
  options: Option.Option<PlayOptions>;
  selection: Option.Option<RecordingSelection>;
  intent: Intent;
  /** The held hymn's tempo: ms of the hymn for each ms the recording or the silent clock runs. */
  rate: number;
}

/**
 * The score clock over `device`: `timelineFor` gives a hymn's timeline,
 * `sound` says whether the recording sounds (each change of it hands the
 * place over, for as long as the scope lasts), and `keptFor` which lines a
 * choice of stanzas keeps (every line when not given).
 */
export const scoreClock = (
  device: PlaybackApi,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
  keptFor: KeptFor = keepsAll,
) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1);
    let revision = 0;
    let lastStatus: Status = { state: 'idle', positionMs: 0 };
    /** Done at the next change while the held choice skips a span: the skipper then looks again. */
    let changed = yield* Deferred.make<void>();
    const held: Held = {
      uri: Option.none(),
      score: Option.none(),
      stanzas: ALL,
      clock: Option.none(),
      recorded: Option.none(),
      sounding: false,
      loading: false,
      turn: 0,
      over: yield* Deferred.make<number>(),
      intent: 'play',
      options: Option.none(),
      selection: Option.none(),
      rate: 1,
    };
    /** The rate the place moves at: the held tempo, sound on or off; 1 while nothing is held. */
    const pace = yield* SubscriptionRef.make(1);
    const paceNow = Effect.sync(() => held.rate);
    const tellPace = Effect.flatMap(paceNow, (rate) => SubscriptionRef.set(pace, rate));
    /** The held cut: the hymn as the held choice sings it; none while nothing is held. */
    const cut = () => Option.map(held.score, (score) => score.cut);
    /** The sung end: the cut's. */
    const end = () => Option.match(cut(), { onNone: () => 0, onSome: (c) => c.timeline.end });
    const first = () => Option.match(cut(), { onNone: () => 0, onSome: (c) => c.timeline.first });
    /** The recording's time of sung time `sung`. */
    const recordingAt = (sung: number) =>
      Option.match(cut(), { onNone: () => sung, onSome: (c) => c.recordingAt(sung) });
    /** The sung time of the recording's time `at`. */
    const sungAt = (at: number) =>
      Option.match(cut(), { onNone: () => at, onSome: (c) => c.sungAt(at) });
    /** The recording's spans the held choice skips. */
    const skips = () => Option.match(cut(), { onNone: () => [], onSome: (c) => c.skips });
    const selected = (status: Status): Status =>
      Option.match(held.selection, {
        onNone: () => status,
        onSome: (recording) => ({ ...status, recording }),
      });

    /** Wake the skipper, when the held choice skips a span: a change may move what it waits on. */
    const wake = Effect.gen(function* () {
      if (skips().length === 0) return;
      yield* Deferred.completeWith(changed, Effect.void);
      changed = yield* Deferred.make<void>();
    });

    /** A command or play answer invalidates observations made before it, and wakes the skipper. */
    const changing = <A, E>(change: Effect.Effect<A, E>) =>
      lock.withPermit(
        Effect.sync(() => {
          revision += 1;
        }).pipe(Effect.andThen(change), Effect.ensuring(wake)),
      );

    /** The place changes hands: a device play still loading answers now, and its own answer is dropped. */
    const handOver = Effect.gen(function* () {
      held.turn += 1;
      held.loading = false;
      yield* Deferred.succeed(held.over, held.turn);
      held.over = yield* Deferred.make<number>();
    });

    /** The clock's place and whether it plays, at `now`. */
    const placed = (clock: Run, now: number) => ({
      at: Math.min(placeOf(clock, now), end()),
      playing: clock.playing,
    });

    /**
     * Run the clock from `at`, playing or held, at the pace as it stands. A caller takes `at`
     * from the run before at that run's own rate (`placed`), so no change moves the place.
     */
    const run = (at: number, playing: boolean) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const clock = clockAt(at, playing, now, yield* paceNow);
        held.clock = Option.some(clock);
        held.intent = 'pause';
        if (playing) held.intent = 'play';
        return selected(clockStatus(clock, end(), now));
      });

    /** The silent clock, if it runs, started again from its place as it stands at the pace now. */
    const rebase = Effect.gen(function* () {
      if (Option.isNone(held.clock)) return;
      const { at, playing } = placed(held.clock.value, yield* Clock.currentTimeMillis);
      yield* run(at, playing);
    });

    /**
     * The device's status as the player reads it: in sung time, at the tempo's rate, with the
     * timeline's length, and past the recording's end, the silent clock on to the timeline's
     * end. A move the device made of its own (a load that began to sound) wakes the skipper.
     */
    const fromDevice = (told: Status) =>
      Effect.gen(function* () {
        const status = atTempo(
          Option.match(cut(), { onNone: () => told, onSome: (c) => sungStatus(told, c) }),
          held.rate,
        );
        if (status.state !== lastStatus.state) yield* wake;
        lastStatus = status;
        if (status.recording) held.selection = Option.some(status.recording);
        held.recorded = Option.orElse(Option.fromNullishOr(told.durationMs), () => held.recorded);
        const at = status.durationMs ?? status.positionMs;
        if (status.state === 'ended' && Option.isSome(held.score) && end() > at)
          return yield* run(Math.max(at, status.replacementMs ?? at), held.intent === 'play');
        return Option.match(Option.fromNullishOr(status.durationMs), {
          onNone: () => status,
          onSome: (ms) => ({ ...status, durationMs: Math.max(ms, end()) }),
        });
      });

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

    /** Whether the recording holds sung place `at`, as far as the device has told. */
    const recordedAt = (at: number) =>
      at < end() &&
      Option.match(held.recorded, { onNone: () => true, onSome: (ms) => recordingAt(at) < ms });

    /**
     * Hand the place to the device: it is to play the recording from sung place `at`, at the
     * held tempo as it stands (a turn since the play leaves the play's own `rate` behind).
     */
    const sounded = (uri: string, at: number, continuous: boolean, options?: PlayOptions) =>
      Effect.gen(function* () {
        yield* handOver;
        held.clock = Option.none();
        held.sounding = true;
        held.loading = true;
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
        const told = Option.match(Option.fromNullishOr(retained), {
          // A play that named no options: the device's own defaults, at the tempo.
          onNone: (): PlayOptions => ({ continuous: false, ready: false, rate: held.rate }),
          onSome: (it) => ({ ...it, rate: held.rate }),
        });
        return Step.Sound({
          uri,
          at: recordingAt(at),
          turn: held.turn,
          over: held.over,
          options: told,
        });
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
        if (held.turn === turn) held.loading = false;
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
        const hymn = Option.fromNullishOr(options?.recording?.number).pipe(
          Option.orElse(() => hymnOf(uri)),
        );
        held.stanzas = options?.stanzas ?? ALL;
        held.score = Option.flatMap(hymn, (number) =>
          Option.map(timelineFor(number), (timeline) =>
            scoreOf(number, timeline, held.stanzas, keptFor),
          ),
        );
        const tail =
          options?.continuous &&
          Option.isSome(held.clock) &&
          Option.exists(held.recorded, (ms) => recordingAt(fromMs) >= ms) &&
          Option.exists(
            held.options,
            (previous) => options.recording?.number === previous.recording?.number,
          );
        held.uri = Option.some(uri);
        held.options = Option.fromNullishOr(options);
        held.intent = options?.intent ?? 'play';
        // Each play names its hymn's tempo; a play that names none runs at 1000 ms a second.
        held.rate = rateOf(options?.rate);
        yield* tellPace;
        held.selection = Option.map(Option.fromNullishOr(options?.recording), (identity) => ({
          number: identity.number,
          requested: identity.offset,
          effective: identity.offset,
        }));
        if (tail) return yield* answer(run(fromMs, held.intent === 'play'));
        held.recorded = Option.none();
        if (yield* SubscriptionRef.get(sound))
          return yield* sounded(uri, fromMs, options?.continuous === true, options);
        if (Option.isNone(held.score))
          return yield* PlaybackError.make({ operation: 'play', message: `no timing for ${uri}` });
        if (held.sounding) yield* device.stop;
        held.sounding = false;
        return yield* answer(run(Math.max(fromMs, 0) || first(), held.intent === 'play'));
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
        if (Option.isNone(held.score) || recordedAt(ms) || ms >= end())
          return yield* fromDevice(yield* device.seek(recordingAt(ms)));
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
          yield* run(sungAt(status.positionMs), moving(status));
          return Option.none<Step>();
        }
        const now = yield* Clock.currentTimeMillis;
        const clock = Option.filter(held.clock, (c) => on && c.playing);
        const at = Option.filter(
          Option.map(clock, (c) => placed(c, now).at),
          recordedAt,
        );
        if (Option.isSome(at)) return Option.some(yield* sounded(uri, at.value, true));
        // The clock stays (paused, or past the recording's end) and runs on at the tempo.
        return Option.none<Step>();
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

    /** Whether the skipper has a device to watch: it sounds the held recording, no play loading. */
    const watching = () =>
      held.sounding && !held.loading && Option.isNone(held.clock) && skips().length > 0;

    /**
     * Under the lock: when the device stands in a skipped span, seek it to the span's end; then
     * the host's ms until the next skipped span starts at the tempo, or none while the device
     * does not play or plays past the last one.
     */
    const skipFrom = (status: Status): Effect.Effect<Option.Option<number>, PlaybackError> =>
      Effect.gen(function* () {
        if (status.state !== 'playing') return Option.none();
        const at = status.positionMs;
        const next = Arr.findFirst(skips(), (skip) => at < skip.to);
        if (Option.isNone(next)) return Option.none();
        const skip = next.value;
        if (at < skip.from) return Option.some((skip.from - at) / held.rate);
        // A status read begun before the seek tells the place it left.
        revision += 1;
        const after = yield* device.seek(skip.to);
        return yield* skipFrom({ ...after, positionMs: Math.max(after.positionMs, skip.to) });
      });

    /**
     * Under the lock: a device paused in a skipped span is sought to the span's end now, where
     * the status already shows it, so a resume sounds none of the span even while the device
     * tells `loading` before it plays.
     */
    const skipPaused = (status: Status): Effect.Effect<void, PlaybackError> =>
      Effect.gen(function* () {
        if (status.state !== 'paused') return;
        const at = status.positionMs;
        const into = Arr.findFirst(skips(), (skip) => skip.from <= at && at < skip.to);
        if (Option.isNone(into)) return;
        revision += 1;
        yield* device.seek(into.value.to);
      });

    /**
     * One look of the skipper: the device read outside the lock, as `readStatus` does, and taken
     * only when no change came between. It gives the change to wait on, and how long to sleep
     * before looking again, if there is a span ahead.
     */
    const look = Effect.gen(function* () {
      const seen = yield* lock.withPermit(
        Effect.sync(() => ({ revision, woken: changed, watching: watching() })),
      );
      if (!seen.watching) return { woken: seen.woken, sleep: Option.none<number>() };
      const told = yield* Effect.exit(device.status);
      const sleep = yield* lock
        .withPermit(
          Effect.gen(function* () {
            if (seen.revision !== revision || !watching() || Exit.isFailure(told))
              return Option.none<number>();
            return yield* skipFrom(told.value);
          }),
        )
        .pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning(`[sound] skip.failed message=${error.message}`),
              Option.none<number>(),
            ),
          ),
        );
      return { woken: seen.woken, sleep };
    });

    yield* Effect.gen(function* () {
      const { woken, sleep } = yield* look;
      const change = Deferred.await(woken);
      yield* Option.match(sleep, {
        onNone: () => change,
        onSome: (ms) =>
          change.pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.void })),
      });
    }).pipe(Effect.forever, Effect.forkScoped);

    /**
     * A new choice of stanzas for the held hymn: the place keeps its place in the recording,
     * or moves on to the next sung line's start; a device that plays or stands paused in a span
     * now skipped is sought across it at once.
     */
    const choose = (stanzas: ReadonlyArray<number>) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const was = Option.map(held.clock, (clock) => {
          const { at, playing } = placed(clock, now);
          return { at: recordingAt(at), playing };
        });
        held.stanzas = stanzas;
        held.score = Option.map(held.score, (score) =>
          scoreOf(score.hymn, score.timeline, stanzas, keptFor),
        );
        if (Option.isSome(was)) {
          yield* run(sungAt(was.value.at), was.value.playing);
          return;
        }
        if (!watching()) return;
        const status = yield* device.status;
        yield* skipPaused(status);
        yield* skipFrom(status);
      });

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
      // A command: a status read begun before it cannot answer with the old rate's place. The
      // device holding a recording plays on at the new rate from where it stands; the silent
      // clock, if it runs, starts again from its place.
      setRate: (rate) =>
        changing(
          Effect.gen(function* () {
            held.rate = rateOf(rate);
            yield* tellPace;
            if (held.sounding) yield* device.setRate?.(held.rate) ?? Effect.void;
            yield* rebase;
          }),
        ),
      pace: SubscriptionRef.changes(pace).pipe(Stream.changes),
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
          held.score = Option.none();
          held.stanzas = ALL;
          held.clock = Option.none();
          held.recorded = Option.none();
          held.sounding = false;
          held.options = Option.none();
          held.selection = Option.none();
          held.rate = 1;
          yield* tellPace;
          yield* device.stop;
        }),
      ),
      setStanzas: (stanzas) =>
        changing(choose(stanzas)).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`[sound] stanzas.failed message=${error.message}`),
          ),
        ),
      connection: device.connection,
      announce: device.announce,
      // The lock screen tells the recording's place; the player asks for sung time.
      remote: Stream.map(device.remote, (press) =>
        Remote.$match(press, {
          Play: () => press,
          Pause: () => press,
          Seek: ({ seconds }) =>
            Remote.Seek({ seconds: Option.map(seconds, (s) => sungAt(s * 1000) / 1000) }),
        }),
      ),
    };
    return api;
  });

/** The player's playback: the score clock over `device`'s (`LivePlayer.tsx`). */
export const soundOn = <R>(
  device: Layer.Layer<Playback, never, R>,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
  keptFor: KeptFor = keepsAll,
): Layer.Layer<Playback, never, R> =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      return yield* scoreClock(yield* Playback, timelineFor, sound, keptFor);
    }),
  ).pipe(Layer.provide(device));
