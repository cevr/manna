import { TypeSafeClient, TypeSafeDecisionModel } from '@effect/ai-typesafe';
import { Config, Effect, Layer, Option, Redacted } from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

const KEYCHAIN_DEADLINE = '2 seconds';

const keychainKey = Effect.flatMap(ChildProcessSpawner, (spawner) =>
  spawner.string(
    ChildProcess.make(
      'security',
      ['find-generic-password', '-s', 'typesafe-api-key', '-a', 'bible-tools', '-w'],
      { forceKillAfter: '1 second' },
    ),
  ),
).pipe(
  Effect.timeoutOption(KEYCHAIN_DEADLINE),
  Effect.map(Option.flatMap((out) => Option.liftPredicate(out.trim(), (key) => key !== ''))),
  Effect.orElseSucceed(() => Option.none<string>()),
);

const typesafeKey = Effect.gen(function* () {
  const fromEnv = yield* Config.option(Config.Redacted('TYPESAFE_API_KEY')).pipe(
    Effect.orElseSucceed(() => Option.none<Redacted.Redacted<string>>()),
  );
  if (Option.isSome(fromEnv)) return fromEnv;
  return Option.map(yield* keychainKey, (key) => Redacted.make(key));
});

const missingKey = Layer.effect(DecisionModel.DecisionModel)(
  DecisionModel.make({
    decide: () =>
      Effect.fail(
        AiError.make({
          module: 'JudgedLint',
          method: 'decide',
          reason: AiError.AuthenticationError.make({ kind: 'MissingKey' }),
        }),
      ),
  }),
);

export const judgedModel = (model: string) =>
  Layer.unwrap(
    Effect.map(
      typesafeKey,
      Option.match({
        onNone: () => missingKey,
        onSome: (apiKey) =>
          TypeSafeDecisionModel.layer({ model }).pipe(
            Layer.provide(TypeSafeClient.layer({ apiKey })),
          ),
      }),
    ),
  );
