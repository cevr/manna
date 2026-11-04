/**
 * A command that starts a `/bin/sleep` through the live `Os` and ends, as
 * `sim boot` does: `bun spawner.ts <cwd> <seconds>` prints the sleep's
 * identity as one JSON line and leaves the runtime to exit on its own, so
 * it ends only once nothing it holds is still open. `os.slow.test.ts` runs
 * it as a process.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Schema, Stdio } from 'effect';

import { Os } from '../os.ts';

const encodeIdentity = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ pid: Schema.Int, started: Schema.String })),
);

const program = Effect.gen(function* () {
  const os = yield* Os;
  const args = yield* Stdio.Stdio.pipe(Effect.flatMap((stdio) => stdio.args));
  const [cwd = '/nonexistent/loop-probe-x', seconds = '1'] = args;
  const owned = yield* os.spawn(['/bin/sleep', seconds], { cwd });
  yield* Console.log(encodeIdentity(owned));
}).pipe(Effect.provide(BunServices.layer));

BunRuntime.runMain(program, { disableErrorReporting: true });
