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
import { type Beat, type CountIn, countInOf } from './countin';
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

export const hymnOf = (uri: string): Option.Option<number> =>
  Option.fromNullishOr(/\/(\d+)\.mp3$/.exec(uri)?.[1]).pipe(Option.map(Number));

const stateOf = (ended: boolean, playing: boolean): Status['state'] => {
  if (ended) return 'ended';
  if (playing) return 'playing';
  return 'paused';
};

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

const atTempo = (status: Status, rate: number): Status => {
  if (rate === 1) return status;
  return { ...status, rate };
};

const COUNT_SLACK = 1e-6;

const sameBeat = (a: Option.Option<Beat>, b: Option.Option<Beat>) =>
  Option.match(a, {
    onNone: () => Option.isNone(b),
    onSome: (it) => Option.exists(b, (other) => other.index === it.index && other.of === it.of),
  });

const moving = (status: Status) => status.state === 'playing' || status.state === 'loading';

const rateOf = (rate?: number) =>
  Option.fromNullishOr(rate).pipe(
    Option.filter((it) => Number.isFinite(it) && it > 0),
    Option.getOrElse(() => 1),
  );

export type KeptFor = (hymn: number, stanzas: ReadonlyArray<number>) => ReadonlyArray<boolean>;

const keepsAll: KeptFor = () => [];

interface Score {
  readonly hymn: number;
  readonly timeline: Timeline;
  readonly cut: Cut;
}

const scoreOf = (
  hymn: number,
  timeline: Timeline,
  stanzas: ReadonlyArray<number>,
  keptFor: KeptFor,
): Score => {
  if (stanzas.length === 0) return { hymn, timeline, cut: whole(timeline) };
  return { hymn, timeline, cut: cutOf(timeline, keptFor(hymn, stanzas)) };
};

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

interface Held {
  uri: Option.Option<string>;
  score: Option.Option<Score>;
  stanzas: ReadonlyArray<number>;
  clock: Option.Option<Run>;
  count: Option.Option<CountIn>;
  recorded: Option.Option<number>;
  sounding: boolean;
  loading: boolean;
  turn: number;
  over: Deferred.Deferred<number>;
  options: Option.Option<PlayOptions>;
  selection: Option.Option<RecordingSelection>;
  intent: Intent;
  rate: number;
}

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
    let changed = yield* Deferred.make<void>();
    const held: Held = {
      uri: Option.none(),
      score: Option.none(),
      stanzas: ALL,
      clock: Option.none(),
      count: Option.none(),
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
    const pace = yield* SubscriptionRef.make(1);
    const paceNow = Effect.sync(() => held.rate);
    const tellPace = Effect.flatMap(paceNow, (rate) => SubscriptionRef.set(pace, rate));
    const cut = () => Option.map(held.score, (score) => score.cut);
    const end = () => Option.match(cut(), { onNone: () => 0, onSome: (c) => c.timeline.end });
    const first = () => Option.match(cut(), { onNone: () => 0, onSome: (c) => c.timeline.first });
    const recordingAt = (sung: number) =>
      Option.match(cut(), { onNone: () => sung, onSome: (c) => c.recordingAt(sung) });
    const sungAt = (at: number) =>
      Option.match(cut(), { onNone: () => at, onSome: (c) => c.sungAt(at) });
    const skips = () => Option.match(cut(), { onNone: () => [], onSome: (c) => c.skips });
    const selected = (status: Status): Status =>
      Option.match(held.selection, {
        onNone: () => status,
        onSome: (recording) => ({ ...status, recording }),
      });

    const countingAt = (now: number) =>
      Option.flatMap(held.count, (count) =>
        Option.map(
          Option.filter(held.clock, (clock) => clock.playing && clock.stamp - now > COUNT_SLACK),
          (clock) => ({ count, clock }),
        ),
      );
    const beatAt = (now: number): Option.Option<Beat> =>
      Option.map(countingAt(now), ({ count, clock }) => {
        const left = (clock.stamp - now) * clock.rate;
        const index = count.beats - Math.ceil((left - COUNT_SLACK * clock.rate) / count.beatMs);
        return { index: Math.min(Math.max(index, 0), count.beats - 1), of: count.beats };
      });
    const toNextBeat = (now: number) =>
      Option.flatMap(countingAt(now), ({ count, clock }) =>
        Option.map(
          beatAt(now),
          ({ index, of }) => clock.stamp - ((of - index - 1) * count.beatMs) / clock.rate - now,
        ),
      );
    const clockNow = (clock: Run, now: number): Status => {
      const status = selected(clockStatus(clock, end(), now));
      return Option.match(countingAt(now), {
        onNone: () => status,
        onSome: (counting) => ({ ...status, countInMs: counting.clock.stamp - now }),
      });
    };

    const beat = yield* SubscriptionRef.make<Option.Option<Beat>>(Option.none());
    let ticked = yield* Deferred.make<void>();
    const tellBeat = Effect.gen(function* () {
      yield* SubscriptionRef.set(beat, beatAt(yield* Clock.currentTimeMillis));
      yield* Deferred.completeWith(ticked, Effect.void);
      ticked = yield* Deferred.make<void>();
    });
    const countEnded = Effect.map(Clock.currentTimeMillis, (now) => {
      if (Option.exists(held.clock, (clock) => clock.playing && clock.stamp - now <= COUNT_SLACK))
        held.count = Option.none();
    });

    const wake = Effect.gen(function* () {
      if (skips().length === 0) return;
      yield* Deferred.completeWith(changed, Effect.void);
      changed = yield* Deferred.make<void>();
    });

    const changing = <A, E>(change: Effect.Effect<A, E>) =>
      lock.withPermit(
        Effect.sync(() => {
          revision += 1;
        }).pipe(
          Effect.andThen(countEnded),
          Effect.andThen(change),
          Effect.ensuring(Effect.andThen(wake, tellBeat)),
        ),
      );

    const handOver = Effect.gen(function* () {
      held.turn += 1;
      held.loading = false;
      held.count = Option.none();
      yield* Deferred.succeed(held.over, held.turn);
      held.over = yield* Deferred.make<number>();
    });

    const placed = (clock: Run, now: number) => ({
      at: Math.min(placeOf(clock, now), end()),
      playing: clock.playing,
    });

    const run = (at: number, playing: boolean) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const clock = clockAt(at, playing, now, yield* paceNow);
        held.clock = Option.some(clock);
        held.intent = 'pause';
        if (playing) held.intent = 'play';
        return selected(clockStatus(clock, end(), now));
      });

    const countFrom = Effect.gen(function* () {
      const count = Option.map(held.score, (score) => countInOf(score.timeline.tempo));
      if (Option.isNone(count)) return yield* run(first(), true);
      const now = yield* Clock.currentTimeMillis;
      const rate = yield* paceNow;
      const bar = (count.value.beats * count.value.beatMs) / rate;
      const clock = clockAt(first(), true, now + bar, rate);
      held.count = count;
      held.clock = Option.some(clock);
      held.intent = 'play';
      return clockNow(clock, now);
    });

    const rebase = Effect.gen(function* () {
      if (Option.isNone(held.clock)) return;
      const now = yield* Clock.currentTimeMillis;
      const counting = countingAt(now);
      if (Option.isSome(counting)) {
        const { clock } = counting.value;
        const rate = yield* paceNow;
        const left = (clock.stamp - now) * clock.rate;
        held.clock = Option.some(clockAt(clock.at, true, now + left / rate, rate));
        return;
      }
      const { at, playing } = placed(held.clock.value, now);
      yield* run(at, playing);
    });

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

    const current = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      if (Option.isSome(held.clock)) return clockNow(held.clock.value, now);
      return selected(lastStatus);
    });

    const readStatus: Effect.Effect<Status, PlaybackError> = Effect.gen(function* () {
      const snapshot = yield* lock.withPermit(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          return {
            revision,
            clock: Option.map(held.clock, (clock) => clockNow(clock, now)),
          };
        }),
      );
      if (Option.isSome(snapshot.clock)) return snapshot.clock.value;
      const reply = yield* Effect.exit(device.status);
      const accepted = yield* lock.withPermit(
        Effect.gen(function* () {
          if (snapshot.revision !== revision || Option.isSome(held.clock))
            return Option.none<Status>();
          return Option.some(yield* fromDevice(yield* reply));
        }),
      );
      return yield* Option.match(accepted, {
        onNone: () => readStatus,
        onSome: Effect.succeed,
      });
    });

    const recordedAt = (at: number) =>
      at < end() &&
      Option.match(held.recorded, { onNone: () => true, onSome: (ms) => recordingAt(at) < ms });

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

    const played = (turn: number, told: Option.Option<Exit.Exit<Status, PlaybackError>>) =>
      Effect.gen(function* () {
        if (held.turn === turn) held.loading = false;
        if (held.turn === turn && Option.isSome(told)) return yield* fromDevice(yield* told.value);
        if (Option.isSome(held.clock) && held.sounding) yield* Effect.ignore(device.pause);
        return yield* current;
      });

    const settle = (step: Step): Effect.Effect<Status, PlaybackError> =>
      Step.$match(step, {
        Answer: ({ status }) => Effect.succeed(status),
        Sound: ({ uri, at, turn, over, options }) =>
          Effect.raceFirst(
            Effect.asSome(Effect.exit(device.play(uri, at, options))),
            Effect.as(Deferred.await(over), Option.none()),
          ).pipe(Effect.flatMap((told) => changing(played(turn, told)))),
      });

    const locked = (step: Effect.Effect<Step, PlaybackError>) =>
      Effect.flatMap(changing(step), settle);

    const soundFrom = (fromMs: number, introOff: boolean) => {
      if (fromMs <= 0 && introOff) return first();
      return fromMs;
    };

    const silentFrom = (fromMs: number, countsIn: boolean) => {
      if (fromMs <= 0 && countsIn && held.intent === 'play') return countFrom;
      return run(Math.max(fromMs, 0) || first(), held.intent === 'play');
    };

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
          return yield* sounded(
            uri,
            soundFrom(fromMs, options?.intro === false),
            options?.continuous === true,
            options,
          );
        if (Option.isNone(held.score))
          return yield* PlaybackError.make({ operation: 'play', message: `no timing for ${uri}` });
        if (held.sounding) yield* device.stop;
        held.sounding = false;
        return yield* answer(silentFrom(fromMs, options?.countIn === true));
      });

    const asks = (key: 'intro' | 'countIn', value: boolean) =>
      Option.exists(held.options, (options) => options[key] === value);

    const resumeClock = (clock: Run) =>
      Effect.gen(function* () {
        held.intent = 'play';
        const now = yield* Clock.currentTimeMillis;
        if (Option.isSome(countingAt(now))) return Step.Answer({ status: clockNow(clock, now) });
        const { at } = placed(clock, now);
        const on = yield* SubscriptionRef.get(sound);
        const uri = Option.getOrElse(held.uri, () => '');
        if (at >= end()) {
          if (on) return yield* sounded(uri, soundFrom(0, asks('intro', false)), false);
          return yield* answer(silentFrom(0, asks('countIn', true)));
        }
        if (on && recordedAt(at)) return yield* sounded(uri, at, false);
        if (Option.isSome(held.count)) return yield* answer(countFrom);
        return yield* answer(run(at, true));
      });

    const seekClock = (clock: Run, ms: number) =>
      Effect.gen(function* () {
        held.count = Option.none();
        const on = yield* SubscriptionRef.get(sound);
        const uri = Option.getOrElse(held.uri, () => '');
        if (on && clock.playing && recordedAt(ms)) return yield* sounded(uri, ms, false);
        return yield* answer(run(Math.min(ms, end()), clock.playing));
      });

    const seekDevice = (ms: number) =>
      Effect.gen(function* () {
        if (Option.isNone(held.score) || recordedAt(ms) || ms >= end())
          return yield* fromDevice(yield* device.seek(recordingAt(ms)));
        const before = yield* device.status;
        yield* device.pause;
        return yield* run(ms, moving(before));
      });

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

    const watching = () =>
      held.sounding && !held.loading && Option.isNone(held.clock) && skips().length > 0;

    const skipFrom = (status: Status): Effect.Effect<Option.Option<number>, PlaybackError> =>
      Effect.gen(function* () {
        if (status.state !== 'playing') return Option.none();
        const at = status.positionMs;
        const next = Arr.findFirst(skips(), (skip) => at < skip.to);
        if (Option.isNone(next)) return Option.none();
        const skip = next.value;
        if (at < skip.from) return Option.some((skip.from - at) / held.rate);
        revision += 1;
        const after = yield* device.seek(skip.to);
        return yield* skipFrom({ ...after, positionMs: Math.max(after.positionMs, skip.to) });
      });

    const skipPaused = (status: Status): Effect.Effect<void, PlaybackError> =>
      Effect.gen(function* () {
        if (status.state !== 'paused') return;
        const at = status.positionMs;
        const into = Arr.findFirst(skips(), (skip) => skip.from <= at && at < skip.to);
        if (Option.isNone(into)) return;
        revision += 1;
        yield* device.seek(into.value.to);
      });

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

    yield* Effect.gen(function* () {
      const woken = ticked;
      const now = yield* Clock.currentTimeMillis;
      yield* SubscriptionRef.set(beat, beatAt(now));
      const change = Deferred.await(woken);
      yield* Option.match(toNextBeat(now), {
        onNone: () => change,
        onSome: (ms) =>
          change.pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.void })),
      });
    }).pipe(Effect.forever, Effect.forkScoped);

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
          if (Option.isSome(countingAt(now))) {
            held.clock = Option.map(held.clock, (clock) => ({ ...clock, at: first() }));
            return;
          }
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
      beats: SubscriptionRef.changes(beat).pipe(Stream.changesWith(sameBeat)),
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
