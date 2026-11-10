import {
  Clock,
  Deferred,
  Effect,
  Layer,
  Option,
  Queue,
  References,
  Stream,
  SubscriptionRef,
} from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';

import { targetsOf } from '../follow/seek-targets';
import type { Timeline } from '../follow/timeline';
import type { HymnText } from '../hymns/text';
import type { Move } from '../hymns/chords';
import {
  Command,
  Playback,
  type PlaybackError,
  Player,
  playerOn,
  type Remote,
  type Status,
} from '../player/player';
import { soundOn } from '../player/sound';
import { keptOf } from '../player/stanzas';
import type { HoldCommand, HoldState } from '../player/word-seek';

export const seekText: HymnText = {
  number: 1,
  title: 'Fixture',
  topic: '',
  firstLine: '',
  sections: [
    { kind: 'stanza', n: 1, lines: ['alpha beta', 'alpha beta'] },
    { kind: 'stanza', n: 2, lines: ['alpha beta', 'alpha beta'] },
  ],
};
export const seekTimeline: Timeline = {
  tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
  first: 1000,
  end: 21_000,
  lines: [1000, 6000, 11_000, 16_000].map((start, index) => {
    let syllables = [start + 100, start + 200, start + 200];
    let words = [0, 0, 1];
    if (index === 3) {
      syllables = [];
      words = [];
    }
    return { start, until: start + 5000, syllables, words, played: true, even: false };
  }),
};

export const openWordSeek = (audible = true) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const soundRef = yield* SubscriptionRef.make(audible);
    const remote = yield* Queue.unbounded<Remote>();
    const calls = yield* Queue.unbounded<string>();
    const trace: Array<{ kind: string; ms: number }> = [];
    const gates = new Map<string, Deferred.Deferred<Status, PlaybackError>>();
    let run = { state: 'idle' as Status['state'], at: 0, since: 0, rate: 1 };
    const status = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      let positionMs = run.at;
      if (run.state === 'playing') positionMs += (now - run.since) * run.rate;
      return { state: run.state, positionMs, durationMs: 21_000 };
    });
    const operation = (kind: string, position: Option.Option<number>, state: Status['state']) =>
      Effect.gen(function* () {
        const current = yield* status;
        const ms = Option.getOrElse(position, () => current.positionMs);
        trace.push({ kind, ms });
        run = { ...run, state, at: ms, since: yield* Clock.currentTimeMillis };
        const issued = run;
        yield* Queue.offer(calls, kind);
        const gate = Option.fromUndefinedOr(gates.get(kind));
        if (Option.isSome(gate)) {
          const answer = yield* Deferred.await(gate.value);
          if (run === issued)
            run = {
              ...run,
              state: answer.state,
              at: answer.positionMs,
              since: yield* Clock.currentTimeMillis,
            };
          return answer;
        }
        return yield* status;
      });
    const raw = Playback.of({
      play: (_uri, from) => operation('play', Option.some(from), 'playing'),
      pause: operation('pause', Option.none(), 'paused'),
      resume: operation('resume', Option.none(), 'playing'),
      seek: (ms) => Effect.flatMap(status, (now) => operation('seek', Option.some(ms), now.state)),
      status,
      stop: operation('stop', Option.none(), 'idle').pipe(Effect.asVoid),
      setRate: (rate) =>
        Effect.gen(function* () {
          const before = yield* status;
          run = {
            state: before.state,
            at: before.positionMs,
            since: yield* Clock.currentTimeMillis,
            rate,
          };
        }),
      connection: Stream.make(true),
      remote: Stream.fromQueue(remote),
      announce: () => Effect.void,
    });
    const moves = Atom.family(() => Atom.make<Move>({ transpose: 0, capo: 0 }));
    const tempos = Atom.family(() => Atom.make(100));
    const choices = Atom.family(() => Atom.make<ReadonlyArray<number>>([]));
    const intro = Atom.make(false);
    const sound = Atom.make(audible);
    const targetsFor = (number: number, choice: ReadonlyArray<number>) => {
      if (number !== 1) return Option.none();
      return targetsOf(seekText, seekTimeline, choice);
    };
    const layer = soundOn(
      Layer.succeed(Playback, raw),
      () => Option.some(seekTimeline),
      soundRef,
      (_number, choice) => keptOf(seekText.sections, choice),
    );
    const commands: Array<{ kind: string; ms: number }> = [];
    const commandCalls = yield* Queue.unbounded<string>();
    const observed = Layer.effect(Playback)(
      Effect.gen(function* () {
        const device = yield* Playback;
        const record = (kind: string, ms = 0) =>
          Effect.sync(() => {
            commands.push({ kind, ms });
          }).pipe(Effect.andThen(Queue.offer(commandCalls, kind)));
        return Playback.of({
          ...device,
          pause: record('pause').pipe(Effect.andThen(device.pause)),
          resume: record('resume').pipe(Effect.andThen(device.resume)),
          seek: (ms) => record('seek', ms).pipe(Effect.andThen(device.seek(ms))),
        });
      }),
    ).pipe(Layer.provide(layer));
    const player = playerOn(
      Layer.mergeAll(
        observed,
        Layer.succeed(Clock.Clock, clock),
        Layer.succeed(References.MinimumLogLevel, 'None'),
      ),
      250,
      moves,
      tempos,
      choices,
      intro,
      targetsFor,
      sound,
    );
    const registry = AtomRegistry.make();
    yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()));
    registry.mount(player.send);
    registry.mount(player.remote);
    registry.mount(player.keys);
    registry.mount(player.tempos);
    registry.mount(player.stanzas);
    registry.mount(player.beats);
    const until = <A>(atom: Atom.Atom<A>, predicate: (value: A) => boolean) =>
      AtomRegistry.toStream(registry, atom).pipe(
        Stream.filter(predicate),
        Stream.runHead,
        Effect.map(Option.getOrThrow),
      );
    return {
      player,
      registry,
      trace,
      commands,
      waitCommand: (kind: string) =>
        Stream.fromQueue(commandCalls).pipe(
          Stream.filter((value) => value === kind),
          Stream.runHead,
        ),
      setStatus: (value: Status) =>
        Effect.gen(function* () {
          run = {
            ...run,
            state: value.state,
            at: value.positionMs,
            since: yield* Clock.currentTimeMillis,
          };
        }),
      calls,
      waitCall: (kind: string) =>
        Stream.fromQueue(calls).pipe(
          Stream.filter((value) => value === kind),
          Stream.runHead,
        ),
      gates,
      moves,
      tempos,
      choices,
      intro,
      sound,
      soundRef,
      remote,
      targets: Option.getOrThrow(targetsFor(1, [])),
      untilPlayer: (predicate: (value: Player) => boolean) => until(player.state, predicate),
      untilHold: (tag: HoldState['_tag']) =>
        until(player.hold.state, (value) => value._tag === tag),
      send: (command: Command) => registry.set(player.send, command),
      hold: (command: HoldCommand) => registry.set(player.hold.send, command),
      play: Effect.gen(function* () {
        registry.set(player.send, Command.Start({ track: { number: 1, title: 'Fixture' } }));
        yield* until(player.state, (state) => state._tag !== 'Idle');
        yield* TestClock.adjust(250);
        return yield* until(player.state, Player.$is('Playing'));
      }),
    };
  });
