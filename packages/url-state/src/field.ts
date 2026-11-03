import {
  Array as Arr,
  Duration,
  Effect,
  Option,
  Schema,
  SchemaGetter,
  SchemaTransformation,
} from 'effect';
import type { SchemaIssue } from 'effect';

import { Raw } from './url-parts.js';

export interface Policy {
  readonly history: 'push' | 'replace';
  readonly throttle: Option.Option<Duration.Duration>;
}

export const REPLACE: Policy = { history: 'replace', throttle: Option.none() };

declare module 'effect/Schema' {
  namespace Annotations {
    interface Annotations {
      readonly urlStatePolicy?: Policy;
      readonly urlStateKeys?: ReadonlyArray<readonly [key: string, policy: Policy]>;
    }
  }
}

export interface PolicyOptions {
  readonly history?: 'push' | 'replace';
  readonly throttle?: Duration.Input;
}

const policyOf = (options: PolicyOptions): Policy => ({
  history: options.history ?? 'replace',
  throttle: Option.map(Option.fromUndefinedOr(options.throttle), Duration.fromInputUnsafe),
});

const toIssue = (error: Schema.SchemaError): SchemaIssue.Issue => error.issue;

const orDefault = <A, E>(codec: Schema.Codec<A, E>, fallback: A) =>
  codec.pipe(
    Schema.catchDecoding((issue) =>
      Effect.as(
        Effect.logDebug(`url-state.key.invalid issue=${String(issue)}`),
        Option.some(fallback),
      ),
    ),
  );

const Values = Schema.optionalKey(Schema.Array(Schema.String));

export const key = <A>(
  codec: Schema.Codec<A, string>,
  options: PolicyOptions & { readonly default: NoInfer<A> },
) => {
  const total = orDefault(codec, options.default);
  const written = Schema.encodeSync(codec)(options.default);
  return Values.pipe(
    Schema.decodeTo(Schema.toType(codec), {
      decode: SchemaGetter.transformOptionalEffect((values: Option.Option<ReadonlyArray<string>>) =>
        Option.match(Option.flatMap(values, Arr.head), {
          onNone: () => Effect.succeedSome(options.default),
          onSome: (text) =>
            Effect.asSome(Effect.mapError(Schema.decodeEffect(total)(text), toIssue)),
        }),
      ),
      encode: SchemaGetter.transformOptionalEffect((value: Option.Option<A>) =>
        Option.match(value, {
          onNone: () => Effect.succeedNone,
          onSome: (a) =>
            Effect.map(Effect.mapError(Schema.encodeEffect(codec)(a), toIssue), (text) =>
              Option.liftPredicate([text], () => text !== written),
            ),
        }),
      ),
    }),
  ).annotate({ urlStatePolicy: policyOf(options) });
};

export const keys = <A>(
  codec: Schema.Codec<A, ReadonlyArray<string>>,
  options: PolicyOptions = {},
) => {
  const fallback = Schema.decodeSync(codec)([]);
  const total = orDefault(codec, fallback);
  return Values.pipe(
    Schema.decodeTo(Schema.toType(codec), {
      decode: SchemaGetter.transformOptionalEffect((values: Option.Option<ReadonlyArray<string>>) =>
        Effect.asSome(
          Effect.mapError(Schema.decodeEffect(total)(Option.getOrElse(values, () => [])), toIssue),
        ),
      ),
      encode: SchemaGetter.transformOptionalEffect((value: Option.Option<A>) =>
        Option.match(value, {
          onNone: () => Effect.succeedNone,
          onSome: (a) =>
            Effect.map(Effect.mapError(Schema.encodeEffect(codec)(a), toIssue), (written) =>
              Option.liftPredicate(written, Arr.isReadonlyArrayNonEmpty),
            ),
        }),
      ),
    }),
  ).annotate({ urlStatePolicy: policyOf(options) });
};

const ownValues = (raw: Raw, name: string): Option.Option<ReadonlyArray<string>> =>
  Option.flatMap(
    Option.liftPredicate(name, (key) => Object.hasOwn(raw, key)),
    (key) => Option.fromUndefinedOr(raw[key]),
  );

export const keysOf = (section: Schema.Top): ReadonlyArray<readonly [string, Policy]> =>
  Schema.resolveAnnotations(section)?.urlStateKeys ?? [];

export const struct = <
  const Fields extends Schema.Struct.Fields,
  const Keys extends { readonly [K in keyof Fields]?: string } = {},
>(
  fields: Fields,
  options: { readonly keys?: Keys } = {},
) => {
  const renames: { readonly [K in keyof Fields]?: string } = options.keys ?? {};
  const renamed: Readonly<Partial<Record<string, string>>> = renames;
  const written = Object.entries(fields).map(([property, field]): readonly [string, Policy] => [
    Option.getOrElse(Option.fromUndefinedOr(renamed[property]), () => property),
    Option.getOrElse(
      Option.fromUndefinedOr(Schema.resolveAnnotations(field)?.urlStatePolicy),
      () => REPLACE,
    ),
  ]);
  return Schema.Struct(fields).pipe(Schema.encodeKeys(renames)).annotate({ urlStateKeys: written });
};

export const none = struct({});

export interface IndexedOptions {
  readonly max: number;
  readonly key: (name: string, index: number) => string;
  readonly marker: string;
}

export const indexed = <S extends Schema.Codec<unknown, unknown>>(
  section: S,
  options: IndexedOptions,
) => {
  const names = keysOf(section).map(([name]) => name);
  const present = (raw: Raw, index: number): boolean =>
    names.some((name) => Object.hasOwn(raw, options.key(name, index)));
  const copies = (raw: Raw): number => {
    let count = 1;
    while (count < options.max && present(raw, count)) count += 1;
    return count;
  };
  const readCopy = (raw: Raw, index: number) =>
    Effect.mapError(
      Schema.decodeEffect(section)(
        Object.fromEntries(
          names.flatMap((name) =>
            Option.match(ownValues(raw, options.key(name, index)), {
              onNone: () => [],
              onSome: (values) => [[name, values] as const],
            }),
          ),
        ),
      ),
      toIssue,
    );
  const writeCopy = (copy: S['Type'], index: number) =>
    Effect.gen(function* () {
      const written = yield* Effect.mapError(
        Effect.flatMap(Schema.encodeUnknownEffect(section)(copy), Schema.decodeUnknownEffect(Raw)),
        toIssue,
      );
      const marked = index > 0;
      return names.flatMap((name): Array<readonly [string, ReadonlyArray<string>]> =>
        Option.match(ownValues(written, name), {
          onSome: (values) => [[options.key(name, index), values]],
          onNone: () => {
            if (marked && name === options.marker) return [[options.key(name, index), ['']]];
            return [];
          },
        }),
      );
    });
  const Copies = Schema.NonEmptyArray(Schema.toType(section)).check(
    Schema.isMaxLength(options.max),
  );
  return Raw.pipe(
    Schema.decodeTo(
      Copies,
      SchemaTransformation.transformEffect<Arr.NonEmptyReadonlyArray<S['Type']>, Raw>({
        decode: (raw) =>
          Effect.forEach(
            Arr.makeBy(copies(raw), (index) => index),
            (index) => readCopy(raw, index),
          ),
        encode: (all) =>
          Effect.map(
            Effect.forEach(all, (copy, index) => writeCopy(copy, index)),
            (entries) => Object.fromEntries(entries.flat()),
          ),
      }),
    ),
  ).annotate({
    urlStateKeys: Arr.makeBy(options.max, (index) =>
      keysOf(section).map(([name, policy]) => [options.key(name, index), policy] as const),
    ).flat(),
  });
};
