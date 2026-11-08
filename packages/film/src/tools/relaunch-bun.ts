import { Effect, Layer, Option } from 'effect';
import { endChrome } from './chrome-profile.ts';
import { Relaunch } from './exports-watch.ts';

export const RelaunchBun = Layer.succeed(
  Relaunch,
  Relaunch.of({
    relaunch: (why) =>
      Effect.andThen(
        Effect.log(`[lab] relaunch why="${why}"`),
        Effect.suspend(() =>
          Option.match(Option.fromUndefinedOr(process.execve), {
            onNone: () => Effect.die('this runtime cannot start itself again (no execve)'),
            onSome: (execve) =>
              Effect.sync(() => {
                endChrome();
                execve(process.execPath, [
                  process.execPath,
                  ...process.execArgv,
                  ...process.argv.slice(1),
                ]);
              }),
          }),
        ),
      ).pipe(Effect.andThen(Effect.never)),
  }),
);
