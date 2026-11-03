import type * as PlatformError from 'effect/PlatformError';
import { Effect, Layer, Path, Context } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { getCliRoot } from '~/src/lib/paths';

export interface ChimeService {
  readonly play: Effect.Effect<void, PlatformError.PlatformError>;
}

export class Chime extends Context.Service<Chime, ChimeService>()('@manna/cli/services/chime') {}

export const ChimeLive = Layer.effect(
  Chime,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const assetPath = path.join(getCliRoot(), 'assets', 'notification.mp3');
    const play = spawner
      .exitCode(
        ChildProcess.make('afplay', [assetPath, '-v', '0.15'], { forceKillAfter: '5 seconds' }),
      )
      .pipe(Effect.asVoid);
    return Chime.of({ play });
  }),
);
