import {
  Array as Arr,
  Boolean as Bool,
  Data,
  Duration,
  Effect,
  Match,
  Option,
  Predicate,
  Record,
  Ref,
  Result,
  Schema,
} from 'effect';
import type { HeardChange } from '../core/lab-events.ts';
import { AskUnknown } from '../core/refusals.ts';
import type { AskRead } from './asks-mcp.ts';
import { type Heard, type LabFeed, STREAM_PACE, type StreamPace, followLab } from './lab-stream.ts';

const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

export type AskLatch = Data.TaggedEnum<{
  One: { readonly ask: string; readonly step: Option.Option<string> };
  Page: { readonly page: string };
  Any: { readonly production: Option.Option<string> };
}>;
export const AskLatch = Data.taggedEnum<AskLatch>();

class AskWaitTimeout extends Schema.TaggedError<AskWaitTimeout>()('AskWaitTimeout', {
  waited: Schema.String,
}) {
  override get message() {
    return `ask.wait.timeout: no answer after ${this.waited}`;
  }
}

export interface AskFeed<S, E> extends LabFeed<S, E> {
  readonly asks: (session: S) => Effect.Effect<ReadonlyArray<AskRead>, E>;
}

export const ASK_WAIT_PACE: StreamPace = STREAM_PACE;

const moves = (latch: AskLatch, change: HeardChange): boolean =>
  AskLatch.$match(latch, {
    One: ({ ask }) => change.ask === ask,
    Page: () => Predicate.isNotUndefined(change.ask),
    Any: () => change.kind === 'ask.answered',
  });

const holds = (
  latch: AskLatch,
  asks: ReadonlyArray<AskRead>,
  before: ReadonlySet<string>,
): Result.Result<Option.Option<ReadonlyArray<AskRead>>, AskUnknown> => {
  const named = (ask: string) =>
    Result.fromOption(
      Arr.findFirst(asks, (a) => a.ask === ask),
      () => AskUnknown.make({ id: ask }),
    );
  return AskLatch.$match(latch, {
    One: ({ ask, step }) =>
      Result.map(named(ask), (read) =>
        Option.liftPredicate(
          [read],
          () =>
            read.status !== 'asking' ||
            Option.exists(step, (s) => read.answered.some((a) => a.step === s)),
        ),
      ),
    Page: ({ page }) =>
      Result.map(named(page), (read) => {
        const on = Arr.reverse(asks.filter((a) => a.page.id === read.page.id));
        return Option.liftPredicate(on, (all) => all.every((a) => a.status !== 'asking'));
      }),
    Any: ({ production }) =>
      Result.succeed(
        Option.map(
          Arr.findFirst(
            asks,
            (a) =>
              a.status === 'answered' &&
              !before.has(a.ask) &&
              Option.match(production, { onNone: () => true, onSome: (p) => a.production === p }),
          ),
          Arr.of,
        ),
      ),
  });
};

type Latched = Result.Result<ReadonlyArray<AskRead>, AskUnknown>;

const settled = (asks: ReadonlyArray<AskRead>): ReadonlySet<string> =>
  new Set(asks.filter((a) => a.status !== 'asking').map((a) => a.ask));

export const waitForAsk = <S, E extends { readonly message: string }>(
  feed: AskFeed<S, E>,
  latch: AskLatch,
  pace: StreamPace,
  timeout: Option.Option<Duration.Duration>,
  isLost: (error: E) => boolean = () => true,
) =>
  Effect.gen(function* () {
    const before = yield* Ref.make(Option.none<ReadonlySet<string>>());

    const readAsks = (session: S) =>
      Effect.gen(function* () {
        const asks = yield* feed.asks(session);
        if (Option.isNone(yield* Ref.get(before)))
          yield* Ref.set(before, Option.some(settled(asks)));
        const seen = Option.getOrElse(yield* Ref.get(before), () => new Set<string>());
        return holds(latch, asks, seen);
      });

    const latched = (session: S) =>
      Effect.map(readAsks(session), (result) =>
        Result.match(result, {
          onFailure: (unknown): Option.Option<Latched> => Option.some(Result.fail(unknown)),
          onSuccess: (reads): Option.Option<Latched> => Option.map(reads, Result.succeed),
        }),
      );
    const none = Effect.succeed(Option.none<Latched>());
    const held = yield* followLab(
      feed,
      { since: Option.none(), pace, isLost, goneAfter: Option.none() },
      (heard: Heard<S>) =>
        Match.value(heard).pipe(
          Match.tagsExhaustive({
            Connected: ({ session }) => latched(session),
            Answer: ({ session, answer }) =>
              Bool.match(answer.reset || answer.changes.some((change) => moves(latch, change)), {
                onFalse: () => none,
                onTrue: () => latched(session),
              }),
            Lost: ({ reason }) =>
              Effect.as(
                Effect.logWarning(`[ask] wait lab=unreachable reason=${quoted(reason)}`),
                Option.none(),
              ),
          }),
        ),
    );
    return yield* Effect.fromResult(held);
  }).pipe((waiting) =>
    Option.match(timeout, {
      onNone: () => waiting,
      onSome: (after) =>
        Effect.timeoutOrElse(waiting, {
          duration: after,
          orElse: () =>
            Effect.logWarning(`ask.wait.timeout after="${Duration.format(after)}"`).pipe(
              Effect.andThen(Effect.fail(AskWaitTimeout.make({ waited: Duration.format(after) }))),
            ),
        }),
    }),
  );

export const askLines = (read: AskRead): ReadonlyArray<string> => [
  `ask ${read.ask} status=${read.status}${Option.match(Option.fromUndefinedOr(read.step), {
    onNone: () => '',
    onSome: (step) => ` step=${step}`,
  })} page=${read.page.id} by=${read.by} title=${quoted(read.title)}`,
  ...read.answered.map((a) => `answered step=${a.step} at=${a.at}`),
  ...Record.toEntries(read.answers).map(
    ([id, answer]) =>
      `answer ${id} ${Match.value(answer).pipe(
        Match.discriminatorsExhaustive('kind')({
          choose: (c) => `choose value=${c.value} label=${quoted(c.label)}`,
          free_text: (t) => `free_text text=${quoted(t.text)}`,
          skipped: () => 'skipped',
        }),
      )}`,
  ),
  ...Option.toArray(
    Option.map(Option.fromUndefinedOr(read.closed), (why) => `closed why=${quoted(why)}`),
  ),
  `local ${read.links.local}`,
  ...Option.toArray(Option.map(Option.fromUndefinedOr(read.links.phone), (p) => `phone ${p}`)),
];
