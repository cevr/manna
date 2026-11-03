import { Array as Arr, Match, Option, Order, Result, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { LabChange } from './lab-events.ts';

export const DELIVERY_MAX_BYTES = 256 * 1024;

export const EventArguments = Schema.Struct({
  film: Schema.optionalKey(
    Schema.String.annotate({ description: "Only this film's events; every film's when left out" }),
  ),
});
export type EventArguments = typeof EventArguments.Type;

const Webhook = Schema.Struct({
  mode: Schema.Literal('webhook'),
  url: Schema.String,
  secret: Schema.String,
});

export const SubscribeParams = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  delivery: Webhook,
  cursor: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ttlMs: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
});
export type SubscribeParams = typeof SubscribeParams.Type;

export const UnsubscribeParams = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  delivery: Schema.Struct({ mode: Schema.Literal('webhook'), url: Schema.String }),
});
export type UnsubscribeParams = typeof UnsubscribeParams.Type;

export const SubscribeResult = Schema.Struct({
  id: Schema.String,
  refreshBefore: Schema.OptionFromNullOr(Schema.String),
  cursor: Schema.OptionFromNullOr(Schema.String),
  truncated: Schema.Boolean,
});

export const EventSubscription = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  arguments: EventArguments,
  url: Schema.String,
  secret: Schema.String,
  cursor: Schema.String,
  refreshBefore: Schema.optionalKey(Schema.String),
  made: Schema.String,
  refreshed: Schema.String,
});
export type EventSubscription = typeof EventSubscription.Type;

export const SubscriptionsJson = Schema.fromJsonString(
  Schema.Struct({ subscriptions: Schema.Array(EventSubscription) }),
);
export type Subscriptions = typeof SubscriptionsJson.Type;

export const Verification = Schema.Struct({
  type: Schema.Literal('verification'),
  challenge: Schema.String,
});

export const Delivery = Schema.Struct({
  eventId: Schema.String,
  name: Schema.String,
  timestamp: Schema.String,
  data: LabChange,
  cursor: Schema.String,
});

const SECRET_PREFIX = 'whsec_';

export const secretKey = (secret: string): Result.Result<Uint8Array, string> =>
  Result.flatMap(
    Result.fromOption(
      Option.liftPredicate(secret, (s) => s.startsWith(SECRET_PREFIX)),
      () => `the secret does not start with ${SECRET_PREFIX}`,
    ),
    (s) =>
      Result.flatMap(
        Result.mapError(
          Base64.decode(s.slice(SECRET_PREFIX.length)),
          () => 'the secret is not base64',
        ),
        (key) =>
          Result.fromOption(
            Option.liftPredicate(key, (k) => k.length >= 24 && k.length <= 64),
            () => `the secret is ${key.length} bytes, not 24 to 64`,
          ),
      ),
  );

const isJsonObject = Schema.is(Schema.JsonObject);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

const BY_KEY = Order.mapInput(Order.String, ([key]: readonly [string, Schema.Json]) => key);

const ordered = (value: Schema.Json): Schema.Json =>
  Match.value(value).pipe(
    Match.when(isJsonArray, (all) => all.map(ordered)),
    Match.when(isJsonObject, (record) =>
      Object.fromEntries(
        Arr.sort(Object.entries(record), BY_KEY).map(([key, inner]) => [key, ordered(inner)]),
      ),
    ),
    Match.orElse(() => value),
  );

export const canonicalJson = (value: Schema.Json): string => jsonText(ordered(value));
