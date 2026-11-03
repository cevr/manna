import {
  Array as Arr,
  Duration,
  Effect,
  Equivalence,
  Option,
  Order,
  Schema,
  SchemaIssue,
  SchemaTransformation,
} from 'effect';

import { keysOf, none, REPLACE, type Policy } from './field.js';
import { Raw, readHref, UrlParts, UrlPartsFromHref } from './url-parts.js';

export type ParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

export type Section = Schema.Codec<unknown, unknown>;

export type Param = Schema.Codec<unknown, string>;

export interface Value<Path, Query, Hash> {
  readonly path: Path;
  readonly query: Query;
  readonly hash: Hash;
}

export interface Place<A> {
  readonly pattern: string;
  readonly schema: Schema.Codec<A, string>;
  readonly policies: {
    readonly query: ReadonlyMap<string, Policy>;
    readonly hash: ReadonlyMap<string, Policy>;
  };
}

export type Type<P> = P extends Place<infer A> ? A : never;

const toIssue = (error: Schema.SchemaError): SchemaIssue.Issue => error.issue;

const paramName = (part: string): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(part, (text) => text.startsWith(':')),
    (text) => text.slice(1),
  );

const PathRecord = Schema.Record(Schema.String, Schema.String);

const fromParts = (
  pattern: ReadonlyArray<string>,
  params: Section,
  query: Section,
  hash: Section,
) => {
  const decodePath = (segments: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const fits =
        segments.length === pattern.length &&
        pattern.every((part, index) => Option.isSome(paramName(part)) || part === segments[index]);
      if (!fits) {
        return yield* Effect.fail(
          new SchemaIssue.InvalidValue({ message: `a path /${pattern.join('/')}` }, segments),
        );
      }
      const named = Object.fromEntries(
        pattern.flatMap((part, index) =>
          Option.match(paramName(part), {
            onNone: () => [],
            onSome: (name) => [[name, segments[index] ?? '']],
          }),
        ),
      );
      return yield* Effect.mapError(Schema.decodeEffect(params)(named), toIssue);
    });
  const encodePath = (value: typeof params.Type) =>
    Effect.map(
      Effect.mapError(
        Effect.flatMap(
          Schema.encodeUnknownEffect(params)(value),
          Schema.decodeUnknownEffect(PathRecord),
        ),
        toIssue,
      ),
      (named) =>
        pattern.map((part) =>
          Option.match(paramName(part), {
            onNone: () => part,
            onSome: (name) => named[name] ?? '',
          }),
        ),
    );
  const read = (section: Section, raw: Raw) =>
    Effect.mapError(Schema.decodeEffect(section)(raw), toIssue);
  const write = <S extends Section>(section: S, value: S['Type']) =>
    Effect.mapError(
      Effect.flatMap(Schema.encodeUnknownEffect(section)(value), Schema.decodeUnknownEffect(Raw)),
      toIssue,
    );
  const Value = Schema.Struct({
    path: Schema.toType(params),
    query: Schema.toType(query),
    hash: Schema.toType(hash),
  });
  return UrlParts.pipe(
    Schema.decodeTo(
      Value,
      SchemaTransformation.transformEffect<typeof Value.Type, UrlParts>({
        decode: (parts) =>
          Effect.all({
            path: decodePath(parts.path),
            query: read(query, parts.query),
            hash: read(hash, parts.hash),
          }),
        encode: (value) =>
          Effect.all({
            path: encodePath(value.path),
            query: write(query, value.query),
            hash: write(hash, value.hash),
          }),
      }),
    ),
  );
};

export const make = <
  const P extends string,
  const Params extends { readonly [K in ParamNames<P>]: Param },
  Q extends Section = typeof none,
  H extends Section = typeof none,
>(options: {
  readonly path: P;
  readonly params?: Params;
  readonly query?: Q;
  readonly hash?: H;
}): Place<Value<{ readonly [K in keyof Params]: Params[K]['Type'] }, Q['Type'], H['Type']>> => {
  const pattern = readHref(options.path).path;
  const params: Section = Schema.Struct(options.params ?? {});
  const query: Section = options.query ?? none;
  const hash: Section = options.hash ?? none;
  const erased = UrlPartsFromHref.pipe(Schema.decodeTo(fromParts(pattern, params, query, hash)));
  return {
    pattern: options.path,
    // oxlint-disable-next-line effect/noAs -- see above
    schema: erased as Schema.Codec<
      Value<{ readonly [K in keyof Params]: Params[K]['Type'] }, Q['Type'], H['Type']>,
      string
    >,
    policies: { query: new Map(keysOf(query)), hash: new Map(keysOf(hash)) },
  };
};

export const decode = <A>(place: Place<A>, href: string): Option.Option<A> =>
  Schema.decodeOption(place.schema)(href);

export const decodeEffect = <A>(place: Place<A>, href: string): Effect.Effect<Option.Option<A>> =>
  Effect.option(Schema.decodeEffect(place.schema)(href));

export const href = <A>(place: Place<A>, value: A): string =>
  Schema.encodeSync(place.schema)(value);

export interface Move {
  readonly history: 'push' | 'replace';
  readonly throttle: Option.Option<Duration.Duration>;
}

const sameValues = Arr.makeEquivalence(Equivalence.String);

const changedKeys = (from: Raw, to: Raw): ReadonlyArray<string> =>
  Arr.dedupe([...Object.keys(from), ...Object.keys(to)]).filter(
    (key) => !sameValues(from[key] ?? [], to[key] ?? []),
  );

export const history = <A>(place: Place<A>, from: string, to: string): Move => {
  const written = (link: string): string =>
    Option.match(decode(place, link), {
      onNone: () => link,
      onSome: (value) => href(place, value),
    });
  const before = readHref(written(from));
  const after = readHref(written(to));
  if (!sameValues(before.path, after.path)) {
    return { history: 'push', throttle: Option.none() };
  }
  const policies = [
    ...changedKeys(before.query, after.query).map(
      (key) => place.policies.query.get(key) ?? REPLACE,
    ),
    ...changedKeys(before.hash, after.hash).map((key) => place.policies.hash.get(key) ?? REPLACE),
  ];
  const history = Option.match(
    Arr.findFirst(policies, (policy) => policy.history === 'push'),
    { onNone: () => 'replace' as const, onSome: () => 'push' as const },
  );
  const windows = Arr.getSomes(policies.map((policy) => policy.throttle));
  const throttle = Option.map(
    Option.liftPredicate(windows, (all) => all.length > 0 && all.length === policies.length),
    (all) => Arr.reduce(all, Duration.zero, Order.max(Duration.Order)),
  );
  return { history, throttle };
};
