import { Context, Effect, Layer } from 'effect';

interface CliProcessService {
  readonly exitFailure: Effect.Effect<never>;
  readonly pid: number;
}

export class CliProcess extends Context.Service<CliProcess, CliProcessService>()(
  '@manna/cli/services/process/CliProcess',
) {}

export const CliProcessLive = Layer.succeed(
  CliProcess,
  CliProcess.of({
    exitFailure: Effect.sync(() => process.exit(1)),
    pid: process.pid,
  }),
);
