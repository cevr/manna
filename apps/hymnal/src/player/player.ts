import type { Scope } from 'effect';
import {
  Array as Arr,
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Match,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { audioUrl, soundingOffset } from '~/remote';
import { type Move, still } from '~/hymns/chords';

import type { Beat } from './countin';
import * as Proof from './proof';
import { ALL } from './stanzas';
import { DEFAULT_TEMPO, rateOf } from './tempo';

export interface Track {
  readonly number: number;
  readonly title: string;
}

export type Player = Data.TaggedEnum<{
  Idle: {};
  Loading: { readonly track: Track };
  Playing: { readonly track: Track; readonly at: number; readonly length: Option.Option<number> };
  Buffering: {
    readonly track: Track;
    readonly at: number;
    readonly length: Option.Option<number>;
    readonly retry: boolean;
  };
  Paused: { readonly track: Track; readonly at: number; readonly length: Option.Option<number> };
  Ended: { readonly track: Track; readonly length: Option.Option<number> };
  Stopped: { readonly track: Track; readonly at: Option.Option<number> };
  Failed: {
    readonly track: Track;
    readonly offline: boolean;
    readonly at: Option.Option<number>;
  };
}>;
export const Player = Data.taggedEnum<Player>();

export type Command = Data.TaggedEnum<{
  Start: { readonly track: Track };
  Pause: {};
  Resume: {};
  Seek: { readonly seconds: number };
  Follow: {};
}>;
export const Command = Data.taggedEnum<Command>();

type KeyChange = Data.TaggedEnum<{ Key: { readonly number: number; readonly offset: number } }>;
const KeyChange = Data.taggedEnum<KeyChange>();

export type Intent = 'play' | 'pause';

export interface Status {
  readonly state: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'failed';
  readonly positionMs: number;
  readonly durationMs?: number;
  readonly replacementMs?: number;
  readonly recording?: RecordingSelection;
  readonly rate?: number;
  readonly countInMs?: number;
}

export interface PlayOptions {
  readonly continuous: boolean;
  readonly ready: boolean;
  readonly intent?: Intent;
  readonly recording?: { readonly number: number; readonly offset: number };
  readonly rate?: number;
  readonly stanzas?: ReadonlyArray<number>;
  readonly intro?: boolean;
  readonly countIn?: boolean;
}

export interface RecordingSelection {
  readonly number: number;
  readonly requested: number;
  readonly effective: number;
}

export class PlaybackError extends Schema.TaggedError<PlaybackError>()('PlaybackError', {
  operation: Schema.String,
  message: Schema.String,
  positionMs: Schema.optionalKey(Schema.Finite),
}) {}

export type Remote = Data.TaggedEnum<{
  Play: {};
  Pause: {};
  Seek: { readonly seconds: Option.Option<number> };
}>;
export const Remote = Data.taggedEnum<Remote>();

const commandOf: (remote: Remote) => Command = Remote.$match({
  Play: () => Command.Resume(),
  Pause: () => Command.Pause(),
  Seek: ({ seconds }) =>
    Option.match(seconds, {
      onNone: () => Command.Follow(),
      onSome: (to) => Command.Seek({ seconds: to }),
    }),
});

export interface Announcement {
  readonly title: string;
  readonly artist: string;
}

export interface PlaybackApi {
  readonly play: (
    uri: string,
    fromMs: number,
    options?: PlayOptions,
  ) => Effect.Effect<Status, PlaybackError>;
  readonly pause: Effect.Effect<Status, PlaybackError>;
  readonly resume: Effect.Effect<Status, PlaybackError>;
  readonly seek: (positionMs: number) => Effect.Effect<Status, PlaybackError>;
  readonly status: Effect.Effect<Status, PlaybackError>;
  readonly setRate?: (rate: number) => Effect.Effect<void>;
  readonly setStanzas?: (stanzas: ReadonlyArray<number>) => Effect.Effect<void>;
  readonly pace?: Stream.Stream<number>;
  readonly beats?: Stream.Stream<Option.Option<Beat>>;
  readonly selectRecording?: (selection: RecordingSelection) => Effect.Effect<void>;
  readonly stop: Effect.Effect<void, PlaybackError>;
  readonly connection: Stream.Stream<boolean>;
  readonly announce: (announcement: Announcement) => Effect.Effect<void, PlaybackError>;
  readonly remote: Stream.Stream<Remote>;
}

export class Playback extends Context.Service<Playback, PlaybackApi>()('hymnal/Playback') {}

interface Told {
  readonly online: boolean;
  readonly since: number;
}

class Link extends Context.Service<Link, { readonly told: () => Told }>()('hymnal/Link') {}

const linkLayer = Layer.effect(Link)(
  Effect.gen(function* () {
    const device = yield* Playback;
    let told: Told = { online: true, since: yield* Clock.currentTimeMillis };
    yield* Stream.runForEach(device.connection, (online) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        if (online !== told.online) told = { online, since: now };
      }),
    ).pipe(Effect.forkScoped({ startImmediately: true }));
    return Link.of({ told: () => told });
  }),
);

class Answers extends Context.Service<Answers, Scope.Scope>()('hymnal/Answers') {}

const answersLayer = Layer.effect(Answers)(Effect.scope);

export const trackOf: (player: Player) => Option.Option<Track> = Player.$match({
  Idle: () => Option.none(),
  Loading: ({ track }) => Option.some(track),
  Playing: ({ track }) => Option.some(track),
  Buffering: ({ track }) => Option.some(track),
  Paused: ({ track }) => Option.some(track),
  Ended: ({ track }) => Option.some(track),
  Stopped: ({ track }) => Option.some(track),
  Failed: ({ track }) => Option.some(track),
});

const letGo = Predicate.or(Player.$is('Stopped'), Player.$is('Failed'));

const stand = Duration.seconds(2);
const giveUpAfter = Duration.seconds(15);

const seconds = (ms: number) => ms / 1000;

const lengthIn: (player: Player) => Option.Option<number> = Player.$match({
  Idle: () => Option.none(),
  Loading: () => Option.none(),
  Playing: ({ length }) => length,
  Buffering: ({ length }) => length,
  Paused: ({ length }) => length,
  Ended: ({ length }) => length,
  Stopped: () => Option.none(),
  Failed: () => Option.none(),
});

const lengthOf = (status: Status) =>
  Option.fromNullishOr(status.durationMs).pipe(
    Option.filter((ms) => Number.isFinite(ms) && ms > 0),
    Option.map(seconds),
  );

const holdsRecording = (status: Status) =>
  status.state === 'loading' || status.state === 'playing' || status.state === 'paused';

const paceOf = (status: Status) => {
  const rate = status.rate ?? 1;
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return rate;
};

const counting = (status: Status) =>
  Option.fromNullishOr(status.countInMs).pipe(
    Option.filter((ms) => status.state === 'playing' && ms > 0),
  );

const pollAt = (every: Duration.Input, pace: number) =>
  Duration.millis(Math.max(1, Math.floor(Duration.toMillis(every) / pace)));

const placeOf = (proof: Proof.Proof) => Option.map(proof.place, seconds);

interface Held {
  wants: Intent;
  starts: number;
  acts: number;
  proof: Proof.Proof;
  seeking: Option.Option<{ readonly to: number; asking: boolean }>;
  moving: Option.Option<Fiber.Fiber<unknown, unknown>>;
  reading: Option.Option<{
    readonly start: number;
    readonly done: Deferred.Deferred<Proof.Read, PlaybackError>;
  }>;
  resuming: boolean;
  id: number;
  announced: number;
  offset: number;
  replacing: boolean;
  pace: number;
  countEnds: Option.Option<number>;
}

const printed = Atom.make<Move>(still);
const asWritten = Atom.make(DEFAULT_TEMPO);
const everyStanza = Atom.make<ReadonlyArray<number>>(ALL);

const sameStanzas = Arr.makeEquivalence<number>((a, b) => a === b);

export const playerOn = (
  playback: Layer.Layer<Playback>,
  every: Duration.Input,
  moveFor: (number: number) => Atom.Atom<Move> = () => printed,
  tempoFor: (number: number) => Atom.Atom<number> = () => asWritten,
  stanzasFor: (number: number) => Atom.Atom<ReadonlyArray<number>> = () => everyStanza,
  intro?: Atom.Atom<boolean>,
) => {
  const keyFor = Atom.family((number: number) =>
    Atom.map(moveFor(number), (move) => soundingOffset(move.transpose)),
  );
  const rateFor = Atom.family((number: number) => Atom.map(tempoFor(number), rateOf));
  const runtime = Atom.runtime(
    Layer.provideMerge(Layer.mergeAll(linkLayer, answersLayer), playback),
  );
  const state = Atom.make<Player>(Player.Idle()).pipe(Atom.keepAlive);
  const recording = Atom.make<Option.Option<RecordingSelection>>(Option.none()).pipe(
    Atom.keepAlive,
  );
  const held: Held = {
    wants: 'play',
    starts: 0,
    acts: 0,
    proof: Proof.none,
    seeking: Option.none(),
    moving: Option.none(),
    reading: Option.none(),
    resuming: false,
    id: 0,
    announced: -1,
    offset: 0,
    replacing: false,
    pace: 1,
    countEnds: Option.none(),
  };

  const send = runtime
    .fn(
      Effect.fn('Player.send')(function* (command: Command | KeyChange, get: Atom.FnContext) {
        const device = yield* Playback;
        const link = yield* Link;
        const answers = yield* Answers;
        const now = Clock.currentTimeMillis;
        const show = (player: Player) => Effect.sync(() => get.set(state, player));
        const offline = () => !link.told().online;
        const failed = (track: Track) =>
          Player.Failed({ track, offline: offline(), at: placeOf(held.proof) });
        const heardWithin = (at: number) =>
          Option.exists(
            held.proof.heard,
            (it) => !it.acted || at - it.at < Duration.toMillis(stand),
          );
        const act = (target: Option.Option<number>) =>
          Effect.flatMap(now, (at) => {
            held.acts += 1;
            held.proof = Proof.acted(held.proof, at, target);
            const was = get.registry.get(state);
            const kept = Player.$is('Playing')(was) && heardWithin(at);
            if (kept || (!Player.$is('Playing')(was) && !Player.$is('Buffering')(was)))
              return Effect.void;
            return show(
              Player.Buffering({ track: was.track, at: was.at, length: was.length, retry: false }),
            );
          });
        const readDevice = Effect.suspend(() =>
          Option.match(
            Option.filter(held.reading, (reading) => reading.start === held.starts),
            {
              onSome: ({ done }) => Deferred.await(done),
              onNone: () =>
                Effect.gen(function* () {
                  const done = yield* Deferred.make<Proof.Read, PlaybackError>();
                  const start = held.starts;
                  held.reading = Option.some({ start, done });
                  const reading = Effect.gen(function* () {
                    const asked = yield* now;
                    const raw = yield* device.status;
                    let status = raw;
                    if (held.starts === start && held.replacing)
                      status = {
                        ...raw,
                        state: 'loading',
                        positionMs:
                          raw.replacementMs ??
                          Option.getOrElse(held.proof.place, () => raw.positionMs),
                      };
                    return { asked, answered: yield* now, status };
                  }).pipe(
                    Effect.onExit(() =>
                      Effect.sync(() => {
                        if (Option.exists(held.reading, (it) => it.done === done))
                          held.reading = Option.none();
                      }),
                    ),
                    Effect.exit,
                    Effect.flatMap((exit) => Deferred.done(done, exit)),
                  );
                  yield* Effect.forkIn(reading, answers, { startImmediately: true });
                  return yield* Deferred.await(done);
                }),
            },
          ),
        );
        const readFresh = Effect.filterOrElse(
          readDevice,
          (read) =>
            read.asked >= held.proof.known &&
            (read.status.state === 'ended' || read.asked >= held.proof.endedAt),
          () => readDevice,
        );
        const landable = () => Option.exists(held.seeking, (it) => it.asking);
        const lastLook = Effect.suspend(() => {
          const start = held.starts;
          return readFresh.pipe(
            Effect.tap((read) =>
              Effect.sync(() => {
                if (held.starts === start)
                  held.proof = Proof.readOf(held.proof, read, landable()).proof;
              }),
            ),
            Effect.option,
          );
        });
        const answeredAt = (asked: number, to: number) => (status: Status) =>
          Effect.flatMap(now, (at) =>
            Effect.sync(() => {
              held.proof = Proof.answered(held.proof, { asked, answered: at, status }, to).proof;
              if (Option.isNone(held.proof.pending)) held.seeking = Option.none();
            }),
          );
        const replacementLanded = (asked: number, at: number) => (status: Status) =>
          Effect.suspend(() =>
            Option.match(held.proof.pending, {
              onNone: () => answeredAt(asked, at)(status),
              onSome: (pending) => answeredAt(pending.known, pending.target)(status),
            }),
          );
        const cut = Effect.suspend(() => {
          const fiber = held.moving;
          held.moving = Option.none();
          return Option.match(fiber, { onNone: () => Effect.void, onSome: Fiber.interrupt });
        });
        const moves = (operation: Effect.Effect<unknown>) =>
          Effect.gen(function* () {
            yield* cut;
            const fiber = yield* Effect.forkIn(operation, answers, { startImmediately: true });
            held.moving = Option.some(fiber);
          });
        const askSeek = (to: number) =>
          Effect.gen(function* () {
            const seeking = { to, asking: true };
            held.seeking = Option.some(seeking);
            const asked = yield* now;
            yield* device.seek(to).pipe(
              Effect.flatMap(answeredAt(asked, to)),
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.seek.refused').pipe(
                  Effect.annotateLogs({ to, message: error.message }),
                ),
              ),
              Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
            );
          });
        const askAgain = (status: Status) =>
          Effect.suspend(() => {
            if (held.replacing) return Effect.void;
            return Option.match(
              Option.filter(
                held.seeking,
                (it) => !it.asking && holdsRecording(status) && Option.isSome(held.proof.pending),
              ),
              {
                onNone: () => Effect.void,
                onSome: ({ to }) => moves(askSeek(to)),
              },
            );
          });
        const announce = (track: Track) =>
          device
            .announce({ title: track.title, artist: `Hymn ${track.number}` })
            .pipe(
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.announce.failed').pipe(
                  Effect.annotateLogs({ message: error.message }),
                ),
              ),
            );
        const announceOnce = (track: Track, answer: Option.Option<boolean>) =>
          Effect.suspend(() => {
            const page = get.registry.get(state);
            const holds = Option.contains(answer, true) || Player.$is('Playing')(page);
            if (!holds || letGo(page) || held.announced === held.id) return Effect.void;
            held.announced = held.id;
            return Effect.forkDetach(announce(track)).pipe(Effect.asVoid);
          });
        const giveUp = (track: Track) =>
          Effect.logWarning('player.load.stalled').pipe(
            Effect.annotateLogs({ track: track.number }),
            Effect.andThen(show(failed(track))),
            Effect.andThen(cut),
            Effect.andThen(Effect.ignore(device.stop)),
          );
        const seenAt = (track: Track, read: Proof.Read, seen: Proof.Seen): Player => {
          const was = get.registry.get(state);
          const sameTrack = Option.exists(trackOf(was), (it) => it.number === track.number);
          const length = Option.orElse(lengthOf(read.status), () =>
            Option.flatMap(
              Option.liftPredicate(was, () => sameTrack),
              lengthIn,
            ),
          );
          const at = seconds(
            read.status.replacementMs ??
              Option.getOrElse(
                Option.map(held.proof.pending, (it) => it.target),
                () => read.status.positionMs,
              ),
          );
          const quiet = Proof.silentFor(held.proof, read);
          const keptAcross = (it: Proof.Read, by: Proof.Seen) => {
            if (!Option.exists(held.proof.heard, (heard) => heard.acted)) return true;
            if (by === 'ahead') return true;
            if (Option.isSome(held.proof.pending) || it.asked < held.proof.landed)
              return heardWithin(it.asked);
            const quietBefore = Option.exists(held.proof.heard, (heard) => heard.quiet);
            const none = by === 'silence' || by === 'nothing';
            return !(quietBefore && none) || heardWithin(it.asked);
          };
          const buffering = (retry: boolean) =>
            Match.value(held.proof.sounded).pipe(
              Match.when(true, () => Player.Buffering({ track, at, length, retry })),
              Match.orElse(() => Player.Loading({ track })),
            );
          if (seen === 'sound') return Player.Playing({ track, at, length });
          if (held.wants === 'pause') return Player.Paused({ track, at, length });
          if (Option.isSome(counting(read.status)))
            return Player.Playing({ track, at: seconds(read.status.positionMs), length });
          if (quiet >= Duration.toMillis(stand))
            return buffering(quiet >= Duration.toMillis(giveUpAfter) && !offline());
          return Player.$match(was, {
            Playing: () =>
              Match.value(keptAcross(read, seen)).pipe(
                Match.when(true, () => Player.Playing({ track, at, length })),
                Match.orElse(() => buffering(false)),
              ),
            Buffering: () => buffering(false),
            Loading: () => Player.Loading({ track }),
            Idle: () => buffering(false),
            Paused: () => buffering(false),
            Ended: () => buffering(false),
            Stopped: () => buffering(false),
            Failed: () => buffering(false),
          });
        };
        const givenUp = (read: Proof.Read) => {
          const wait = Duration.toMillis(giveUpAfter);
          const told = link.told();
          return (
            held.wants === 'play' &&
            Proof.silentFor(held.proof, read) >= wait &&
            !told.online &&
            read.asked - told.since >= wait
          );
        };
        const heldPaused = Effect.suspend(() => {
          if (held.wants === 'pause') return Effect.void;
          held.wants = 'pause';
          return Effect.ignore(device.pause);
        });
        const readOnce = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            const read = yield* readFresh;
            const status = read.status;
            held.pace = paceOf(status);
            const count = counting(status);
            held.countEnds = Option.map(count, (ms) => read.answered + ms);
            const next = Proof.readOf(held.proof, read, landable());
            held.proof = Option.match(count, {
              onNone: () => next.proof,
              onSome: () => ({ ...next.proof, quietFrom: Option.none() }),
            });
            const answer = yield* Effect.when(Deferred.await(answered), Deferred.isDone(answered));
            if (Option.contains(answer, false)) {
              yield* show(failed(track));
              return false;
            }
            if (next.seen === 'stale') return true;
            if (status.recording?.number === track.number) remember(status.recording);
            yield* askAgain(status);
            let gaveUp = false;
            const done = yield* Match.value(status.state).pipe(
              Match.when('failed', () => Effect.as(show(failed(track)), true)),
              Match.when('ended', () =>
                Effect.as(show(Player.Ended({ track, length: lengthOf(status) })), true),
              ),
              Match.when('idle', () => Effect.as(show(Player.Idle()), true)),
              Match.when('paused', () =>
                Effect.as(
                  show(
                    Player.Paused({
                      track,
                      at: seconds(status.positionMs),
                      length: Option.orElse(lengthOf(status), () =>
                        lengthIn(get.registry.get(state)),
                      ),
                    }),
                  ).pipe(Effect.andThen(heldPaused)),
                  Option.isNone(held.proof.pending),
                ),
              ),
              Match.orElse(() =>
                Effect.suspend(() => {
                  if (givenUp(read)) {
                    gaveUp = true;
                    return Effect.as(giveUp(track), true);
                  }
                  return Effect.as(show(seenAt(track, read, next.seen)), false);
                }),
              ),
            );
            yield* announceOnce(track, answer);
            return !gaveUp && (!done || Option.isNone(answer));
          }).pipe(
            Effect.catchTag('PlaybackError', (error) =>
              Effect.logWarning('player.status.failed').pipe(
                Effect.annotateLogs({ message: error.message }),
                Effect.andThen(show(failed(track))),
                Effect.as(false),
              ),
            ),
          );
        const watch = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            const rest = Deferred.isDone(answered).pipe(
              Effect.flatMap((done) =>
                Match.value(done).pipe(
                  Match.when(true, () =>
                    Effect.flatMap(now, (at) => {
                      const poll = Duration.toMillis(pollAt(every, held.pace));
                      const ms = Option.match(held.countEnds, {
                        onNone: () => poll,
                        onSome: (ends) => Math.min(poll, Math.max(0, ends - at)),
                      });
                      return Effect.sleep(Duration.millis(ms));
                    }),
                  ),
                  Match.orElse(() =>
                    Deferred.await(answered).pipe(
                      Effect.asVoid,
                      Effect.timeoutOrElse({ duration: every, orElse: () => Effect.void }),
                    ),
                  ),
                ),
              ),
            );
            let more = yield* readOnce(track, answered);
            while (more) {
              yield* rest;
              more = yield* readOnce(track, answered);
            }
          });
        const ask = (
          track: Track,
          operation: Effect.Effect<unknown, PlaybackError>,
          refused: (error: PlaybackError) => Effect.Effect<boolean>,
          moving = false,
        ) =>
          Effect.gen(function* () {
            const answered = yield* Deferred.make<boolean>();
            const asking = operation.pipe(
              Effect.as(true),
              Effect.catchTag('PlaybackError', refused),
              Effect.flatMap((goOn) => Deferred.succeed(answered, goOn)),
            );
            yield* Match.value(moving).pipe(
              Match.when(true, () => moves(asking)),
              Match.orElse(() => Effect.forkIn(asking, answers, { startImmediately: true })),
            );
            yield* Effect.interruptible(watch(track, answered));
          });
        const follow = (track: Track) =>
          Deferred.make<boolean>().pipe(
            Effect.tap((answered) => Deferred.succeed(answered, true)),
            Effect.flatMap((answered) => watch(track, answered)),
          );
        const logged = (error: PlaybackError) =>
          Effect.logWarning('player.command.failed').pipe(
            Effect.annotateLogs({ operation: error.operation, message: error.message }),
            Effect.as(true),
          );
        const startedAt = (asked: number, fromMs: number, status: Status) =>
          Effect.sync(() => {
            if (fromMs > 0) return fromMs;
            const start = status.positionMs;
            held.proof = {
              ...held.proof,
              pending: Option.map(held.proof.pending, (it) => {
                if (it.known !== asked || it.target !== fromMs) return it;
                return { ...it, target: start };
              }),
            };
            return start;
          });
        const keyOf = (track: Track) => soundingOffset(get.registry.get(keyFor(track.number)));
        const remember = (selection: RecordingSelection) => {
          const was = get.registry.get(recording);
          if (
            Option.exists(
              was,
              (it) =>
                it.number === selection.number &&
                it.requested === selection.requested &&
                it.effective === selection.effective,
            )
          )
            return;
          get.registry.set(recording, Option.some(selection));
        };
        const introAt = (): Pick<PlayOptions, 'intro' | 'countIn'> =>
          Option.match(Option.fromNullishOr(intro), {
            onNone: () => ({}),
            onSome: (atom) => {
              const on = get.registry.get(atom);
              return { intro: on, countIn: on };
            },
          });
        const playSet = (track: Track, offset: number, fromMs: number, continuous: boolean) =>
          Effect.gen(function* () {
            const id = held.id;
            const began = yield* now;
            const ours = () => held.id === id;
            held.offset = offset;
            held.replacing = offset !== 0 || continuous;
            return yield* device
              .play(audioUrl(track.number, offset), fromMs, {
                continuous,
                ready: offset !== 0 || continuous,
                intent: held.wants,
                recording: { number: track.number, offset },
                rate: get.registry.get(rateFor(track.number)),
                stanzas: get.registry.get(stanzasFor(track.number)),
                ...introAt(),
              })
              .pipe(
                Effect.tap((status) =>
                  Effect.sync(() => {
                    if (ours())
                      remember(
                        status.recording ?? {
                          number: track.number,
                          requested: offset,
                          effective: offset,
                        },
                      );
                  }),
                ),
                Effect.ensuring(
                  Effect.sync(() => {
                    if (ours()) held.replacing = false;
                  }),
                ),
                Effect.tap((status) =>
                  Effect.flatMap(now, (settled) =>
                    Effect.logInfo('player.key.settled').pipe(
                      Effect.annotateLogs({
                        hymn: track.number,
                        requested: offset,
                        started: began,
                        settled,
                        gapMs: settled - began,
                        positionMs: status.positionMs,
                      }),
                    ),
                  ),
                ),
              );
          });
        const load = (track: Track, fromMs: number) =>
          Effect.gen(function* () {
            held.wants = 'play';
            held.resuming = false;
            held.id += 1;
            const offset = keyOf(track);
            held.offset = offset;
            const asked = yield* now;
            held.proof = Proof.loaded(asked, fromMs);
            const seeking = { to: fromMs, asking: true };
            held.seeking = Option.liftPredicate(seeking, () => fromMs > 0);
            yield* show(Player.Loading({ track }));
            const id = held.id;
            const played = playSet(track, offset, fromMs, false).pipe(
              Effect.tap((status) =>
                Effect.when(
                  Effect.flatMap(startedAt(asked, fromMs, status), (to) => {
                    if (offset !== 0) return replacementLanded(asked, to)(status);
                    return answeredAt(asked, to)(status);
                  }),
                  Effect.sync(() => held.id === id),
                ),
              ),
              Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
            );
            yield* ask(
              track,
              played,
              (error) =>
                Effect.logWarning('player.play.failed').pipe(
                  Effect.annotateLogs({ track: track.number, message: error.message }),
                  Effect.as(false),
                ),
              true,
            );
          });
        const current = get.registry.get(state);
        const holding = trackOf(current);
        const onHeld = (run: (track: Track) => Effect.Effect<void>) =>
          Option.match(holding, { onNone: () => Effect.void, onSome: run });
        const resume = (track: Track) => {
          const fromPlace = () =>
            load(
              track,
              Option.getOrElse(held.proof.place, () => 0),
            );
          const resumed = (target: Option.Option<number>, shown: Player) =>
            Effect.gen(function* () {
              held.wants = 'play';
              yield* act(target);
              yield* show(shown);
              yield* ask(track, device.resume, logged);
            });
          if (
            keyOf(track) !== held.offset ||
            (!Player.$is('Playing')(current) &&
              Option.exists(
                get.registry.get(recording),
                (selected) =>
                  selected.number === track.number && selected.requested !== selected.effective,
              ))
          )
            return fromPlace();
          return Player.$match(current, {
            Stopped: fromPlace,
            Failed: fromPlace,
            Buffering: (it) =>
              Match.value(it.retry).pipe(
                Match.when(true, fromPlace),
                Match.orElse(() => resumed(Option.none(), current)),
              ),
            Paused: ({ at, length }) =>
              resumed(
                Option.none(),
                Match.value(held.proof.sounded).pipe(
                  Match.when(true, () => Player.Buffering({ track, at, length, retry: false })),
                  Match.orElse(() => Player.Loading({ track })),
                ),
              ),
            Ended: ({ length }) =>
              Effect.gen(function* () {
                held.resuming = true;
                const read = yield* readFresh.pipe(Effect.option);
                held.resuming = false;
                const again = Option.filter(
                  read,
                  (it) => holdsRecording(it.status) && introAt().intro !== false,
                );
                if (Option.isNone(again))
                  return yield* load(
                    track,
                    Option.getOrElse(held.proof.place, () => 0),
                  );
                held.wants = 'play';
                held.seeking = Option.none();
                yield* cut;
                held.proof = Proof.followed(
                  held.proof,
                  again.value.asked,
                  again.value.status.positionMs,
                );
                yield* show(
                  Player.Buffering({
                    track,
                    at: seconds(again.value.status.positionMs),
                    length,
                    retry: false,
                  }),
                );
                yield* ask(track, device.resume, logged);
              }),
            Idle: () => Effect.void,
            Loading: () => resumed(Option.none(), current),
            Playing: ({ at, length }) =>
              resumed(Option.none(), Player.Buffering({ track, at, length, retry: false })),
          });
        };
        const pause = (track: Track) =>
          Effect.gen(function* () {
            held.wants = 'pause';
            held.resuming = false;
            if (letGo(current)) return;
            if (Player.$is('Loading')(current)) {
              const shown = (look: Option.Option<Proof.Read>) => {
                const end = Option.filter(look, (read) => read.status.state === 'ended');
                const page = Option.match(end, {
                  onNone: () => Player.Stopped({ track, at: placeOf(held.proof) }),
                  onSome: (read) => Player.Ended({ track, length: lengthOf(read.status) }),
                });
                return Effect.sync(() => {
                  get.registry.set(state, page);
                  return Option.isNone(end);
                });
              };
              if (!(yield* shown(yield* lastLook))) return;
              const id = held.id;
              const ours = () => held.id === id;
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const opened = Option.exists(
                    held.proof.last,
                    (last) => last.status.state === 'playing' && Option.isNone(held.proof.place),
                  );
                  if (opened) {
                    const look = yield* lastLook;
                    if (!ours() || !(yield* shown(look))) return;
                  }
                  yield* cut;
                  if (!ours()) return;
                  yield* device.stop.pipe(Effect.catchTag('PlaybackError', logged), Effect.asVoid);
                }),
              );
              return;
            }
            yield* act(Option.none());
            yield* Player.$match(current, {
              Playing: ({ at, length }) => show(Player.Paused({ track, at, length })),
              Buffering: ({ at, length }) => show(Player.Paused({ track, at, length })),
              Idle: () => Effect.void,
              Loading: () => Effect.void,
              Paused: () => Effect.void,
              Ended: () => Effect.void,
              Stopped: () => Effect.void,
              Failed: () => Effect.void,
            });
            yield* ask(track, device.pause, logged);
          });
        const seek = (track: Track, to: number) =>
          Effect.gen(function* () {
            const end = Option.getOrElse(lengthIn(current), () => Number.POSITIVE_INFINITY);
            const ms = Math.min(Math.max(0, to), end) * 1000;
            if (held.resuming && Player.$is('Ended')(current)) return yield* load(track, ms);
            yield* act(Option.some(ms));
            if (letGo(current)) {
              yield* show(
                Player.$match(current, {
                  Stopped: () => Player.Stopped({ track, at: placeOf(held.proof) }),
                  Failed: ({ offline: off }) =>
                    Player.Failed({ track, offline: off, at: placeOf(held.proof) }),
                  Idle: () => current,
                  Loading: () => current,
                  Playing: () => current,
                  Buffering: () => current,
                  Paused: () => current,
                  Ended: () => current,
                }),
              );
              return;
            }
            yield* ask(track, askSeek(ms), logged, !held.replacing);
          });
        if (KeyChange.$is('Key')(command)) {
          const { number, offset } = command;
          return yield* onHeld((track) =>
            Effect.gen(function* () {
              if (
                track.number !== number ||
                keyOf(track) !== soundingOffset(offset) ||
                held.offset === soundingOffset(offset)
              )
                return yield* follow(track);
              const selected = get.registry.get(recording);
              if (
                !held.replacing &&
                Option.exists(
                  selected,
                  (it) => it.number === number && it.effective === soundingOffset(offset),
                )
              ) {
                const selection = {
                  number,
                  requested: soundingOffset(offset),
                  effective: soundingOffset(offset),
                };
                held.offset = selection.requested;
                yield* device.selectRecording?.(selection) ?? Effect.void;
                remember(selection);
                return yield* follow(track);
              }
              if (held.wants === 'pause' || letGo(current) || Player.$is('Ended')(current)) return;
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const before = held.id;
                  const origin = held.acts;
                  const read = yield* readFresh.pipe(
                    Effect.map((it) => it.status),
                    Effect.option,
                  );
                  if (
                    before !== held.id ||
                    keyOf(track) !== soundingOffset(offset) ||
                    held.wants === 'pause'
                  )
                    return;
                  const at = Option.getOrElse(
                    Option.flatMap(read, (it) => Option.fromNullishOr(it.replacementMs)),
                    () => Proof.replacementAt(held.proof, read),
                  );
                  held.id += 1;
                  held.seeking = Option.none();
                  const id = held.id;
                  const asked = yield* now;
                  const continuous = Player.$is('Playing')(current) && origin === held.acts;
                  yield* act(Option.some(at));
                  yield* ask(
                    track,
                    playSet(track, soundingOffset(offset), at, continuous).pipe(
                      Effect.tap((status) =>
                        Effect.when(
                          replacementLanded(asked, at)(status),
                          Effect.sync(() => held.id === id),
                        ),
                      ),
                    ),
                    (error) =>
                      Effect.logWarning('player.key.failed').pipe(
                        Effect.annotateLogs({ hymn: number, offset, operation: error.operation }),
                        Effect.as(false),
                      ),
                    true,
                  );
                }),
              );
            }),
          );
        }
        const subject = Option.liftPredicate(command, Command.$is('Start')).pipe(
          Option.map(({ track }) => track),
          Option.orElse(() => holding),
        );
        return yield* Command.$match(command, {
          Start: ({ track }) =>
            Effect.suspend(() => {
              held.starts += 1;
              return load(track, 0);
            }),
          Pause: () =>
            Option.match(holding, {
              onNone: () => Effect.sync(() => (held.wants = 'pause')),
              onSome: pause,
            }),
          Resume: () => onHeld(resume),
          Seek: ({ seconds: to }) => onHeld((track) => seek(track, to)),
          Follow: () =>
            onHeld((track) =>
              Match.value(letGo(current)).pipe(
                Match.when(true, () => Effect.void),
                Match.orElse(() => act(Option.none()).pipe(Effect.andThen(follow(track)))),
              ),
            ),
        }).pipe(
          Effect.catchDefect((defect) =>
            Effect.logError('player.defect').pipe(
              Effect.annotateLogs({ defect: String(defect) }),
              Effect.andThen(
                Option.match(subject, {
                  onNone: () => Effect.void,
                  onSome: (track) =>
                    show(Player.Failed({ track, offline: false, at: Option.none() })),
                }),
              ),
            ),
          ),
        );
      }),
    )
    .pipe(Atom.keepAlive);

  const remote = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* Stream.runForEach(device.remote, (remote) =>
        Effect.sync(() => get.set(send, commandOf(remote))),
      );
    }),
  );

  const heldNumber = Atom.map(state, (value) =>
    Option.match(trackOf(value), {
      onNone: () => 0,
      onSome: (track) => track.number,
    }),
  );
  const chosen = Atom.make((get) => {
    const number = get(heldNumber);
    if (number === 0) return { number, offset: 0 };
    return { number, offset: soundingOffset(get(keyFor(number))) };
  });
  const keys = runtime.atom((get) =>
    get.stream(chosen).pipe(
      Stream.changesWith((a, b) => a.number === b.number && a.offset === b.offset),
      Stream.runForEach(({ number, offset }) =>
        Effect.sync(() => {
          if (number !== 0 && offset !== held.offset)
            get.set(send, KeyChange.Key({ number, offset }));
        }),
      ),
    ),
  );

  const rate = Atom.make(1).pipe(Atom.keepAlive);
  const heldTempo = Atom.make((get) => {
    const number = get(heldNumber);
    if (number === 0) return { number, rate: 1 };
    return { number, rate: get(rateFor(number)) };
  });
  const tempos = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      const told = get.stream(heldTempo).pipe(
        Stream.changesWith((a, b) => a.number === b.number && a.rate === b.rate),
        Stream.zipWithPrevious,
        Stream.filter(([before, now]) =>
          Option.exists(before, (held) => held.number === now.number),
        ),
        Stream.runForEach(([, now]) => device.setRate?.(now.rate) ?? Effect.void),
      );
      const paced = Stream.runForEach(device.pace ?? Stream.make(1), (to) =>
        Effect.sync(() => get.set(rate, to)),
      );
      yield* Effect.all([told, paced], { concurrency: 'unbounded', discard: true });
    }),
  );

  const shownRate: Atom.Atom<number> = rate;

  const heldStanzas = Atom.make((get) => {
    const number = get(heldNumber);
    if (number === 0) return { number, stanzas: ALL };
    return { number, stanzas: get(stanzasFor(number)) };
  });
  const stanzas = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* get.stream(heldStanzas).pipe(
        Stream.changesWith((a, b) => a.number === b.number && sameStanzas(a.stanzas, b.stanzas)),
        Stream.zipWithPrevious,
        Stream.filter(([before, now]) =>
          Option.exists(before, (held) => held.number === now.number),
        ),
        Stream.runForEach(([, now]) => device.setStanzas?.(now.stanzas) ?? Effect.void),
      );
    }),
  );

  const beat = Atom.make<Option.Option<Beat>>(Option.none()).pipe(Atom.keepAlive);
  const beats = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* Stream.runForEach(device.beats ?? Stream.empty, (to) =>
        Effect.sync(() => get.set(beat, to)),
      );
    }),
  );
  const countIn: Atom.Atom<Option.Option<Beat>> = beat;

  return {
    state,
    send,
    remote,
    keys,
    recording,
    tempos,
    stanzas,
    rate: shownRate,
    beats,
    countIn,
  };
};

export type HymnPlayer = ReturnType<typeof playerOn>;

export const statusEvery = Duration.millis(250);
