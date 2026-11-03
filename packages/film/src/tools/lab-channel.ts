import {
  Array as Arr,
  Boolean as Bool,
  Match,
  Effect,
  Option,
  Queue,
  Schema,
  Stdio,
  Stream,
} from 'effect';
import * as Command from 'effect/cli/Command';
import type { HeardChange } from '../core/lab-events.ts';
import { isLostLab, labClient, labUrl } from './lab-client.ts';
import { type Heard, STREAM_PACE, followLab, labFeed } from './lab-stream.ts';

const CHANNEL = 'claude/channel';

const CHANNEL_EVENT = 'notifications/claude/channel';

const CATCH_UP = 20;

const VERSIONS: ReadonlyArray<string> = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = [
  'Events from the film lab arrive as <channel source="lab-events" kind="…" film="…">: the owner wrote a note, asked a tweak of a board panel, kept a try, approved or withdrew a beat or a render, commented on a render, or a set was published.',
  "Act on one with the lab's MCP tools (server `lab`): read it in full (`notes`, `board`, `catalogue`), do the work, then `reply` on its note saying what changed and where to look, and `resolve` it once made. The event's link opens the place in the lab.",
].join('\n\n');

const Incoming = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite])),
  method: Schema.optionalKey(Schema.String),
  params: Schema.optionalKey(Schema.Json),
});
type Incoming = typeof Incoming.Type;

const JsonText = Schema.fromJsonString(Schema.Json);
const readIncoming = Schema.decodeUnknownOption(Schema.fromJsonString(Incoming));
const writeJson = Schema.encodeSync(JsonText);

const versionFor = (params: Option.Option<Schema.Json>): string =>
  Option.getOrElse(
    Option.filter(
      Option.flatMap(params, (p) =>
        Option.flatMap(
          Option.liftPredicate(p, Schema.is(Schema.Struct({ protocolVersion: Schema.String }))),
          (v) => Option.some(v.protocolVersion),
        ),
      ),
      (v) => VERSIONS.includes(v),
    ),
    () => '2025-06-18',
  );

const result = (id: string | number, value: Schema.Json): Schema.Json => ({
  jsonrpc: '2.0',
  id,
  result: value,
});

const answerTo = (message: Incoming): Option.Option<Schema.Json> =>
  Option.map(Option.fromUndefinedOr(message.id), (id) => {
    switch (message.method) {
      case 'initialize':
        return result(id, {
          protocolVersion: versionFor(Option.fromUndefinedOr(message.params)),
          capabilities: { experimental: { [CHANNEL]: {} }, tools: {} },
          serverInfo: { name: 'lab-events', version: '0.1.0' },
          instructions: INSTRUCTIONS,
        });
      case 'ping':
        return result(id, {});
      case 'tools/list':
        return result(id, { tools: [] });
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `lab-events has no method ${Option.getOrElse(Option.fromUndefinedOr(message.method), () => '(none)')}`,
          },
        };
    }
  });

const metaOf = (change: HeardChange): Record<string, string> => {
  const about: ReadonlyArray<readonly [string, Option.Option<string | number>]> = [
    ['film', Option.fromUndefinedOr(change.film)],
    ['set', Option.fromUndefinedOr(change.set)],
    ['note', Option.fromUndefinedOr(change.note)],
    ['panel', Option.fromUndefinedOr(change.panel)],
    ['beat', Option.fromUndefinedOr(change.beat)],
    ['try', Option.fromUndefinedOr(change.try)],
    ['variant', Option.fromUndefinedOr(change.variant)],
    ['by', Option.fromUndefinedOr(change.by)],
  ];
  return Object.fromEntries([
    ['kind', change.kind],
    ['seq', String(change.seq)],
    ...Arr.getSomes(
      about.map(([key, value]) => Option.map(value, (v) => [key, String(v)] as const)),
    ),
    ['link', change.links.local],
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(change.links.phone), (phone) => ['phone', phone] as const),
    ),
  ]);
};

const channelEvent = (change: HeardChange): Schema.Json => ({
  jsonrpc: '2.0',
  method: CHANNEL_EVENT,
  params: {
    content: Arr.join(
      [
        change.summary,
        ...Option.toArray(
          Option.filter(Option.fromUndefinedOr(change.text), (t) => !change.summary.endsWith(t)),
        ),
        change.links.local,
        ...Option.toArray(Option.fromUndefinedOr(change.links.phone)),
      ],
      '\n',
    ),
    meta: metaOf(change),
  },
});

const caughtUp = (changes: ReadonlyArray<HeardChange>): ReadonlyArray<Schema.Json> => {
  const dropped = changes.length - CATCH_UP;
  const told = changes.slice(-CATCH_UP).map(channelEvent);
  return Bool.match(dropped > 0, {
    onTrue: () => [
      {
        jsonrpc: '2.0',
        method: CHANNEL_EVENT,
        params: {
          content: `The lab restarted or the bridge was away: ${dropped} earlier changes are not sent; call the lab's \`overview\` to catch up.`,
          meta: { kind: 'catch_up', dropped: String(dropped) },
        },
      },
      ...told,
    ],
    onFalse: () => told,
  });
};

const runChannel = (url: string) =>
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio;
    const outgoing = yield* Queue.unbounded<string>();
    const send = (message: Schema.Json) => Queue.offer(outgoing, `${writeJson(message)}\n`);
    const client = yield* labClient(url);
    const feed = labFeed(client);

    const relay = followLab(
      feed,
      { since: Option.none(), pace: STREAM_PACE, isLost: isLostLab, goneAfter: Option.none() },
      (heard: Heard<string>) =>
        Match.value(heard).pipe(
          Match.tagsExhaustive({
            Connected: () => Effect.as(Effect.log('lab.channel.connected'), Option.none()),
            Answer: ({ answer }) =>
              Effect.gen(function* () {
                const told = Bool.match(answer.reset, {
                  onTrue: () => caughtUp(answer.changes),
                  onFalse: () => answer.changes.map(channelEvent),
                });
                yield* Effect.forEach(told, send, { discard: true });
                if (told.length > 0) yield* Effect.log(`lab.channel.sent count=${told.length}`);
                return Option.none();
              }),
            Lost: ({ reason }) =>
              Effect.as(
                Effect.logWarning(`lab.channel.unanswered url=${url} reason="${reason}"`),
                Option.none(),
              ),
          }),
        ),
    );

    const answering = stdio.stdin.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filter((line) => line.trim().length > 0),
      Stream.runForEach((line) =>
        Option.match(readIncoming(line), {
          onNone: () => Effect.logWarning('lab.channel.unread message'),
          onSome: (message) =>
            Effect.gen(function* () {
              yield* Effect.forEach(Option.toArray(answerTo(message)), send, { discard: true });
              if (message.method === 'notifications/initialized') yield* Effect.forkScoped(relay);
            }),
        }),
      ),
    );
    yield* Effect.forkScoped(Stream.fromQueue(outgoing).pipe(Stream.run(stdio.stdout())));
    yield* answering;
  }).pipe(Effect.scoped);

export const channel = Command.make('channel', {}, () =>
  Effect.gen(function* () {
    const url = yield* labUrl;
    yield* runChannel(url);
  }),
).pipe(
  Command.withDescription(
    "Relay the lab's change feed into a Claude Code session as channel events (a stdio server Claude Code spawns)",
  ),
);
