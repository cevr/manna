// The lab's MCP for the tool tests (`lab-mcp.ts`): the lab served in memory
// with its MCP, and a client of it as one calls `/mcp`.

import { Boolean as Bool, Context, Effect, Layer, Option, Schedule, Schema } from 'effect';
import { labHandler } from '../lab.ts';
import { LabEvents } from '../lab-events.ts';
import { LabAddress } from '../lab-command.ts';
import { type LabMcpNeeds, MCP_PATH, labMcp } from '../lab-mcp.ts';
import { McpEvents } from '../mcp-events.ts';

/** The lab's address on this machine in an MCP test (`localhost`, as `localLink` names a loopback bind): where its local links point. */
export const MCP_BASE = 'http://localhost:4401/';

/** The lab's address on the owner's phone, in an MCP test. */
export const MCP_PHONE = 'http://100.64.0.9:8230/';

/** The server a request comes in on: the lab's own bind. */
export const mcpBound = { hostname: '127.0.0.1', port: 4401 } as const;

/** The lab's handler as a client's request reaches it. */
export type LabFetch = (request: Request, server: typeof mcpBound) => Promise<Response>;

/** How a test's lab delivers MCP events: a delivery tried twice more at once, a callback verified for 10 minutes. */
const MCP_EVENTS_PACE: Parameters<typeof McpEvents.at>[0] = {
  retry: Schedule.forever,
  retries: 2,
  verifiedFor: '10 minutes',
  answerWithin: '10 seconds',
};

/**
 * The lab's handler with its MCP beside it, over a feed the test reads
 * (`look`) when it says, and its event subscriptions (`mcp-events.ts`),
 * which post to their callbacks by fetch.
 */
export const labWithMcp = Effect.gen(function* () {
  const links = { local: MCP_BASE, phone: MCP_PHONE };
  const events = yield* LabEvents.make({ links });
  yield* events.look;
  const services = yield* Effect.context<LabMcpNeeds>();
  const withEvents = Context.add(services, LabEvents, events);
  const subscriptions = yield* Layer.build(
    McpEvents.at(MCP_EVENTS_PACE).pipe(Layer.provide(Layer.succeedContext(withEvents))),
  );
  const mcp = labMcp.pipe(
    Layer.provide(
      Layer.succeedContext(
        Context.add(Context.merge(withEvents, subscriptions), LabAddress, links),
      ),
    ),
  );
  const lab = yield* labHandler(mcp);
  return { lab, events };
});

/** JSON as an MCP request carries it and its answer is read. */
const McpJson = Schema.fromJsonString(Schema.Json);

const writeMcpJson = Schema.encodeSync(McpJson);

const readMcpJson = Schema.decodeUnknownEffect(McpJson);

/** One JSON-RPC message posted to the lab's MCP, `headers` beside the ones every call sends. */
export const mcpPost = (
  lab: LabFetch,
  body: Schema.Json,
  headers: Readonly<Record<string, string>> = {},
) =>
  Effect.promise(() =>
    lab(
      new Request(`${MCP_BASE.slice(0, -1)}${MCP_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
        body: writeMcpJson(body),
      }),
      mcpBound,
    ),
  );

/** The messages of an answer: JSON, or, the client taking both, server-sent events (any notifications the server queued, then the answer). */
const answerTexts = (answer: Response, body: string): ReadonlyArray<string> => {
  const streamed = Option.exists(Option.fromNullishOr(answer.headers.get('content-type')), (type) =>
    type.startsWith('text/event-stream'),
  );
  return Bool.match(streamed, {
    onTrue: () =>
      body
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length)),
    onFalse: () => [body],
  });
};

/**
 * A JSON-RPC client of the lab's MCP: a session started (the test dies when
 * the lab answers the handshake otherwise, or names no session), then each
 * call's result, and each tool's structured answer or its refusal's words.
 */
export const mcpSession = Effect.fn('mcpSession')(function* (lab: LabFetch) {
  const started = yield* mcpPost(lab, {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '0' },
    },
  });
  const id = Option.fromNullishOr(started.headers.get('mcp-session-id'));
  if (started.status !== 200 || Option.isNone(id))
    return yield* Effect.die(`the lab started no MCP session (it answered ${started.status})`);
  const headers = { 'mcp-session-id': id.value, 'mcp-protocol-version': '2025-06-18' };
  const initialized = yield* mcpPost(
    lab,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    headers,
  );
  if (initialized.status !== 202)
    return yield* Effect.die(`the lab answered notifications/initialized ${initialized.status}`);
  let n = 0;
  const call = Effect.fn('mcpSession.call')(function* (method: string, params: Schema.Json) {
    n += 1;
    const asked = n;
    const answer = yield* mcpPost(lab, { jsonrpc: '2.0', id: asked, method, params }, headers);
    const body = yield* Effect.promise(() => answer.text());
    // Read as a client reads JSON: the test names the fields it checks.
    // oxlint-disable-next-line typescript/no-explicit-any -- a test reads an answer's fields as a client reads JSON
    const messages: ReadonlyArray<any> = yield* Effect.orDie(
      Effect.forEach(answerTexts(answer, body), (text) => readMcpJson(text)),
    );
    const said = messages.find((message) => message.id === asked);
    // A JSON-RPC error (the arguments did not decode) is said as a refusal.
    return Option.getOrElse(Option.fromNullishOr(said?.result), () => ({
      isError: true,
      content: [{ type: 'text', text: writeMcpJson(said?.error) }],
    }));
  });
  /** A tool's structured answer, or its refusal's words. */
  const tool = (name: string, args: Schema.Json = {}) =>
    Effect.map(call('tools/call', { name, arguments: args }), (result) =>
      Bool.match(result.isError === true, {
        onTrue: () => ({ refused: String(result.content[0].text) }),
        onFalse: () => result.structuredContent,
      }),
    );
  return { call, tool, session: id.value };
});
