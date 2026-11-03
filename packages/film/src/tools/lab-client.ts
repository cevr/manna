import {
  Array as Arr,
  Boolean as Bool,
  Config,
  Duration,
  Effect,
  Option,
  Predicate,
  Ref,
  Schema,
} from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';
import { MCP_PATH } from './lab-mcp.ts';

const PROTOCOL = '2025-06-18';

const END_SECONDS = 5;

export const labUrl = Config.String('FILM_LAB_URL').pipe(
  Config.withDefault('http://127.0.0.1:8229/'),
);

class LabUnanswered extends Schema.TaggedError<LabUnanswered>()('LabUnanswered', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no lab answered at ${this.url} (${this.reason}): start one (from apps/animations: bun run lab, or LAB_PORT=<port> bun cli.ts lab) and point FILM_LAB_URL at it`;
  }
}

class LabAnswerUnread extends Schema.TaggedError<LabAnswerUnread>()('LabAnswerUnread', {
  url: Schema.String,
  tool: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab at ${this.url} answered ${this.tool} in a shape this checkout does not read (${this.reason}): the two run different code, so update the older one (pull this checkout, or restart the lab on the newer code)`;
  }
}

export const isLostLab = (error: { readonly message: string }): boolean =>
  Predicate.isTagged(error, 'LabUnanswered');

class LabToolRefused extends Schema.TaggedError<LabToolRefused>()('LabToolRefused', {
  tool: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab refused ${this.tool}: ${this.reason}`;
  }
}

interface LabTool<P, PE, S, SE> {
  readonly name: string;
  readonly parametersSchema: Schema.Codec<P, PE>;
  readonly successSchema: Schema.Codec<S, SE>;
}

const Sent = Schema.fromJsonString(
  Schema.Struct({
    jsonrpc: Schema.Literal('2.0'),
    id: Schema.optionalKey(Schema.Finite),
    method: Schema.String,
    params: Schema.optionalKey(Schema.Json),
  }),
);

const Call = Schema.fromJsonString(
  Schema.Struct({
    jsonrpc: Schema.Literal('2.0'),
    id: Schema.Finite,
    method: Schema.Literal('tools/call'),
    params: Schema.Struct({ name: Schema.String, arguments: Schema.Json }),
  }),
);

const readJsonValue = Schema.decodeUnknownEffect(Schema.Json);

const Answer = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite])),
  result: Schema.optionalKey(
    Schema.Struct({
      isError: Schema.optionalKey(Schema.Boolean),
      structuredContent: Schema.optionalKey(Schema.Json),
      content: Schema.optionalKey(
        Schema.Array(Schema.Struct({ text: Schema.optionalKey(Schema.String) })),
      ),
    }),
  ),
  error: Schema.optionalKey(Schema.Struct({ message: Schema.String })),
});
const readAnswer = Schema.decodeOption(Schema.fromJsonString(Answer));

const readRefusal = Schema.decodeOption(
  Schema.fromJsonString(Schema.Struct({ reason: Schema.String })),
);

const refusalWords = (text: string): string =>
  Option.getOrElse(
    Option.map(readRefusal(text), (r) => r.reason),
    () => text,
  );

const messagesOf = (contentType: Option.Option<string>, body: string): ReadonlyArray<string> =>
  Bool.match(
    Option.exists(contentType, (t) => t.startsWith('text/event-stream')),
    {
      onTrue: () =>
        body
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length)),
      onFalse: () => [body],
    },
  );

export const labClient = Effect.fn('LabClient.make')(function* (url: string) {
  const http = yield* HttpClient.HttpClient;
  const endpoint = new URL(MCP_PATH, url).href;
  const ids = yield* Ref.make(0);
  const unanswered = (reason: string) => LabUnanswered.make({ url, reason });
  const unread = (tool: string, reason: string) => LabAnswerUnread.make({ url, tool, reason });

  const post = (body: string, session: Option.Option<string>) =>
    http
      .execute(
        HttpClientRequest.post(endpoint).pipe(
          HttpClientRequest.setHeaders({
            accept: 'application/json, text/event-stream',
            ...Option.match(session, {
              onNone: () => ({}),
              onSome: (id) => ({ 'mcp-session-id': id, 'mcp-protocol-version': PROTOCOL }),
            }),
          }),
          HttpClientRequest.bodyText(body, 'application/json'),
        ),
      )
      .pipe(Effect.mapError((error) => unanswered(error.message)));

  const send = (message: typeof Sent.Type, session: Option.Option<string>) =>
    Effect.flatMap(Effect.orDie(Schema.encodeEffect(Sent)(message)), (body) => post(body, session));

  const initialize = Effect.gen(function* () {
    const started = yield* send(
      {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: 'film', version: '0.1.0' },
        },
      },
      Option.none(),
    );
    return yield* Effect.fromOption(
      Option.filter(
        Option.fromUndefinedOr(started.headers['mcp-session-id']),
        (id) => id.length > 0,
      ),
      () => unanswered(`it answered ${started.status} and no session`),
    );
  });

  const end = (session: string) =>
    http
      .execute(
        HttpClientRequest.delete(endpoint).pipe(
          HttpClientRequest.setHeaders({
            'mcp-session-id': session,
            'mcp-protocol-version': PROTOCOL,
          }),
        ),
      )
      .pipe(
        Effect.tap((ended) =>
          Effect.logDebug(`lab.client.ended url=${url} status=${ended.status}`),
        ),
        Effect.timeout(Duration.seconds(END_SECONDS)),
        Effect.ignore,
      );

  const session = Effect.gen(function* () {
    const id = yield* Effect.acquireRelease(Effect.interruptible(initialize), end);
    yield* send({ jsonrpc: '2.0', method: 'notifications/initialized' }, Option.some(id));
    return id;
  });

  const callJson = (session: string, name: string, args: Schema.Json) =>
    Effect.gen(function* () {
      const id = yield* Ref.updateAndGet(ids, (n) => n + 1);
      const refused = (reason: string) => LabToolRefused.make({ tool: name, reason });
      const body = yield* Effect.orDie(
        Schema.encodeEffect(Call)({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      );
      const answered = yield* post(body, Option.some(session));
      if (answered.status !== 200) return yield* unanswered(`it answered ${answered.status}`);
      const text = yield* answered.text.pipe(Effect.mapError((error) => unanswered(error.message)));
      const answer = yield* Effect.fromOption(
        Arr.findFirst(
          Arr.getSomes(
            messagesOf(Option.fromUndefinedOr(answered.headers['content-type']), text).map((m) =>
              readAnswer(m),
            ),
          ),
          (m) => m.id === id,
        ),
        () => unanswered(`it sent no answer to ${name}`),
      );
      const unread = Option.fromUndefinedOr(answer.error);
      if (Option.isSome(unread)) return yield* refused(unread.value.message);
      const result = yield* Effect.fromOption(Option.fromUndefinedOr(answer.result), () =>
        unanswered(`it sent ${name} no result`),
      );
      if (result.isError === true)
        return yield* refused(
          refusalWords(
            Option.getOrElse(
              Option.flatMap(Arr.head(result.content ?? []), (c) => Option.fromUndefinedOr(c.text)),
              () => '(no words)',
            ),
          ),
        );
      return yield* Effect.fromOption(Option.fromUndefinedOr(result.structuredContent), () =>
        unanswered(`it sent ${name} no structured answer`),
      );
    });

  const read = <P, PE, S, SE, A, AE>(
    session: string,
    tool: LabTool<P, PE, S, SE>,
    params: P,
    success: Schema.Codec<A, AE>,
  ) =>
    Effect.gen(function* () {
      const args = yield* Schema.encodeEffect(tool.parametersSchema)(params).pipe(
        Effect.flatMap((encoded) => readJsonValue(encoded)),
        Effect.mapError((error) =>
          LabToolRefused.make({
            tool: tool.name,
            reason: `its arguments do not fit: ${error.message}`,
          }),
        ),
      );
      const json = yield* callJson(session, tool.name, args);
      return yield* Schema.decodeUnknownEffect(success)(json).pipe(
        Effect.mapError((error) => unread(tool.name, error.message)),
      );
    });

  const call = <P, PE, S, SE>(session: string, tool: LabTool<P, PE, S, SE>, params: P) =>
    read(session, tool, params, tool.successSchema);

  return { url, session, call, read, callJson };
});
