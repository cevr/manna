import {
  ContentActivation,
  ContentUpdate,
  layerHttpContentManifest,
} from '@manna/core/content-update';
import { CorpusSupply, topicsReleaseSource } from '@manna/core/corpus-supply';
import {
  layerNativeTopicsArtifacts,
  type NativeFileArtifactSource,
} from '@manna/core/corpus-supply/bun';
import { BunServices } from '@effect/platform-bun';
import { Config, Context, Effect, Layer, Path } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { packagedDataCandidates } from '~/src/lib/paths';

const installedTopicsSupply: Layer.Layer<CorpusSupply> = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    return CorpusSupply.layer.pipe(
      Layer.provide(
        layerNativeTopicsArtifacts({
          destination: path.join(home, '.bible', 'topics.db'),
          sources: [
            ...packagedDataCandidates('topics.db').map((candidate): NativeFileArtifactSource => ({
              kind: 'packaged',
              path: candidate,
              label: 'packaged',
            })),
            {
              kind: 'workspace',
              path: path.resolve('packages', 'core', 'data', 'topics.db'),
              label: 'workspace',
            },
            ...topicsReleaseSource(),
          ],
        }),
      ),
    );
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
);

const installedContentLayer: Layer.Layer<ContentUpdate> = ContentUpdate.Live.pipe(
  Layer.provide(installedTopicsSupply),
  Layer.provide(layerHttpContentManifest),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(ContentActivation.Inert),
);

export class ContentLayer extends Context.Reference<Layer.Layer<ContentUpdate>>(
  '@manna/cli/ContentLayer',
  { defaultValue: () => installedContentLayer },
) {}

export const contentService = <A, E>(
  use: Effect.Effect<A, E, ContentUpdate>,
): Effect.Effect<A, E> => Effect.flatMap(ContentLayer, (layer) => use.pipe(Effect.provide(layer)));
