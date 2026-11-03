import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { ConfigProvider, Console, Effect, Layer, Match } from 'effect';
import { type PicksFound, fillPicks } from './ask-store.ts';
import { ContentStore } from './content-store.ts';
import { ProductionStore } from './production-store.ts';

const lineOf = (production: string, found: PicksFound): string =>
  Match.value(found).pipe(
    Match.tagsExhaustive({
      Filled: ({ ask, picks }) =>
        `fill-picks ${production} ${ask} filled ${Object.entries(picks)
          .map(([question, value]) => `${question}=${value}`)
          .join(' ')}`,
      Left: ({ ask, why }) => `fill-picks ${production} ${ask} left: ${why}`,
    }),
  );

export const runFillPicks = (folders: {
  readonly lab: string;
  readonly productions: string;
}): void => {
  const Platform = BunServices.layer;
  const Folders = ConfigProvider.layerAdd(
    ConfigProvider.fromUnknown({ FILMS_LAB: folders.lab, FILMS_PRODUCTIONS: folders.productions }),
  );
  const Store = ContentStore.layer.pipe(Layer.provide(Platform));
  const Stores = Layer.mergeAll(
    ProductionStore.layer.pipe(Layer.provide([Store, Platform])),
    Store,
    Platform,
  ).pipe(Layer.provideMerge(Folders));
  Effect.gen(function* () {
    const found = yield* fillPicks;
    yield* Effect.forEach(found, ({ production, found: f }) => Console.log(lineOf(production, f)));
    const filled = found.filter(({ found: f }) => f._tag === 'Filled').length;
    yield* Console.log(`fill-picks filled=${filled} left=${found.length - filled}`);
  }).pipe(Effect.provide(Stores), BunRuntime.runMain);
};
