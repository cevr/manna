import { Context, Effect, Layer, Option } from 'effect';

import {
  makeFileCorpusArtifact,
  type FileArtifactRecipeService,
  type FileArtifactInstallerService,
} from '../corpus-supply/file-artifact.js';
import { vectorUnavailable, type VectorIndexUnavailable } from './model.js';
import { parseVectorIndex, type VectorIndex } from './vector-index.js';

class VectorsArtifactRecipe extends Context.Service<
  VectorsArtifactRecipe,
  FileArtifactRecipeService
>()('@manna/core/corpus-supply/VectorsArtifactRecipe') {}

class VectorsArtifactInstaller extends Context.Service<
  VectorsArtifactInstaller,
  FileArtifactInstallerService
>()('@manna/core/corpus-supply/VectorsArtifactInstaller') {}

export const VectorsArtifact = makeFileCorpusArtifact({
  corpus: 'vectors',
  label: 'Vectors',
  Recipe: VectorsArtifactRecipe,
  Installer: VectorsArtifactInstaller,
});

interface VectorIndexBytesApi {
  readonly read: Effect.Effect<Option.Option<ArrayBuffer>>;
}

export class VectorIndexBytes extends Context.Service<VectorIndexBytes, VectorIndexBytesApi>()(
  '@manna/core/search/VectorIndexBytes',
) {
  static readonly None: Layer.Layer<VectorIndexBytes> = Layer.succeed(
    VectorIndexBytes,
    VectorIndexBytes.of({
      read: Effect.succeedNone,
    }),
  );

  static layerOf = (bytes: ArrayBuffer): Layer.Layer<VectorIndexBytes> =>
    Layer.succeed(VectorIndexBytes, VectorIndexBytes.of({ read: Effect.succeedSome(bytes) }));
}

export type LoadedVectorIndex =
  | { readonly _tag: 'index'; readonly index: VectorIndex }
  | { readonly _tag: 'unavailable'; readonly absence: VectorIndexUnavailable };

export class ResolvedVectorIndex extends Context.Service<ResolvedVectorIndex, LoadedVectorIndex>()(
  '@manna/core/search/ResolvedVectorIndex',
) {
  static layerOf = (index: LoadedVectorIndex): Layer.Layer<ResolvedVectorIndex> =>
    Layer.succeed(ResolvedVectorIndex, index);
}

export const loadVectorIndex: Effect.Effect<LoadedVectorIndex, never, VectorIndexBytes> =
  Effect.gen(function* () {
    const source = yield* VectorIndexBytes;
    const bytes = yield* source.read;
    if (Option.isNone(bytes)) {
      return { _tag: 'unavailable', absence: vectorUnavailable('absent') };
    }
    const parsed = parseVectorIndex(bytes.value);
    if (parsed._tag === 'ok') return { _tag: 'index', index: parsed.index };
    if (parsed._tag === 'fingerprint') {
      return { _tag: 'unavailable', absence: vectorUnavailable('fingerprint') };
    }
    return { _tag: 'unavailable', absence: vectorUnavailable('absent') };
  });
