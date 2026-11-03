import {
  Array as Arr,
  Boolean as Bool,
  Clock,
  Config,
  Context,
  DateTime,
  Duration,
  Effect,
  FiberMap,
  Layer,
  Match,
  Option,
  Path,
  Predicate,
  Random,
  Record,
  Ref,
  Result,
  Schedule,
  Schema,
  type Scope,
} from 'effect';
import { Base64 } from 'effect/encoding';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { LAB_EVENTS, LabChange } from '../core/lab-events.ts';
import {
  DELIVERY_MAX_BYTES,
  Delivery,
  EventArguments,
  type EventSubscription,
  SubscribeParams,
  SubscribeResult,
  type Subscriptions,
  SubscriptionsJson,
  UnsubscribeParams,
  Verification,
  canonicalJson,
  secretKey,
} from '../core/mcp-events.ts';
import { bodyAdmitted } from './api-server.ts';
import { ContentStore, type Manifest } from './content-store.ts';
import { hmacSha256, sameText, sha256Hex } from './digest.ts';
import { objectSchema } from './lab-fields.ts';
import { LAB_SERVER } from './lab-mcp-parts.ts';
import { LabEvents, cursorAfter } from './lab-events.ts';

class EventsRefused extends Schema.TaggedError<EventsRefused>()('EventsRefused', {
  code: Schema.Finite,
  reason: Schema.String,
  callback: Schema.optionalKey(Schema.String),
}) {
  override get message() {
    return this.reason;
  }
}

const INVALID_PARAMS = -32602;
const CALLBACK_ENDPOINT_ERROR = -32015;
const INTERNAL_ERROR = -32603;

const invalid = (reason: string) => EventsRefused.make({ code: INVALID_PARAMS, reason });
const unverified = (callback: 'challenge_failed' | 'timeout' | 'unreachable') =>
  EventsRefused.make({
    code: CALLBACK_ENDPOINT_ERROR,
    reason: `the callback did not verify (${callback})`,
    callback,
  });

interface DeliveryPace {
  readonly retry: Schedule.Schedule<unknown, unknown>;
  readonly retries: number;
  readonly verifiedFor: Duration.Input;
  readonly answerWithin: Duration.Input;
}

const DELIVERY_PACE: DeliveryPace = {
  retry: Schedule.exponential('1 second'),
  retries: 5,
  verifiedFor: '10 minutes',
  answerWithin: '10 seconds',
};

const DEFAULT_TTL = Duration.days(1);
const MIN_TTL = Duration.minutes(1);
const MAX_TTL = Duration.days(30);

const millisOf = (iso: string): number =>
  Option.getOrElse(Option.map(DateTime.make(iso), DateTime.toEpochMillis), () => 0);

const ofSubscription = (subscription: EventSubscription) => ({
  names: [subscription.name],
  ...Option.match(Option.fromUndefinedOr(subscription.arguments.film), {
    onNone: () => ({}),
    onSome: (film) => ({ film }),
  }),
});

const readArguments = Schema.decodeUnknownEffect(EventArguments);
const deliveryJson = Schema.encodeSync(Schema.fromJsonString(Delivery));
const verificationJson = Schema.encodeSync(Schema.fromJsonString(Verification));
const readEcho = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ challenge: Schema.String })),
);
const encodeSubscribed = Schema.encodeSync(SubscribeResult);

const originOf = (url: string): string =>
  Bool.match(URL.canParse(url), {
    onTrue: () => new URL(url).origin,
    onFalse: () => 'unreadable',
  });

const subscriptionId = (url: string, name: string, args: EventArguments): string =>
  `sub_${sha256Hex(canonicalJson({ url, name, arguments: { ...args } })).slice(0, 24)}`;

interface EventDefinition {
  readonly name: string;
  readonly description: string;
  readonly delivery: ReadonlyArray<string>;
  readonly inputSchema: ReturnType<typeof objectSchema>;
  readonly payloadSchema: ReturnType<typeof objectSchema>;
}

const definitions: ReadonlyArray<EventDefinition> = Record.toEntries(LAB_EVENTS).map(
  ([name, event]) => ({
    name,
    description: event.description,
    delivery: ['webhook'],
    inputSchema: objectSchema(EventArguments, 'error'),
    payloadSchema: objectSchema(LabChange),
  }),
);

type Delivered = 'delivered' | 'gone' | 'refused' | 'given up' | 'too large';

class Undelivered extends Schema.TaggedError<Undelivered>()('Undelivered', {
  reason: Schema.String,
}) {}

interface McpEventsService {
  readonly list: ReadonlyArray<EventDefinition>;
  readonly subscribe: (
    params: SubscribeParams,
  ) => Effect.Effect<typeof SubscribeResult.Encoded, EventsRefused>;
  readonly unsubscribe: (params: UnsubscribeParams) => Effect.Effect<void, EventsRefused>;
}

export class McpEvents extends Context.Service<McpEvents, McpEventsService>()(
  '@manna/film/tools/McpEvents',
) {
  static readonly make = Effect.fn('McpEvents.make')(function* (pace: DeliveryPace) {
    const events = yield* LabEvents;
    const store = yield* ContentStore;
    const path = yield* Path.Path;
    const http = yield* HttpClient.HttpClient;
    const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));
    const manifest: Manifest<Subscriptions> = {
      file: path.join(root, 'events', 'subscriptions.json'),
      codec: SubscriptionsJson,
      empty: { subscriptions: [] },
    };
    const running = yield* FiberMap.make<string>();
    const verified = yield* Ref.make(new Map<string, number>());
    const isoNow = Effect.map(DateTime.now, DateTime.formatIso);

    const post = (
      url: string,
      key: Uint8Array,
      headers: { readonly id: string; readonly subscription: string },
      body: string,
    ) =>
      Effect.gen(function* () {
        const seconds = Math.floor((yield* Clock.currentTimeMillis) / 1000);
        const signature = `v1,${Base64.encode(hmacSha256(key, `${headers.id}.${seconds}.${body}`))}`;
        return yield* http
          .execute(
            HttpClientRequest.post(url).pipe(
              HttpClientRequest.setHeaders({
                'webhook-id': headers.id,
                'webhook-timestamp': String(seconds),
                'webhook-signature': signature,
                'x-mcp-subscription-id': headers.subscription,
              }),
              HttpClientRequest.bodyText(body, 'application/json'),
            ),
          )
          .pipe(
            Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'manual' }),
            Effect.timeoutOrElse({
              duration: pace.answerWithin,
              orElse: () => Effect.fail(Undelivered.make({ reason: 'timeout' })),
            }),
            Effect.mapError((error) =>
              Undelivered.make({
                reason: Match.value(error).pipe(
                  Match.tag('HttpClientError', (failed) => `unreachable: ${failed.reason._tag}`),
                  Match.orElse(() => 'timeout'),
                ),
              }),
            ),
          );
      });

    const challengeOf = Effect.map(
      Effect.all(Arr.makeBy(4, () => Random.nextIntBetween(0, 2 ** 32))),
      (words) => words.map((w) => w.toString(16).padStart(8, '0')).join(''),
    );

    const verify = (url: string, key: Uint8Array, id: string) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        if (
          Option.exists(Option.fromUndefinedOr((yield* Ref.get(verified)).get(url)), (u) => u > now)
        )
          return;
        const challenge = yield* challengeOf;
        const answer = yield* post(
          url,
          key,
          { id: `verify_${challenge.slice(0, 12)}`, subscription: id },
          verificationJson({ type: 'verification', challenge }),
        ).pipe(
          Effect.tapError((error) =>
            Effect.logWarning(
              `mcp.events.unverified id=${id} at=${originOf(url)} reason="${error.reason}"`,
            ),
          ),
          Effect.mapError((error) =>
            unverified(
              Bool.match(error.reason === 'timeout', {
                onTrue: () => 'timeout' as const,
                onFalse: () => 'unreachable' as const,
              }),
            ),
          ),
        );
        const text = yield* Effect.orElseSucceed(answer.text, () => '');
        const echoed = Option.getOrElse(
          Option.map(readEcho(text), (echo) => echo.challenge),
          () => text.trim(),
        );
        if (answer.status < 200 || answer.status > 299 || !sameText(echoed, challenge)) {
          yield* Effect.logWarning(
            `mcp.events.unverified id=${id} at=${originOf(url)} status=${answer.status} echoed=${sameText(echoed, challenge)}`,
          );
          return yield* unverified('challenge_failed');
        }
        yield* Ref.update(verified, (all) =>
          new Map(all).set(
            url,
            now + Duration.toMillis(Duration.fromInputUnsafe(pace.verifiedFor)),
          ),
        );
      });

    const kept = (
      change: (all: ReadonlyArray<EventSubscription>) => ReadonlyArray<EventSubscription>,
    ) =>
      store
        .update(manifest, (file) => ({ subscriptions: change(file.subscriptions) }))
        .pipe(Effect.asVoid);

    const keepCursor = (id: string, cursor: string) =>
      kept((all) =>
        all.map((s) =>
          Bool.match(s.id === id, { onTrue: () => ({ ...s, cursor }), onFalse: () => s }),
        ),
      ).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            `mcp.events.cursor.unkept id=${id} cursor=${cursor} reason="${error.message}"`,
          ),
        ),
      );
    const drop = (id: string) => kept((all) => all.filter((s) => s.id !== id));

    const deliver = (
      subscription: EventSubscription,
      key: Uint8Array,
      change: LabChange,
      cursor: string,
    ) =>
      Effect.gen(function* () {
        const eventId = `evt_${change.id}`;
        const body = deliveryJson({
          eventId,
          name: change.kind,
          timestamp: change.at,
          data: change,
          cursor,
        });
        if (new TextEncoder().encode(body).length > DELIVERY_MAX_BYTES) return 'too large' as const;
        const once = Effect.flatMap(
          post(subscription.url, key, { id: eventId, subscription: subscription.id }, body),
          (answer): Effect.Effect<Delivered, Undelivered> =>
            Match.value(answer.status).pipe(
              Match.when(410, () => Effect.succeed<Delivered>('gone')),
              Match.when(413, () => Effect.succeed<Delivered>('refused')),
              Match.when(
                (status) => status >= 200 && status <= 299,
                () => Effect.succeed<Delivered>('delivered'),
              ),
              Match.orElse((status) =>
                Effect.fail(Undelivered.make({ reason: `answered ${status}` })),
              ),
            ),
        );
        return yield* once.pipe(
          Effect.retry({ schedule: pace.retry, times: pace.retries }),
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning(
                `mcp.events.undelivered id=${subscription.id} event=${eventId} reason="${error.reason}"`,
              ),
              'given up' as const,
            ),
          ),
        );
      });

    const deliveries = (subscription: EventSubscription) =>
      Effect.gen(function* () {
        const key = yield* Effect.orDie(Effect.fromResult(secretKey(subscription.secret)));
        const of = ofSubscription(subscription);
        const at = yield* Ref.make(subscription.cursor);
        const gone = Effect.andThen(
          Effect.log(`mcp.events.gone id=${subscription.id} at=${originOf(subscription.url)}`),
          drop(subscription.id),
        );
        const loop = Effect.gen(function* () {
          while (true) {
            const from = yield* Ref.get(at);
            const answer = yield* events.wait(Option.some(from), '50 seconds', of);
            for (const change of answer.changes) {
              const cursor = cursorAfter(answer.cursor, change);
              const delivered = yield* deliver(subscription, key, change, cursor);
              yield* Effect.log(
                `mcp.events.delivery id=${subscription.id} event=${change.kind} cursor=${cursor} outcome="${delivered}"`,
              );
              if (delivered === 'gone') return yield* gone;
              yield* Ref.set(at, cursor);
              yield* keepCursor(subscription.id, cursor);
            }
            if (answer.cursor !== (yield* Ref.get(at))) {
              yield* Ref.set(at, answer.cursor);
              yield* keepCursor(subscription.id, answer.cursor);
            }
          }
        });
        const expiry = Option.map(Option.fromUndefinedOr(subscription.refreshBefore), (iso) =>
          Effect.map(Clock.currentTimeMillis, (now) => Math.max(0, millisOf(iso) - now)),
        );
        return yield* Option.match(expiry, {
          onNone: () => loop,
          onSome: (left) =>
            Effect.flatMap(left, (millis) =>
              Effect.timeoutOrElse(loop, {
                duration: Duration.millis(millis),
                orElse: () =>
                  Effect.andThen(
                    Effect.log(`mcp.events.expired id=${subscription.id}`),
                    drop(subscription.id),
                  ),
              }),
            ),
        });
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning(`mcp.events.stopped id=${subscription.id} reason="${error.message}"`),
        ),
      );

    const run = (subscription: EventSubscription) =>
      FiberMap.run(running, subscription.id, deliveries(subscription));

    const now = yield* Clock.currentTimeMillis;
    const stored = yield* Effect.orElseSucceed(store.read(manifest), () => manifest.empty);
    const expiredBy = (s: EventSubscription) =>
      Option.exists(Option.fromUndefinedOr(s.refreshBefore), (iso) => millisOf(iso) <= now);
    const expired = stored.subscriptions.filter(expiredBy);
    const live = stored.subscriptions.filter((s) => !expiredBy(s));
    yield* Effect.forEach(expired, (s) => Effect.ignore(drop(s.id)), { discard: true });
    yield* Effect.forEach(live, run, { discard: true });

    const subscribe = (params: SubscribeParams) =>
      Effect.gen(function* () {
        if (!Record.keys(LAB_EVENTS).some((known) => known === params.name))
          return yield* invalid(
            `no event ${params.name}: the lab's are ${Record.keys(LAB_EVENTS).join(', ')}`,
          );
        const args = yield* readArguments(params.arguments ?? {}, {
          onExcessProperty: 'error',
        }).pipe(Effect.mapError((error) => invalid(`arguments: ${error.message}`)));
        const key = yield* Effect.fromResult(
          Result.mapError(secretKey(params.delivery.secret), (reason) => invalid(reason)),
        );
        const url = params.delivery.url;
        if (!URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol))
          return yield* invalid(`the callback ${url} is no http(s) URL`);
        const ttl = yield* Match.value(params.ttlMs).pipe(
          Match.when(Predicate.isUndefined, () => Effect.succeedSome(DEFAULT_TTL)),
          Match.when(Predicate.isNull, () => Effect.succeed(Option.none<Duration.Duration>())),
          Match.when(
            (ms) => ms > Duration.toMillis(MAX_TTL),
            (ms) =>
              Effect.fail(
                invalid(
                  `ttlMs ${ms} is longer than the lab keeps a subscription (${Duration.toMillis(MAX_TTL)}, 30 days): ask for no more, or null for no expiry`,
                ),
              ),
          ),
          Match.orElse((ms) => Effect.succeedSome(Duration.max(Duration.millis(ms), MIN_TTL))),
        );
        const id = subscriptionId(url, params.name, args);
        yield* verify(url, key, id);
        const of = { names: [params.name], ...args };
        const asked = Option.fromNullishOr(params.cursor);
        const answer = yield* events.since(asked, of);
        const replayFrom = Option.match(Arr.head(answer.changes), {
          onNone: () => answer.cursor,
          onSome: (first) => cursorAfter(answer.cursor, { seq: first.seq - 1 }),
        });
        const cursor = Option.match(asked, {
          onNone: () => answer.cursor,
          onSome: (given) =>
            Bool.match(answer.reset, { onTrue: () => replayFrom, onFalse: () => given }),
        });
        const at = yield* Clock.currentTimeMillis;
        const refreshBefore = Option.map(ttl, (d) =>
          DateTime.formatIso(DateTime.makeUnsafe(at + Duration.toMillis(d))),
        );
        const iso = yield* isoNow;
        const before = Arr.findFirst(
          (yield* Effect.orElseSucceed(store.read(manifest), () => manifest.empty)).subscriptions,
          (s) => s.id === id,
        );
        const subscription: EventSubscription = {
          id,
          name: params.name,
          arguments: args,
          url,
          secret: params.delivery.secret,
          cursor,
          ...Option.match(refreshBefore, {
            onNone: () => ({}),
            onSome: (r) => ({ refreshBefore: r }),
          }),
          made: Option.match(before, { onNone: () => iso, onSome: (b) => b.made }),
          refreshed: iso,
        };
        yield* kept((all) => [...all.filter((s) => s.id !== id), subscription]).pipe(
          Effect.mapError((error) =>
            EventsRefused.make({ code: INTERNAL_ERROR, reason: error.message }),
          ),
        );
        yield* run(subscription);
        yield* Effect.log(
          `mcp.events.subscribed id=${id} name=${params.name} at=${originOf(url)} cursor=${cursor} truncated=${answer.reset}`,
        );
        return encodeSubscribed({
          id,
          refreshBefore,
          cursor: Option.some(cursor),
          truncated: Option.isSome(asked) && answer.reset,
        });
      });

    const unsubscribe = (params: UnsubscribeParams) =>
      Effect.gen(function* () {
        const args = yield* readArguments(params.arguments ?? {}, {
          onExcessProperty: 'error',
        }).pipe(Effect.mapError((error) => invalid(`arguments: ${error.message}`)));
        const id = subscriptionId(params.delivery.url, params.name, args);
        yield* FiberMap.remove(running, id);
        yield* drop(id).pipe(
          Effect.mapError((error) =>
            EventsRefused.make({ code: INTERNAL_ERROR, reason: error.message }),
          ),
        );
        yield* Effect.log(`mcp.events.unsubscribed id=${id}`);
      });

    return McpEvents.of({ list: definitions, subscribe, unsubscribe });
  });

  static readonly at = (
    pace: DeliveryPace,
  ): Layer.Layer<
    McpEvents,
    Config.ConfigError,
    LabEvents | ContentStore | Path.Path | Scope.Scope
  > => Layer.effect(McpEvents, McpEvents.make(pace)).pipe(Layer.provide(FetchHttpClient.layer));

  static readonly layer = McpEvents.at(DELIVERY_PACE);
}

const Message = Schema.fromJsonString(
  Schema.Struct({
    jsonrpc: Schema.Literal('2.0'),
    id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite])),
    method: Schema.String,
    params: Schema.optionalKey(Schema.Json),
  }),
);
const readMessage = Schema.decodeUnknownOption(Message);

const Discovered = Schema.fromJsonString(
  Schema.StructWithRest(
    Schema.Struct({
      result: Schema.StructWithRest(Schema.Struct({ capabilities: Schema.JsonObject }), [
        Schema.Record(Schema.String, Schema.Json),
      ]),
    }),
    [Schema.Record(Schema.String, Schema.Json)],
  ),
);
const readDiscovered = Schema.decodeUnknownOption(Discovered);

type Id = string | number;

type Answer =
  | { readonly events: ReadonlyArray<EventDefinition> }
  | typeof SubscribeResult.Encoded
  | { readonly [key: string]: never };

const answered = (id: Option.Option<Id>, result: Answer) =>
  HttpServerResponse.jsonUnsafe({
    jsonrpc: '2.0',
    ...Option.match(id, { onNone: () => ({}), onSome: (i) => ({ id: i }) }),
    result: {
      ...result,
      resultType: 'complete',
      _meta: { 'io.modelcontextprotocol/serverInfo': LAB_SERVER },
    },
  });
const refusedWith = (id: Option.Option<Id>, refused: EventsRefused) =>
  HttpServerResponse.jsonUnsafe({
    jsonrpc: '2.0',
    ...Option.match(id, { onNone: () => ({}), onSome: (i) => ({ id: i }) }),
    error: {
      code: refused.code,
      message: Bool.match(refused.code === CALLBACK_ENDPOINT_ERROR, {
        onTrue: () => `CallbackEndpointError: ${refused.reason}`,
        onFalse: () => refused.reason,
      }),
      ...Option.match(Option.fromUndefinedOr(refused.callback), {
        onNone: () => ({}),
        onSome: (reason) => ({ data: { reason } }),
      }),
    },
  });

const paramsOf = <S extends Schema.Top & Schema.ConstraintCodec<unknown, unknown, never, never>>(
  schema: S,
  params: Option.Option<Schema.Json>,
) =>
  Effect.mapError(
    Schema.decodeEffect(schema)(
      Option.getOrElse(params, () => ({})),
      {
        onExcessProperty: 'ignore',
      },
    ),
    (error) => invalid(error.message),
  );

const withEvents = (response: HttpServerResponse.HttpServerResponse) =>
  Match.value(response.body).pipe(
    Match.tag('Uint8Array', (body) =>
      Option.match(readDiscovered(new TextDecoder().decode(body.body)), {
        onNone: () => response,
        onSome: (discovered) =>
          HttpServerResponse.jsonUnsafe(
            {
              ...discovered,
              result: {
                ...discovered.result,
                capabilities: { ...discovered.result.capabilities, events: {} },
              },
            },
            { status: response.status },
          ),
      }),
    ),
    Match.orElse(() => response),
  );

export const eventsRoute = (path: string) =>
  Layer.unwrap(
    Effect.map(McpEvents.use(Effect.succeed), (events) =>
      HttpRouter.middleware(
        (routes) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            if (
              request.method !== 'POST' ||
              new URL(request.url, 'http://lab').pathname !== path ||
              !(yield* bodyAdmitted)
            )
              return yield* routes;
            const message = readMessage(yield* Effect.orElseSucceed(request.text, () => ''));
            if (Option.isNone(message)) return yield* routes;
            const { method } = message.value;
            const id = Option.fromUndefinedOr(message.value.id);
            const params = Option.fromUndefinedOr(message.value.params);
            if (method === 'server/discover') return withEvents(yield* routes);
            const answer = (run: Effect.Effect<Answer, EventsRefused>) =>
              Effect.match(run, {
                onSuccess: (result) => answered(id, result),
                onFailure: (refused) => refusedWith(id, refused),
              });
            return yield* Match.value(method).pipe(
              Match.when('events/list', () => answer(Effect.succeed({ events: [...events.list] }))),
              Match.when('events/subscribe', () =>
                answer(paramsOf(SubscribeParams, params).pipe(Effect.flatMap(events.subscribe))),
              ),
              Match.when('events/unsubscribe', () =>
                answer(
                  paramsOf(UnsubscribeParams, params).pipe(
                    Effect.flatMap(events.unsubscribe),
                    Effect.as({}),
                  ),
                ),
              ),
              Match.orElse(() => routes),
            );
          }),
        { global: true },
      ),
    ),
  );
