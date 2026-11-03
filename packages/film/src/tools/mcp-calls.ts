import { Boolean as Bool, Cause, Clock, Effect, Exit, Option, Schema } from 'effect';

const LOGGED_ARGS = [
  'film',
  'note',
  'panel',
  'beat',
  'scene',
  'set',
  'name',
  'ask',
  'production',
  'status',
  'since',
  'wait',
  'try',
  'version',
  'figure',
] as const;

export type CallParams = { readonly [Arg in (typeof LOGGED_ARGS)[number]]?: string | number };

const isJsonObject = Schema.is(Schema.JsonObject);
const isLogged = Schema.is(Schema.Union([Schema.String, Schema.Finite]));

export const callParamsOf = (raw: Schema.Json): CallParams =>
  Option.match(Option.liftPredicate(raw, isJsonObject), {
    onNone: () => ({}),
    onSome: (record) =>
      Object.fromEntries(
        LOGGED_ARGS.flatMap((key) =>
          Option.toArray(
            Option.map(
              Option.filter(Option.fromUndefinedOr(record[key]), isLogged),
              (value) => [key, value] as const,
            ),
          ),
        ),
      ),
  });

const callArgs = (params: CallParams): string =>
  LOGGED_ARGS.flatMap((key) =>
    Option.fromUndefinedOr(params[key]).pipe(
      Option.match({ onNone: () => [], onSome: (value) => [` ${key}=${String(value)}`] }),
    ),
  ).join('');

const outcomeOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) =>
      Bool.match(Cause.hasInterruptsOnly(cause), {
        onTrue: () => 'interrupted',
        onFalse: () => 'failed',
      }),
  });

export const logged =
  <P extends CallParams, C, A, E, R>(
    tool: string,
    handle: (params: P, context: C) => Effect.Effect<A, E, R>,
  ) =>
  (params: P, context: C): Effect.Effect<A, E, R> =>
    Effect.flatMap(Clock.currentTimeMillis, (start) =>
      handle(params, context).pipe(
        Effect.onExit((exit) =>
          Effect.flatMap(Clock.currentTimeMillis, (end) =>
            Effect.logInfo(
              `[mcp] tool=${tool}${callArgs(params)} outcome=${outcomeOf(exit)} ms=${end - start}`,
            ),
          ),
        ),
      ),
    );
