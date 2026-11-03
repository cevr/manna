import { Context, Effect, Layer, Match, Option, Predicate } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type { PublicationId } from '../writings/model.js';
import { VectorsArtifact } from '../search/vector-artifact.js';
import {
  BibleArtifact,
  TopicsArtifact,
  WebsterArtifact,
  type RegisteredFileCorpus,
  type RuntimeArtifactRelease,
  type WiredFileCorpus,
} from './file-artifact.js';
import {
  CorpusInstallationError,
  CorpusRecipeUnavailableError,
  type CorpusSupplyError,
} from './errors.js';
import {
  BootstrapTarget,
  CorpusActivation,
  CorpusFileName,
  CorpusSupplyReceipt,
  type CorpusGeneration,
  type CorpusProvenance,
  CorpusSupplyInput,
  type WritingsTarget,
} from './model.js';
import { WritingsAssetRecipe, type WritingsAssetRecipeService } from './source.js';

const isSourceError = Predicate.or(
  Predicate.isTagged('CorpusSourceUnavailableError'),
  Predicate.isTagged('CorpusContributionRejectedError'),
);

interface CorpusSupplyService {
  readonly ensure: (
    input?: CorpusSupplyInput,
  ) => Effect.Effect<CorpusSupplyReceipt, CorpusSupplyError>;
  readonly installed: (corpus: CorpusFileName) => Effect.Effect<Option.Option<CorpusProvenance>>;
  readonly activeFile: (corpus: CorpusFileName) => Effect.Effect<Option.Option<string>>;
  readonly installFrom: (input: {
    readonly corpus: CorpusFileName;
    readonly release: RuntimeArtifactRelease;
  }) => Effect.Effect<CorpusSupplyReceipt, CorpusSupplyError>;
}

const requestedPublications = (source: WritingsAssetRecipeService, target: WritingsTarget) => {
  const requested = Option.fromNullishOr(target.publications);
  if (Option.isSome(requested)) return Effect.succeed(requested.value);
  return source.catalog.pipe(Effect.map((publications) => publications.map((item) => item.id)));
};

const isOutranked = (
  current: Option.Option<CorpusProvenance>,
  candidate: Option.Option<CorpusGeneration>,
): boolean =>
  Option.exists(
    Option.flatMap(current, (active) => active.generation),
    (installed) =>
      Option.match(candidate, {
        onNone: () => true,
        onSome: (offered) => offered <= installed,
      }),
  );

type FileCorpusRegistry = { readonly [K in CorpusFileName]: RegisteredFileCorpus<K> };

const fileCorpora = {
  bible: BibleArtifact,
  topics: TopicsArtifact,
  webster: WebsterArtifact,
  vectors: VectorsArtifact,
} satisfies FileCorpusRegistry;

const BOOTSTRAP_CORPUS: CorpusFileName = 'bible';

export class CorpusSupply extends Context.Service<CorpusSupply, CorpusSupplyService>()(
  '@manna/core/corpus-supply/CorpusSupply',
) {
  static layer: Layer.Layer<CorpusSupply> = Layer.effect(
    CorpusSupply,
    Effect.gen(function* () {
      const sourceOption = yield* Effect.serviceOption(WritingsAssetRecipe);
      const databaseOption = yield* Effect.serviceOption(EGWParagraphDatabase);
      const wired = new Map<CorpusFileName, WiredFileCorpus>();
      for (const corpus of CorpusFileName.literals) {
        const entry = yield* fileCorpora[corpus].wired;
        if (Option.isSome(entry)) wired.set(corpus, entry.value);
      }

      const ensureWritings = Effect.fn('CorpusSupply.ensureWritings')(function* (
        target: WritingsTarget,
        _refresh: boolean,
      ) {
        if (Option.isNone(sourceOption) || Option.isNone(databaseOption)) {
          return yield* CorpusRecipeUnavailableError.make({ corpus: 'writings' });
        }
        const source = sourceOption.value;
        const database = databaseOption.value;
        const publications = yield* requestedPublications(source, target);
        const activated: CorpusActivation[] = [];
        const skipped: PublicationId[] = [];

        for (const publication of publications) {
          const contribution = yield* source.acquire(publication);
          const needsInstall = yield* database.needsSync(publication, contribution.provenance).pipe(
            Effect.mapError((cause) =>
              CorpusInstallationError.make({
                publication,
                cause,
              }),
            ),
          );
          if (!needsInstall) {
            skipped.push(publication);
            continue;
          }

          const installed = yield* database
            .installPublication(contribution.publication, contribution.provenance)
            .pipe(
              Effect.mapError((cause) => {
                if (isSourceError(cause)) return cause;
                return CorpusInstallationError.make({ publication, cause });
              }),
            );
          activated.push(
            CorpusActivation.make({
              corpus: 'writings',
              identity: publication,
              source: contribution.provenance.source,
              revision: contribution.provenance.revision,
              installed,
            }),
          );
        }

        return CorpusSupplyReceipt.make({ activated, skipped });
      });

      const ensureFileCorpus = Effect.fn('CorpusSupply.ensureFileCorpus')(function* (
        corpus: CorpusFileName,
        refresh: boolean,
      ) {
        const entry = Option.fromUndefinedOr(wired.get(corpus));
        if (Option.isNone(entry)) {
          return yield* CorpusRecipeUnavailableError.make({ corpus });
        }
        const { recipe, installer } = entry.value;
        const current = yield* installer.current;
        let unavailable = Option.none<CorpusSupplyError>();

        for (const source of recipe.sources) {
          const acquired = yield* Effect.result(source.acquire);
          if (acquired._tag === 'Failure') {
            unavailable = Option.some(acquired.failure);
            continue;
          }
          const artifact = acquired.success;
          const isCurrent = Option.exists(
            current,
            (active) =>
              active.source === artifact.provenance.source &&
              active.revision === artifact.provenance.revision &&
              (Option.isNone(artifact.provenance.digest) ||
                Option.getOrUndefined(active.digest) ===
                  Option.getOrUndefined(artifact.provenance.digest)),
          );
          if (isCurrent && !refresh) {
            return CorpusSupplyReceipt.make({ activated: [], skipped: ['canonical'] });
          }
          if (isOutranked(current, artifact.provenance.generation)) {
            return CorpusSupplyReceipt.make({ activated: [], skipped: ['canonical'] });
          }
          const installed = yield* installer.install(artifact);
          return CorpusSupplyReceipt.make({
            activated: [
              CorpusActivation.make({
                corpus,
                identity: 'canonical',
                source: installed.provenance.source,
                revision: installed.provenance.revision,
                installed: installed.installed,
              }),
            ],
            skipped: [],
          });
        }

        if (Option.isSome(current)) {
          return CorpusSupplyReceipt.make({ activated: [], skipped: ['canonical'] });
        }
        if (Option.isSome(unavailable)) return yield* unavailable.value;
        return yield* CorpusRecipeUnavailableError.make({ corpus });
      });

      const ensure: CorpusSupplyService['ensure'] = (input = CorpusSupplyInput.make({})) => {
        const refresh = input.refresh ?? false;
        const target = input.target ?? BootstrapTarget.make({});
        return Match.value(target).pipe(
          Match.tagsExhaustive({
            bootstrap: () => ensureFileCorpus(BOOTSTRAP_CORPUS, refresh),
            file: (t) => ensureFileCorpus(t.corpus, refresh),
            writings: (t) => ensureWritings(t, refresh),
          }),
        );
      };

      const installed: CorpusSupplyService['installed'] = (corpus) =>
        Option.match(Option.fromUndefinedOr(wired.get(corpus)), {
          onNone: () => Effect.succeedNone,
          onSome: (entry) => entry.installer.current.pipe(Effect.catch(() => Effect.succeedNone)),
        });

      const activeFile: CorpusSupplyService['activeFile'] = (corpus) =>
        Option.match(Option.fromUndefinedOr(wired.get(corpus)), {
          onNone: () => Effect.succeedNone,
          onSome: (entry) =>
            entry.installer.activeFile.pipe(Effect.catch(() => Effect.succeedNone)),
        });

      const installFrom: CorpusSupplyService['installFrom'] = (request) =>
        Effect.gen(function* () {
          const entry = Option.fromUndefinedOr(wired.get(request.corpus));
          if (Option.isNone(entry)) {
            return yield* CorpusRecipeUnavailableError.make({ corpus: request.corpus });
          }
          const { recipe, installer } = entry.value;
          if (Option.isNone(recipe.releaseSource)) {
            return yield* CorpusRecipeUnavailableError.make({ corpus: request.corpus });
          }
          const source = recipe.releaseSource.value(request.release);
          const artifact = yield* source.acquire;
          const installed = yield* installer.install(artifact);
          return CorpusSupplyReceipt.make({
            activated: [
              CorpusActivation.make({
                corpus: request.corpus,
                identity: 'canonical',
                source: installed.provenance.source,
                revision: installed.provenance.revision,
                installed: installed.installed,
              }),
            ],
            skipped: [],
          });
        });

      return CorpusSupply.of({ ensure, installed, activeFile, installFrom });
    }),
  );
}
