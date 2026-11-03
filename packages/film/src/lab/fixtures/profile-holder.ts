import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Stdio, Stream } from 'effect';

const FLAG = '--user-data-dir=';

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const stdio = yield* Stdio.Stdio;
  const profile = ((yield* stdio.args).find((arg) => arg.startsWith(FLAG)) ?? '').slice(
    FLAG.length,
  );
  yield* Effect.acquireRelease(Console.log('ready'), () =>
    Effect.orDie(
      Effect.andThen(
        fs.makeDirectory(profile, { recursive: true }),
        fs.writeFileString(`${profile}/Local State`, '{}'),
      ),
    ),
  );
  yield* Stream.runDrain(stdio.stdin);
}).pipe(Effect.scoped, Effect.provide(BunServices.layer), BunRuntime.runMain);
