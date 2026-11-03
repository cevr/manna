import * as BunServices from '@effect/platform-bun/BunServices';
import { Command } from 'effect/cli';
import {
  ConfigProvider,
  Console,
  Effect,
  Exit,
  FileSystem,
  Inspectable,
  Layer,
  Logger,
  Option,
  Predicate,
} from 'effect';
import { expect } from 'bun:test';

import { getCallSequence, type ServiceCall } from './sequence-recorder.js';
import { createTestLayer, type TestLayerConfig } from './test-layer.js';

export interface RunCliResult {
  exit: Exit.Exit<void, unknown>;
  calls: ServiceCall[];
  success: boolean;
  stdout: string;
  stderr: string;
}

const withTestHome = <A>(use: (home: string) => Effect.Effect<A>): Effect.Effect<A> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: 'manna-cli-test-' });
      return yield* use(home);
    }),
  ).pipe(Effect.orDie, Effect.provide(BunServices.layer));

const runProvided = (
  cli: (args: string[]) => Effect.Effect<void, unknown, unknown>,
  args: string[],
  recordingConsole: Console.Console,
  layer: Layer.Layer<never, never, never>,
  home: string,
): Effect.Effect<{ cliExit: Exit.Exit<void, unknown>; calls: ServiceCall[] }> =>
  // @effect-diagnostics-next-line unsafeEffectTypeAssertion:off
  Effect.gen(function* () {
    const cliExit = yield* Effect.exit(
      cli(args).pipe(Effect.provideService(Console.Console, recordingConsole)),
    );
    const calls = yield* getCallSequence;
    return { cliExit, calls };
  }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, Logger.layer([]), layer)),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        HOME: home,
        GEMINI_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
      }),
    ),
  ) as Effect.Effect<{ cliExit: Exit.Exit<void, unknown>; calls: ServiceCall[] }>;

export const runCli = <Name extends string, Input, ContextInput, E, R>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  args: string[],
  config: TestLayerConfig = {},
): Effect.Effect<RunCliResult> =>
  Effect.gen(function* () {
    const { layer, getAllCalls } = createTestLayer(config);
    const cli = Command.runWith(command, { version: 'test' });

    const written: string[] = [];
    const diagnostics: string[] = [];
    const recordingConsole: Console.Console = {
      ...Console.Console.defaultValue(),
      log: (...parts: readonly unknown[]) => {
        written.push(parts.map((part) => String(part)).join(' '));
      },
      error: (...parts: readonly unknown[]) => {
        diagnostics.push(parts.map((part) => String(part)).join(' '));
      },
    };

    const result = yield* withTestHome((home) =>
      runProvided(cli, args, recordingConsole, layer, home),
    );

    const exit = result.cliExit;
    const effectCalls = result.calls;
    const success = Exit.isSuccess(exit);

    const allServiceCalls = getAllCalls();

    const calls = [...effectCalls, ...allServiceCalls];

    if (Exit.isFailure(exit)) {
      yield* Effect.logError(`CLI command failed: ${Inspectable.toStringUnknown(exit.cause, 0)}`);
    }

    return {
      exit: Exit.map(exit, () => void 0),
      calls,
      success,
      stdout: written.join('\n'),
      stderr: diagnostics.join('\n'),
    };
  });

const callMatches = (actualCall: ServiceCall, expectedCall: Partial<ServiceCall>): boolean =>
  actualCall._tag === expectedCall._tag &&
  Object.entries(expectedCall).every(([key, value]) => {
    if (key === '_tag') return true;

    const actualValue: unknown = Reflect.get(actualCall, key);

    if (Predicate.hasProperty(value, 'asymmetricMatch')) {
      return (value as { asymmetricMatch: (v: any) => boolean }).asymmetricMatch(actualValue);
    }
    return actualValue === value;
  });

export const expectSequence = (actual: ServiceCall[], expected: Array<Partial<ServiceCall>>) => {
  let actualIndex = 0;

  for (const expectedCall of expected) {
    let found = false;

    while (actualIndex < actual.length) {
      const actualCallOpt = Option.fromNullishOr(actual[actualIndex]);
      actualIndex++;

      if (Option.isSome(actualCallOpt) && callMatches(actualCallOpt.value, expectedCall)) {
        found = true;
        break;
      }
    }

    expect(found).toBe(true);
  }
};

export const expectCallCount = (calls: ServiceCall[], tag: ServiceCall['_tag'], count: number) => {
  const actual = calls.filter((c) => c._tag === tag).length;
  expect(actual).toBe(count);
};

export const expectNoCalls = (calls: ServiceCall[], tag: ServiceCall['_tag']) => {
  expectCallCount(calls, tag, 0);
};

export const expectContains = (actual: ServiceCall[], expected: Array<Partial<ServiceCall>>) => {
  for (const expectedCall of expected) {
    const found = actual.some((actualCall) => callMatches(actualCall, expectedCall));
    expect(found).toBe(true);
  }
};
