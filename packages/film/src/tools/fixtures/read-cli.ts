import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Stdio } from 'effect';
import * as Command from 'effect/cli/Command';
import { ContentStore } from '../content-store.ts';
import { FilmRepo } from '../film-repo.ts';
import { read } from '../read-cli.ts';

const film = Command.make('film').pipe(Command.withSubcommands([read]));

Stdio.Stdio.use(({ args }) =>
  Effect.flatMap(args, ([films = '', ...given]) =>
    Command.runWith(film, { version: '0.0.0' })(given).pipe(
      Effect.provide(FilmRepo.layer(films).pipe(Layer.provideMerge(ContentStore.layer))),
    ),
  ),
).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain({ disableErrorReporting: true }));
