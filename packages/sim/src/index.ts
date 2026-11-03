/**
 * An app's sim script in one call: `launch(place)` reads the process's
 * arguments, runs `sim <args>` (`command.ts`) at the place over the live
 * drive (`DriveLive` on Bun, with fetch for the dev server's answers), and
 * exits non-zero when the command fails. A defect is printed to stderr; a
 * failure has already printed its JSON result.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Layer, type Path, Stdio } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { runSim } from './command.ts';
import { DriveLive, type Place } from './drive.ts';

const Host = Layer.merge(BunServices.layer, FetchHttpClient.layer);

/** Run the process's `sim` command at the place `where` makes, and exit with its result. */
export const launch = <E>(where: Effect.Effect<Place, E, Path.Path>) =>
  Effect.gen(function* () {
    const place = yield* where;
    const args = yield* Stdio.Stdio.pipe(Effect.flatMap((stdio) => stdio.args));
    return yield* runSim(place, args);
  }).pipe(
    Effect.tapDefect((defect) => Console.error(defect)),
    Effect.provide(Layer.provideMerge(DriveLive, Host)),
    (program) => BunRuntime.runMain(program, { disableErrorReporting: true }),
  );
