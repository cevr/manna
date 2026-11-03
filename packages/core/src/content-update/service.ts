import { Context, Effect, Layer, Option } from 'effect';

import {
  TOPICS_ARTIFACT_GENERATION,
  TOPICS_ARTIFACT_RELEASE,
  TOPICS_SCHEMA_MAJOR,
  type FileArtifactRelease,
} from '../corpus-supply/file-artifact.js';
import { corpusRevision, type CorpusGeneration } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import {
  ContentFloor,
  ContentStatus,
  ContentUpdateOutcome,
  decideUpdate,
  manifestUnavailable,
  type ManifestFetchOutcome,
  type UpdatableCorpus,
} from './model.js';

interface ContentManifestSourceService {
  readonly read: Effect.Effect<ManifestFetchOutcome>;
}

export class ContentManifestSource extends Context.Service<
  ContentManifestSource,
  ContentManifestSourceService
>()('@manna/core/content-update/ContentManifestSource') {
  static Unreachable: Layer.Layer<ContentManifestSource> = Layer.succeed(
    ContentManifestSource,
    ContentManifestSource.of({
      read: Effect.succeed(manifestUnavailable('no manifest source is wired')),
    }),
  );

  static layerOf = (outcome: ManifestFetchOutcome): Layer.Layer<ContentManifestSource> =>
    Layer.succeed(
      ContentManifestSource,
      ContentManifestSource.of({ read: Effect.succeed(outcome) }),
    );
}

export const compiledFloor = (input: {
  readonly release: Option.Option<FileArtifactRelease>;
  readonly generation: Option.Option<CorpusGeneration>;
  readonly schemaMajor: number;
}): ContentFloor =>
  ContentFloor.make({
    pinned: Option.map(input.release, (release) => corpusRevision(release.revision)),
    pinnedGeneration: input.generation,
    schemaMajor: input.schemaMajor,
  });

const TOPICS_FLOOR: ContentFloor = compiledFloor({
  release: TOPICS_ARTIFACT_RELEASE,
  generation: TOPICS_ARTIFACT_GENERATION,
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

const floorFor = (corpus: UpdatableCorpus): ContentFloor => {
  switch (corpus) {
    case 'topics':
      return TOPICS_FLOOR;
  }
};

interface ContentActivationService {
  readonly onActivated: (corpus: UpdatableCorpus) => Effect.Effect<void>;
}

export class ContentActivation extends Context.Service<
  ContentActivation,
  ContentActivationService
>()('@manna/core/content-update/ContentActivation') {
  static Inert: Layer.Layer<ContentActivation> = Layer.succeed(
    ContentActivation,
    ContentActivation.of({
      onActivated: () => Effect.void,
    }),
  );

  static layerOf = (
    onActivated: (corpus: UpdatableCorpus) => Effect.Effect<void>,
  ): Layer.Layer<ContentActivation> =>
    Layer.succeed(ContentActivation, ContentActivation.of({ onActivated }));
}

interface ContentUpdateService {
  readonly status: (corpus: UpdatableCorpus) => Effect.Effect<ContentStatus>;
  readonly update: (corpus: UpdatableCorpus) => Effect.Effect<ContentUpdateOutcome>;
}

export class ContentUpdate extends Context.Service<ContentUpdate, ContentUpdateService>()(
  '@manna/core/content-update/ContentUpdate',
) {
  static Live: Layer.Layer<
    ContentUpdate,
    never,
    CorpusSupply | ContentManifestSource | ContentActivation
  > = Layer.effect(
    ContentUpdate,
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const manifests = yield* ContentManifestSource;
      const activation = yield* ContentActivation;

      const activeProvenance = (corpus: UpdatableCorpus) => supply.installed(corpus);

      const statusOver = Effect.fn('ContentUpdate.statusOver')(function* (
        corpus: UpdatableCorpus,
        manifest: ManifestFetchOutcome,
      ) {
        const provenance = yield* activeProvenance(corpus);
        const installedGeneration = Option.flatMap(provenance, (active) => active.generation);
        const floor = floorFor(corpus);
        return ContentStatus.make({
          corpus,
          installed: Option.map(provenance, (active) => active.revision),
          installedGeneration,
          floor,
          decision: decideUpdate({
            floor,
            installed: installedGeneration,
            manifest,
            corpus,
          }),
        });
      });

      return ContentUpdate.of({
        status: (corpus) =>
          Effect.flatMap(manifests.read, (manifest) => statusOver(corpus, manifest)),
        update: Effect.fn('ContentUpdate.update')(function* (corpus: UpdatableCorpus) {
          const manifest = yield* manifests.read;
          const before = yield* statusOver(corpus, manifest);
          if (before.decision._tag !== 'offer') {
            return ContentUpdateOutcome.make({ status: before, activated: Option.none() });
          }
          const offered = before.decision.entry;
          const activated = yield* supply
            .installFrom({
              corpus,
              release: {
                url: offered.url,
                revision: offered.revision,
                digest: offered.sha256,
                size: offered.size,
                generation: Option.some(offered.generation),
              },
            })
            .pipe(
              Effect.map((receipt) =>
                Option.map(
                  Option.fromUndefinedOr(
                    receipt.activated.find((activation) => activation.corpus === corpus),
                  ),
                  (activation) => activation.revision,
                ),
              ),
              Effect.catch(() => Effect.succeedNone),
            );
          if (Option.isSome(activated)) yield* activation.onActivated(corpus);
          return ContentUpdateOutcome.make({
            status: yield* statusOver(corpus, manifest),
            activated,
          });
        }),
      });
    }),
  );
}
