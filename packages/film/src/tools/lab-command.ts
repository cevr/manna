import { Array as Arr, Context, Effect, Match, Option, Predicate, Schema } from 'effect';
import type { FileSystem } from 'effect';
import type * as McpSchema from 'effect/ai/McpSchema';
import type * as Tool from 'effect/ai/Tool';
import type { LabLinks } from '../core/lab-events.ts';

export class LabAddress extends Context.Service<LabAddress, LabLinks>()(
  '@manna/film/tools/LabAddress',
) {}

class LabInputInvalid extends Schema.TaggedError<LabInputInvalid>()('LabInputInvalid', {
  command: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `Invalid parameters for tool '${this.command}': ${this.reason}`;
  }
}

export class LabCommandRefused extends Schema.TaggedError<LabCommandRefused>()(
  'LabCommandRefused',
  { command: Schema.String, tag: Schema.String, reason: Schema.String },
) {
  override get message() {
    return this.reason;
  }
}

interface Named {
  readonly _tag: string;
  readonly message: string;
}

type Pictured = Effect.Effect<
  ReadonlyArray<McpSchema.ContentBlock>,
  LabCommandRefused,
  FileSystem.FileSystem
>;

export interface Answered {
  readonly json: Schema.Json;
  readonly lines: ReadonlyArray<string>;
  readonly pictured: Option.Option<Pictured>;
}

export interface LabCommand<R> {
  readonly tool: Tool.Any;
  readonly name: string;
  readonly input: (raw: Schema.Json) => Effect.Effect<Schema.Json, LabInputInvalid>;
  readonly call: (
    raw: Schema.Json,
  ) => Effect.Effect<Answered, LabInputInvalid | LabCommandRefused, R>;
  readonly answered: (json: Schema.Json) => Effect.Effect<Answered, Schema.SchemaError>;
}

type DataSchema = Schema.Top & Schema.ConstraintCodec<unknown, unknown, never, never>;

type RefusalSchema = Schema.Top & Schema.ConstraintCodec<Named, unknown, never, never>;

const JsonText = Schema.fromJsonString(Schema.Json);
const jsonText = Schema.encodeSync(JsonText);
const readJsonValue = Schema.decodeUnknownEffect(Schema.Json);

const READ_INPUT = { errors: 'all', onExcessProperty: 'ignore' } as const;

export const labCommand = <
  Name extends string,
  P extends DataSchema,
  S extends DataSchema,
  F extends RefusalSchema,
  M extends Tool.FailureMode,
  R,
>(
  tool: Tool.Tool<
    Name,
    { readonly parameters: P; readonly success: S; readonly failure: F; readonly failureMode: M }
  >,
  spec: {
    readonly run: (input: P['Type']) => Effect.Effect<S['Type'], F['Type'], R>;
    readonly lines?: (output: S['Type']) => ReadonlyArray<string>;
    readonly content?: (
      output: S['Type'],
    ) => Effect.Effect<ReadonlyArray<McpSchema.ContentBlock>, Named, FileSystem.FileSystem>;
  },
): LabCommand<R> => {
  const name = tool.name;
  const decodeInput = Schema.decodeUnknownEffect(tool.parametersSchema);
  const encodeInput = Schema.encodeUnknownEffect(tool.parametersSchema);
  const encodeOutput = Schema.encodeUnknownEffect(tool.successSchema);
  const decodeOutput = Schema.decodeUnknownEffect(tool.successSchema);
  const invalid = (error: Schema.SchemaError) =>
    LabInputInvalid.make({ command: name, reason: error.message });
  const refusedAs = (error: Named) =>
    LabCommandRefused.make({ command: name, tag: error._tag, reason: error.message });
  const lines = Option.fromUndefinedOr(spec.lines);
  const content = Option.fromUndefinedOr(spec.content);

  const answerOf = (output: S['Type'], json: Schema.Json): Answered => ({
    json,
    lines: Option.match(lines, {
      onNone: () => plainLines(json),
      onSome: (read) => read(output),
    }),
    pictured: Option.map(content, (picture) => Effect.mapError(picture(output), refusedAs)),
  });

  const jsonOf = (output: S['Type']) =>
    Effect.orDie(Effect.flatMap(encodeOutput(output), (encoded) => readJsonValue(encoded)));

  return {
    tool,
    name,
    input: (raw) =>
      decodeInput(raw, READ_INPUT).pipe(
        Effect.flatMap((decoded) => encodeInput(decoded)),
        Effect.flatMap((encoded) => readJsonValue(encoded)),
        Effect.mapError(invalid),
      ),
    call: (raw) =>
      Effect.gen(function* () {
        const decoded = yield* Effect.mapError(decodeInput(raw, READ_INPUT), invalid);
        const output = yield* Effect.mapError(spec.run(decoded), refusedAs);
        return answerOf(output, yield* jsonOf(output));
      }),
    answered: (json) => Effect.map(decodeOutput(json), (output) => answerOf(output, json)),
  };
};

const BARE = /^[^\s"=]+$/;

const isJsonObject = Schema.is(Schema.JsonObject);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));

const scalar = (value: Schema.Json): string =>
  Option.getOrElse(
    Option.filter(Option.liftPredicate(value, Predicate.isString), (word) => BARE.test(word)),
    () => jsonText(value),
  );

const fieldsLine = (record: Schema.JsonObject): string =>
  Object.entries(record)
    .map(([key, value]) => `${key}=${scalar(value)}`)
    .join(' ');

const nestedLines = (key: string, value: Schema.Json): ReadonlyArray<string> =>
  Match.value(value).pipe(
    Match.when(isJsonObject, (record) => [`${key} ${fieldsLine(record)}`]),
    Match.when(isJsonArray, (all) =>
      Arr.match(all, {
        onEmpty: () => [`${key}=[]`],
        onNonEmpty: (items) =>
          items.map((one, i) =>
            Option.match(Option.liftPredicate(one, isJsonObject), {
              onSome: (record) => `${key}[${i}] ${fieldsLine(record)}`,
              onNone: () => `${key}[${i}] ${scalar(one)}`,
            }),
          ),
      }),
    ),
    Match.orElse(() => []),
  );

const plainLines = (encoded: Schema.Json): ReadonlyArray<string> =>
  Option.match(Option.liftPredicate(encoded, isJsonObject), {
    onNone: () => [scalar(encoded)],
    onSome: (record) => {
      const entries = Object.entries(record);
      const head = entries.filter(([, value]) => !isJsonObject(value) && !isJsonArray(value));
      return [
        ...Arr.match(head, {
          onEmpty: () => [],
          onNonEmpty: (fields) => [fieldsLine(Object.fromEntries(fields))],
        }),
        ...entries.flatMap(([key, value]) => nestedLines(key, value)),
      ];
    },
  });
