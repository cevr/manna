import {
  BibleArtifact,
  TopicsArtifact,
  WebsterArtifact,
  type WebsterArtifactInstaller,
  type WebsterArtifactRecipe,
  type BibleArtifactInstaller,
  type BibleArtifactRecipe,
  type TopicsArtifactInstaller,
  type TopicsArtifactRecipe,
} from '../corpus-supply/file-artifact.js';
import { Context, Effect, Layer, Option, Predicate } from 'effect';
import { CorpusProvenance } from '../corpus-supply/model.js';
import { CorpusSourceUnavailableError } from '../corpus-supply/errors.js';

import {
  verifyBibleDatabase,
  verifyTopicsDatabase,
  verifyWebsterDatabase,
} from './corpus-verify.js';
import {
  layerNativeFileArtifacts,
  type NativeFileArtifactProvenanceStore,
  type NativeFileArtifactSource,
} from './file-artifact.js';

export type { NativeFileArtifactSource } from './file-artifact.js';
export { checkSqliteRefresh } from './file-artifact.js';

export const layerNativeBibleArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly verify?: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> =>
  layerNativeFileArtifacts({
    artifact: BibleArtifact,
    destination: input.destination,
    sources: input.sources,
    fetch: input.fetch,
    provenanceStore: input.provenanceStore,
    verify: input.verify ?? verifyBibleDatabase,
  });

export const layerNativeTopicsArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly verify?: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
}): Layer.Layer<TopicsArtifactInstaller | TopicsArtifactRecipe> =>
  layerNativeFileArtifacts({
    artifact: TopicsArtifact,
    destination: input.destination,
    sources: input.sources,
    fetch: input.fetch,
    provenanceStore: input.provenanceStore,
    verify: input.verify ?? verifyTopicsDatabase,
  });

export const layerNativeWebsterArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
}): Layer.Layer<WebsterArtifactInstaller | WebsterArtifactRecipe> => {
  const native = layerNativeFileArtifacts({
    artifact: WebsterArtifact,
    destination: input.destination,
    sources: input.sources,
    verify: verifyWebsterDatabase,
  });
  return Layer.effectContext(
    Effect.gen(function* () {
      const built = yield* Layer.build(native);
      const installer = Context.get(built, WebsterArtifact.Installer);
      const recipe = Context.get(built, WebsterArtifact.Recipe);
      const runtime = input.sources.filter((source) => source.kind === 'runtime');
      let runtimeIndex = 0;
      const sources = recipe.sources.map((source) => {
        if (source.kind !== 'runtime') return source;
        const declared = runtime[runtimeIndex++];
        if (
          Predicate.isUndefined(declared) ||
          declared.kind !== 'runtime' ||
          declared.path !== input.destination
        )
          return source;
        return {
          ...source,
          acquire: Effect.gen(function* () {
            const artifact = yield* source.acquire;
            const active = yield* installer.current.pipe(
              Effect.mapError((cause) =>
                CorpusSourceUnavailableError.make({
                  operation: 'read-active-webster-identity',
                  cause,
                }),
              ),
            );
            if (Option.isNone(active)) return artifact;
            return {
              ...artifact,
              provenance: CorpusProvenance.make({
                source: active.value.source,
                revision: active.value.revision,
                generation: active.value.generation,
                digest: Option.none(),
              }),
            };
          }),
        };
      });
      return Context.make(WebsterArtifact.Installer, installer).pipe(
        Context.add(WebsterArtifact.Recipe, { ...recipe, sources }),
      );
    }),
  );
};
