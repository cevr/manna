import {
  Boolean as Bool,
  Console,
  type Duration,
  Effect,
  Match,
  Option,
  Record,
  Ref,
  Schema,
} from 'effect';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { FetchHttpClient } from 'effect/http';
import { HeardChange, LAB_EVENTS, isKnownChange } from '../core/lab-events.ts';
import { critiqueDone } from './easel-mcp.ts';
import { failureLine, labCliCommands } from './lab-cli.ts';
import { hereCommands, inLabCommands } from './lab-commands.ts';
import { isLostLab, labClient, labUrl } from './lab-client.ts';
import { cursorAfter } from './lab-events.ts';
import {
  type HeardChanges,
  type Heard,
  STREAM_PACE,
  type StreamPace,
  followLab,
  labFeed,
} from './lab-stream.ts';

const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const eventJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ cursor: Schema.String, event: HeardChange })),
);
const cursorJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ cursor: Schema.String })),
);

const ABOUT = ['film', 'set', 'note', 'panel', 'address', 'ask', 'step', 'production'] as const;

const eventLine = (cursor: string, change: HeardChange): string =>
  [
    change.kind,
    `cursor=${cursor}`,
    `at=${change.at}`,
    ...Option.toArray(Option.map(Option.fromUndefinedOr(change.id), (id) => `id=${id}`)),
    ...ABOUT.flatMap((key) =>
      Option.toArray(Option.map(Option.fromUndefinedOr(change[key]), (value) => `${key}=${value}`)),
    ),
    `summary=${quoted(change.summary)}`,
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(change.read), (read) => `read=${quoted(read.cli)}`),
    ),
    `link=${change.links.local}`,
  ].join(' ');

interface Printing {
  readonly json: boolean;
}

const printed = (answer: HeardChanges, printing: Printing, foreign: Ref.Ref<ReadonlySet<string>>) =>
  Effect.forEach(
    answer.changes,
    (change) =>
      Effect.gen(function* () {
        const told = yield* Ref.get(foreign);
        if (!isKnownChange(change) && !told.has(change.kind)) {
          yield* Ref.set(foreign, new Set([...told, change.kind]));
          yield* Console.error(
            `lab events: ${Bool.match(
              Record.keys(LAB_EVENTS).some((known) => known === change.kind),
              {
                onTrue: () => `${change.kind} came in a shape this checkout does not read`,
                onFalse: () => `${change.kind} is an event this checkout does not know`,
              },
            )} (the lab runs other code): printed from the fields every event has`,
          );
        }
        const cursor = cursorAfter(answer.cursor, change);
        yield* Console.log(
          Bool.match(printing.json, {
            onTrue: () => eventJson({ cursor, event: change }),
            onFalse: () => eventLine(cursor, change),
          }),
        );
      }),
    { discard: true },
  );

const resetSaid = (answer: HeardChanges) =>
  Effect.when(
    Console.error(
      `lab events: the lab no longer knows that cursor (it restarted, or the events aged out); these are every event it kept, read on from ${answer.cursor}`,
    ),
    Effect.succeed(answer.reset),
  );

interface EventsInput {
  readonly follow: boolean;
  readonly name: ReadonlyArray<string>;
  readonly film: Option.Option<string>;
  readonly since: Option.Option<string>;
  readonly json: boolean;
  readonly goneAfter: Option.Option<Duration.Duration>;
}

const events = Effect.fn('film.lab.events')(function* (input: EventsInput, pace: StreamPace) {
  const url = yield* labUrl;
  const client = yield* labClient(url);
  const feed = labFeed(client, {
    ...Option.match(
      Option.liftPredicate(input.name, (n) => n.length > 0),
      {
        onNone: () => ({}),
        onSome: (name) => ({ name }),
      },
    ),
    ...Option.match(input.film, { onNone: () => ({}), onSome: (film) => ({ film }) }),
  });
  const foreign = yield* Ref.make<ReadonlySet<string>>(new Set());
  if (!input.follow)
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const answer = yield* feed.changes(yield* feed.session, input.since, 0);
        yield* resetSaid(answer);
        yield* printed(answer, input, foreign);
        yield* Console.log(
          Bool.match(input.json, {
            onTrue: () => cursorJson({ cursor: answer.cursor }),
            onFalse: () => `cursor=${answer.cursor}`,
          }),
        );
      }),
    );
  const none = Effect.succeed(Option.none<never>());
  return yield* followLab(
    feed,
    { since: input.since, pace, isLost: isLostLab, goneAfter: input.goneAfter },
    (heard: Heard<string>) =>
      Match.value(heard).pipe(
        Match.tagsExhaustive({
          Connected: ({ cursor, resumed }) =>
            Effect.as(
              Console.error(
                Bool.match(resumed, {
                  onTrue: () => `lab events: reconnected to ${url}, reading on from ${cursor}`,
                  onFalse: () => `lab events: following ${url} from ${cursor}`,
                }),
              ),
              Option.none<never>(),
            ),
          Answer: ({ answer }) =>
            Effect.andThen(
              Effect.andThen(resetSaid(answer), printed(answer, input, foreign)),
              none,
            ),
          Lost: ({ reason }) =>
            Effect.as(
              Console.error(`lab events: lost the lab (${reason}); asking again`),
              Option.none<never>(),
            ),
        }),
      ),
  );
});

const labEventsAt = (pace: StreamPace) =>
  Command.make(
    'events',
    {
      follow: Flag.Boolean('follow').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          'keep running and print each event as the lab sees it (a lost lab is asked again)',
        ),
      ),
      name: Flag.String('name').pipe(
        Flag.atLeast(0),
        Flag.withDescription(
          'only the events of this name, a glob over the catalogue (ask.*, *.approved); repeat for more',
        ),
      ),
      film: Flag.String('film').pipe(
        Flag.optional,
        Flag.withDescription('only the events about this film'),
      ),
      since: Flag.String('since').pipe(
        Flag.optional,
        Flag.withDescription(
          "read past this cursor (a line's cursor=, or `changes`'s); none: from now",
        ),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription('print each event as one JSON line: {"cursor":…,"event":…}'),
      ),
      goneAfter: Flag.String('gone-after').pipe(
        Flag.withSchema(Schema.DurationFromString),
        Flag.optional,
        Flag.withDescription(
          'with --follow: end, non-zero, once the lab has not answered for this long ("10 minutes"); none: never',
        ),
      ),
    },
    (input: EventsInput) =>
      events(input, pace).pipe(
        Effect.tapError((error) =>
          Effect.when(Console.log(failureLine(error)), Effect.succeed(input.json)),
        ),
      ),
  ).pipe(
    Command.withDescription(
      "The lab's events (the catalogue `changes` reads) from the running lab (FILM_LAB_URL): with --follow, one line per event as it happens, for a Monitor to wake on",
    ),
    Command.provide(FetchHttpClient.layer),
  );

export const labSubcommands = (films: string) => [
  ...labCliCommands(
    { here: hereCommands, inLab: inLabCommands },
    { films },
    { critique: critiqueDone },
  ),
  labEventsAt(STREAM_PACE),
];
