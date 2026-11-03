import { Clock, Duration, Effect, Option, Ref, Schedule, Schema, type Scope } from 'effect';
import { changeAsked, HeardChange } from '../core/lab-events.ts';
import type { labClient } from './lab-client.ts';
import { Changes } from './lab-commands.ts';

const HeardChanges = Schema.Struct({
  cursor: Schema.String,
  changes: Schema.Array(HeardChange),
  reset: Schema.Boolean,
});
export type HeardChanges = typeof HeardChanges.Type;

export interface LabFeed<S, E> {
  readonly session: Effect.Effect<S, E, Scope.Scope>;
  readonly changes: (
    session: S,
    since: Option.Option<string>,
    wait: number,
  ) => Effect.Effect<HeardChanges, E>;
}

interface FeedOf {
  readonly name?: ReadonlyArray<string>;
  readonly film?: string;
}

type LabClient = Effect.Success<ReturnType<typeof labClient>>;

export const labFeed = (client: LabClient, of: FeedOf = {}) => ({
  session: client.session,
  changes: (session: string, since: Option.Option<string>, wait: number) =>
    Effect.map(
      client.read(
        session,
        Changes,
        {
          ...of,
          ...Option.match(since, { onNone: () => ({}), onSome: (cursor) => ({ since: cursor }) }),
          wait,
        },
        HeardChanges,
      ),
      (answer) => ({ ...answer, changes: answer.changes.filter(asked(of)) }),
    ),
});

const asked =
  (of: FeedOf) =>
  (change: HeardChange): boolean =>
    Option.isSome(Option.fromUndefinedOr(change.id)) ||
    changeAsked(of.name ?? [], Option.fromUndefinedOr(of.film))(change);

export type Heard<S> =
  | {
      readonly _tag: 'Connected';
      readonly session: S;
      readonly cursor: string;
      readonly resumed: boolean;
    }
  | { readonly _tag: 'Answer'; readonly session: S; readonly answer: HeardChanges }
  | { readonly _tag: 'Lost'; readonly reason: string };

export interface StreamPace {
  readonly wait: number;
  readonly retry: Schedule.Schedule<unknown, unknown>;
}

export const STREAM_PACE: StreamPace = {
  wait: 50,
  retry: Schedule.exponential('250 millis').pipe(
    Schedule.modifyDelay(({ duration }) =>
      Effect.succeed(Duration.min(Duration.fromInputUnsafe(duration), Duration.seconds(10))),
    ),
  ),
};

class LabGone extends Schema.TaggedError<LabGone>()('LabGone', {
  waited: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab has not answered for ${this.waited} (${this.reason}): gone`;
  }
}

interface Follow<E> {
  readonly since: Option.Option<string>;
  readonly pace: StreamPace;
  readonly isLost: (error: E) => boolean;
  readonly goneAfter: Option.Option<Duration.Duration>;
}

export const followLab = <S, E extends { readonly message: string }, A, R>(
  feed: LabFeed<S, E>,
  follow: Follow<E>,
  hear: (heard: Heard<S>) => Effect.Effect<Option.Option<A>, E, R>,
): Effect.Effect<A, E | LabGone, R> =>
  Effect.gen(function* () {
    const cursor = yield* Ref.make(follow.since);
    const down = yield* Ref.make(Option.none<number>());
    const answered = yield* Ref.make(false);
    const opened = yield* Ref.make(false);

    const heardBack = Effect.andThen(Ref.set(down, Option.none()), Ref.set(answered, true));

    const connected = Effect.gen(function* () {
      const session = yield* feed.session;
      const now = yield* Option.match(yield* Ref.get(cursor), {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.map(
            Effect.tap(feed.changes(session, Option.none(), 0), heardBack),
            (a) => a.cursor,
          ),
      });
      yield* Ref.set(cursor, Option.some(now));
      const resumed = yield* Ref.getAndSet(opened, true);
      const first = yield* hear({ _tag: 'Connected', session, cursor: now, resumed });
      if (Option.isSome(first)) return first.value;
      while (true) {
        const answer = yield* feed.changes(session, yield* Ref.get(cursor), follow.pace.wait);
        yield* heardBack;
        const heard = yield* hear({ _tag: 'Answer', session, answer });
        yield* Ref.set(cursor, Option.some(answer.cursor));
        if (Option.isSome(heard)) return heard.value;
      }
    });

    const lost = (error: E) =>
      Effect.gen(function* () {
        const at = yield* Clock.currentTimeMillis;
        const since = yield* Ref.get(down);
        if (Option.isNone(since)) {
          yield* Ref.set(down, Option.some(at));
          yield* Effect.asVoid(hear({ _tag: 'Lost', reason: error.message }));
        }
        if (yield* Ref.getAndSet(answered, false)) return Option.none<A>();
        const waited = at - Option.getOrElse(since, () => at);
        if (Option.exists(follow.goneAfter, (after) => waited >= Duration.toMillis(after)))
          return yield* LabGone.make({
            waited: Duration.format(Duration.millis(waited)),
            reason: error.message,
          });
        return yield* Effect.fail(error);
      });

    const outage = Effect.scoped(connected).pipe(
      Effect.asSome,
      Effect.catchIf(follow.isLost, lost),
      Effect.retry({
        schedule: follow.pace.retry,
        while: (error) => !Schema.is(LabGone)(error) && follow.isLost(error),
      }),
    );

    while (true) {
      const ended = yield* outage;
      if (Option.isSome(ended)) return ended.value;
    }
  });
