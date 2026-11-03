import {
  Array as Arr,
  Boolean as Bool,
  Console,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
} from 'effect';
import * as Tool from 'effect/ai/Tool';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { FetchHttpClient } from 'effect/http';
import { localLink } from './api-server.ts';
import { labPhone } from './lab.ts';
import { type Answered, LabAddress, type LabCommand, LabCommandRefused } from './lab-command.ts';
import { type FieldKind, type LabField, fieldsOf } from './lab-fields.ts';
import { labClient, labUrl } from './lab-client.ts';

const isJsonObject = Schema.is(Schema.JsonObject);

type Given = Option.Option<Schema.Json>;

const readJson = Schema.decodeOption(Schema.fromJsonString(Schema.Json));
const readNumber = Schema.decodeOption(Schema.FiniteFromString);
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

const numberOf = (text: string): Schema.Json => Option.getOrElse(readNumber(text), () => text);

const KNOWN: ReadonlyArray<string> = ['films'];

const NOTES: ReadonlyArray<readonly [(field: LabField) => boolean, string]> = [
  [(field) => KNOWN.includes(field.name), "this checkout's films folder, unless given"],
  [(field) => field.required && !KNOWN.includes(field.name), ' (required)'],
  [(field) => field.kind === 'json', ' [JSON]'],
];

const flagOf = (field: LabField): Flag.Flag<Given> => {
  const described = (flag: Flag.Flag<Given>) =>
    Flag.withDescription(
      flag,
      `${field.description}${NOTES.filter(([holds]) => holds(field))
        .map(([, note]) => note)
        .join('')}`,
    );
  const listed = (read: (text: string) => ReadonlyArray<Schema.Json>) =>
    Flag.String(field.name).pipe(
      Flag.atLeast(0),
      Flag.map((all): Given => Option.liftPredicate(all.flatMap(read), Arr.isArrayNonEmpty)),
    );
  const word = Flag.String(field.name).pipe(Flag.optional);
  const flags: Record<FieldKind, () => Flag.Flag<Given>> = {
    switch: () => Flag.Boolean(field.name).pipe(Flag.optional),
    words: () => listed((text) => [text]),
    numbers: () => listed((text) => text.split(',').map(numberOf)),
    number: () => Flag.Finite(field.name).pipe(Flag.optional),
    json: () => word,
    word: () => word,
  };
  return described(flags[field.kind]());
};

interface CliContext {
  readonly films: string;
}

const unread = (command: string, reason: string) =>
  LabCommandRefused.make({ command, tag: 'LabInputUnread', reason });

const fieldValue = (command: string, field: LabField, value: Schema.Json) =>
  Bool.match(field.kind === 'json', {
    onFalse: () => Effect.succeed(value),
    onTrue: () =>
      Effect.fromOption(
        Option.flatMap(Option.liftPredicate(value, Predicate.isString), readJson),
        () => unread(command, `--${field.name} is not JSON: ${jsonText(value)}`),
      ),
  });

type Entry = readonly [string, Schema.Json];

const rawInput = (
  command: string,
  fields: ReadonlyArray<LabField>,
  given: Readonly<Record<string, Given>>,
  input: Option.Option<string>,
  context: CliContext,
) =>
  Effect.gen(function* () {
    const base: Schema.JsonObject = yield* Option.match(input, {
      onNone: () => Effect.succeed<Schema.JsonObject>({}),
      onSome: (text) =>
        Effect.fromOption(
          Option.flatMap(readJson(text), (value) => Option.liftPredicate(value, isJsonObject)),
          () => unread(command, '--input is no JSON object'),
        ),
    });
    const flagged = yield* Effect.forEach(fields, (field) =>
      Option.match(Option.flatten(Option.fromUndefinedOr(given[field.name])), {
        onNone: () => Effect.succeed<ReadonlyArray<Entry>>([]),
        onSome: (value) =>
          Effect.map(fieldValue(command, field, value), (read): ReadonlyArray<Entry> => [
            [field.name, read],
          ]),
      }),
    );
    const filled: Schema.JsonObject = { ...base, ...Object.fromEntries(flagged.flat()) };
    const known = Bool.match(
      fields.some((field) => KNOWN.includes(field.name)) && !Object.hasOwn(filled, 'films'),
      { onTrue: () => ({ films: context.films }), onFalse: () => ({}) },
    );
    return { ...filled, ...known };
  });

export const failureLine = (error: { readonly _tag: string; readonly message: string }): string =>
  jsonText({ _tag: error._tag, message: error.message });

const cliCommand = <E extends { readonly _tag: string; readonly message: string }, R>(
  tool: Tool.Any,
  answer: (raw: Schema.JsonObject) => Effect.Effect<Answered, E, R>,
  context: CliContext,
) => {
  const { name } = tool;
  const fields = fieldsOf(tool);
  const flags = Object.fromEntries(fields.map((field) => [field.name, flagOf(field)]));
  return Command.make(
    name,
    {
      fields: flags,
      input: Flag.String('input').pipe(
        Flag.optional,
        Flag.withDescription('the whole input as one JSON object (a flag beside it wins)'),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription('print the answer as one line of JSON'),
      ),
    },
    Effect.fn(`film.lab.${name}`)(
      function* ({ fields: given, input, json }) {
        const raw = yield* rawInput(name, fields, given, input, context);
        const answered = yield* answer(raw);
        yield* printed(answered, json);
      },
      (effect, { json }) =>
        Effect.tapError(effect, (error) =>
          Effect.when(Console.log(failureLine(error)), Effect.succeed(json)),
        ),
    ),
  ).pipe(
    Command.withDescription(
      Option.getOrElse(Option.fromUndefinedOr(Tool.getDescription(tool)), () => name),
    ),
  );
};

const askedOfLab = (command: LabCommand<unknown>) => (raw: Schema.JsonObject) =>
  Effect.scoped(
    Effect.gen(function* () {
      const args = yield* command.input(raw);
      const client = yield* labClient(yield* labUrl);
      const session = yield* client.session;
      const json = yield* client.callJson(session, command.name, args);
      return yield* command.answered(json).pipe(
        Effect.mapError((error) =>
          LabCommandRefused.make({
            command: command.name,
            tag: 'LabAnswerUnread',
            reason: `the lab's answer does not read (${error.message}): the lab and this checkout run different code, so update the older one (pull this checkout, or restart the lab on the newer code)`,
          }),
        ),
      );
    }),
  );

const printed = (answered: Answered, json: boolean) =>
  Bool.match(json, {
    onTrue: () => Console.log(jsonText(answered.json)),
    onFalse: () => Effect.forEach(answered.lines, (line) => Console.log(line), { discard: true }),
  });

const waitOf = (
  command: LabCommand<unknown>,
  done: (json: Schema.Json) => boolean,
  context: CliContext,
) =>
  Command.make(
    'wait',
    {
      handle: Argument.String('handle').pipe(
        Argument.withDescription(`the job, by the handle \`${command.name}\` answered`),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription('print the answer as one line of JSON'),
      ),
    },
    Effect.fn(`film.lab.${command.name}.wait`)(
      function* ({ handle, json }) {
        const answered = yield* askedOfLab(command)({ films: context.films, handle }).pipe(
          Effect.repeat({ until: (one) => done(one.json) }),
        );
        yield* printed(answered, json);
      },
      (effect, { json }) =>
        Effect.tapError(effect, (error) =>
          Effect.when(Console.log(failureLine(error)), Effect.succeed(json)),
        ),
    ),
  ).pipe(
    Command.withDescription(
      `Wait until the job \`${command.name}\` answered a handle for is done on the running lab (FILM_LAB_URL), then print its answer and exit 0: run it in the background and act when it exits`,
    ),
  );

export const addressFromConfig = Layer.effect(
  LabAddress,
  Effect.gen(function* () {
    const local = localLink(yield* labUrl);
    const phone = yield* labPhone;
    return LabAddress.of({
      local,
      ...Option.match(phone, { onNone: () => ({}), onSome: (p) => ({ phone: p.href }) }),
    });
  }),
);

export const labCliCommands = <RHere>(
  set: {
    readonly here: ReadonlyArray<LabCommand<RHere>>;
    readonly inLab: ReadonlyArray<LabCommand<unknown>>;
  },
  context: CliContext,
  jobs: Readonly<Record<string, (json: Schema.Json) => boolean>> = {},
) => [
  ...set.here.map((command) =>
    cliCommand(command.tool, (raw) => command.call(raw), context).pipe(
      Command.provide(addressFromConfig),
    ),
  ),
  ...set.inLab.map((command) => {
    const asked = cliCommand(command.tool, askedOfLab(command), context);
    return Option.match(Option.fromUndefinedOr(jobs[command.name]), {
      onNone: () => asked.pipe(Command.provide(FetchHttpClient.layer)),
      onSome: (done) =>
        asked.pipe(
          Command.withSubcommands([waitOf(command, done, context)]),
          Command.provide(FetchHttpClient.layer),
        ),
    });
  }),
];
