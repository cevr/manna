import { EGWParagraphDatabase } from '@manna/core/egw-db';
import * as EGWDbBun from '@manna/core/egw-db/bun';
import {
  layerFileVectorIndexBytes,
  loadVectorIndex,
  ResolvedVectorIndex,
  SearchCorpusSources,
  SearchService,
  VectorIndexBytes,
} from '@manna/core/search';
import { layerBunEmbedder } from '@manna/core/search/bun';
import { BunServices } from '@effect/platform-bun';
import { Config, Context, Effect, Layer, Option, Path } from 'effect';

import { ensureOnnxDylibs } from '../../lib/onnx-dylibs.js';
import {
  CLIENT_FINGERPRINT,
  probeSearchDaemon,
  searchDaemonClientLayer,
  shutdownSearchDaemon,
  spawnSearchDaemon,
} from './search-daemon-client.js';
import { searchDaemonSocketPath } from './search-daemon-protocol.js';

const resolveVectorIndex = (source: Layer.Layer<VectorIndexBytes>) =>
  loadVectorIndex.pipe(Effect.provide(source));

export const verifiedVectorIndex = (
  filename: string,
  source: Layer.Layer<VectorIndexBytes> = layerFileVectorIndexBytes(filename).pipe(
    Layer.provide(BunServices.layer),
  ),
): Layer.Layer<ResolvedVectorIndex | VectorIndexBytes> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const loaded = yield* resolveVectorIndex(source);
      if (loaded._tag !== 'index') {
        yield* Effect.logInfo('search.vectorIndex.refused').pipe(
          Effect.annotateLogs({ filename, reason: loaded.absence.reason }),
        );
      }
      return Layer.merge(ResolvedVectorIndex.layerOf(loaded), VectorIndexBytes.None);
    }),
  );

export const installedSearchLayer: Layer.Layer<SearchService> = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    yield* ensureOnnxDylibs;
    const at = (file: string): string => path.join(home, '.bible', file);

    const sources = Layer.effect(
      SearchCorpusSources,
      Effect.gen(function* () {
        return SearchCorpusSources.of({
          _tag: 'wired',
          sources: {
            paragraphs: yield* EGWParagraphDatabase,
          },
        });
      }),
    ).pipe(Layer.provide(EGWDbBun.layerBun(at('egw-paragraphs.db'))), Layer.orDie);

    return SearchService.Live.pipe(
      Layer.provide(sources),
      Layer.provide(verifiedVectorIndex(at('vectors.bvi'))),
      Layer.provide(layerBunEmbedder),
    );
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

const daemonPreferredSearchLayer: Layer.Layer<SearchService> = Layer.unwrap(
  Effect.gen(function* () {
    const setting = yield* Config.option(Config.String('BIBLE_SEARCH_DAEMON'));
    if (Option.exists(setting, (value) => value === 'off')) return installedSearchLayer;
    const home = yield* Config.String('HOME');
    const socketPath = searchDaemonSocketPath(home);
    const resident = yield* probeSearchDaemon(socketPath);
    const matching = Option.filter(resident, (status) => status.fingerprint === CLIENT_FINGERPRINT);
    if (Option.isSome(matching)) return searchDaemonClientLayer(socketPath);
    if (Option.isSome(resident)) yield* shutdownSearchDaemon(socketPath);
    yield* spawnSearchDaemon.pipe(Effect.ignore);
    return installedSearchLayer;
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
);

export class SearchLayer extends Context.Reference<Layer.Layer<SearchService>>(
  '@manna/cli/egw/SearchLayer',
  { defaultValue: () => daemonPreferredSearchLayer },
) {}

export const searchService = <A, E>(use: Effect.Effect<A, E, SearchService>): Effect.Effect<A, E> =>
  Effect.flatMap(SearchLayer, (layer) => use.pipe(Effect.provide(layer)));
