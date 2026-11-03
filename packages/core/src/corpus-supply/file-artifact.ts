import { Context, Effect, Layer, Option, Schema, SchemaTransformation } from 'effect';
import type { Stream } from 'effect';

import type {
  CorpusInstallationError,
  CorpusSourceUnavailableError,
  SqliteRefreshRefused,
} from './errors.js';
import type { CorpusFileName, CorpusGeneration, CorpusProvenance } from './model.js';
import { makeCorpusStorageIdentity, type CorpusStorageIdentity } from './storage-identity.js';

export type FileArtifactSourceKind = 'packaged' | 'workspace' | 'runtime' | 'release';

export interface FileArtifactRelease {
  readonly url: string;
  readonly revision: string;
  readonly digest: string;
  readonly size: number;
}

export const BIBLE_ARTIFACT_RELEASE: FileArtifactRelease = {
  url: 'https://github.com/cevr/manna/releases/download/db-v2/bible.db',
  revision: 'db-v2',
  digest: 'sha256:e72244f576be2bfa1b28c4816f60d3668338c1322d7cd329d73143ec43bf277c',
  size: 156_291_072,
};

export const TOPICS_ARTIFACT_RELEASE: Option.Option<FileArtifactRelease> = Option.none();

export const TOPICS_ARTIFACT_GENERATION: Option.Option<CorpusGeneration> = Option.none();

interface ReleaseSourceDeclaration extends FileArtifactRelease {
  readonly kind: 'release';
  readonly generation: Option.Option<CorpusGeneration>;
}

export const topicsReleaseSource = (): readonly ReleaseSourceDeclaration[] =>
  Option.match(TOPICS_ARTIFACT_RELEASE, {
    onNone: (): readonly ReleaseSourceDeclaration[] => [],
    onSome: (release) => [{ kind: 'release', ...release, generation: TOPICS_ARTIFACT_GENERATION }],
  });

interface FileArtifact {
  readonly kind: FileArtifactSourceKind;
  readonly provenance: CorpusProvenance;
  readonly expectedSize: Option.Option<number>;
  readonly bytes: Stream.Stream<Uint8Array, CorpusSourceUnavailableError>;
}

interface FileArtifactSourceService {
  readonly kind: FileArtifactSourceKind;
  readonly acquire: Effect.Effect<FileArtifact, CorpusSourceUnavailableError>;
}

const sourcePriority = {
  packaged: 0,
  workspace: 1,
  runtime: 2,
  release: 3,
} satisfies Readonly<Record<FileArtifactSourceKind, number>>;

export interface RuntimeArtifactRelease extends FileArtifactRelease {
  readonly generation: Option.Option<CorpusGeneration>;
}

export interface FileArtifactRecipeService {
  readonly sources: readonly FileArtifactSourceService[];
  readonly releaseSource: Option.Option<
    (release: RuntimeArtifactRelease) => FileArtifactSourceService
  >;
}

export interface FileArtifactInstallerService {
  readonly current: Effect.Effect<Option.Option<CorpusProvenance>, CorpusInstallationError>;
  readonly install: (
    artifact: FileArtifact,
  ) => Effect.Effect<
    { readonly installed: number; readonly provenance: CorpusProvenance },
    CorpusInstallationError | SqliteRefreshRefused
  >;
  readonly activeFile: Effect.Effect<Option.Option<string>, CorpusInstallationError>;
}

export class BibleArtifactRecipe extends Context.Service<
  BibleArtifactRecipe,
  FileArtifactRecipeService
>()('@manna/core/corpus-supply/BibleArtifactRecipe') {}

export class BibleArtifactInstaller extends Context.Service<
  BibleArtifactInstaller,
  FileArtifactInstallerService
>()('@manna/core/corpus-supply/BibleArtifactInstaller') {}

export interface FileCorpusArtifact<Corpus extends string, RecipeId, InstallerId> {
  readonly corpus: Corpus;
  readonly label: string;
  readonly storage: CorpusStorageIdentity<Corpus>;
  readonly wired: Effect.Effect<Option.Option<WiredFileCorpus>>;
  readonly Recipe: Context.Service<RecipeId, FileArtifactRecipeService>;
  readonly Installer: Context.Service<InstallerId, FileArtifactInstallerService>;
  readonly layerRecipe: (recipe: {
    readonly sources: readonly FileArtifactSourceService[];
    readonly releaseSource?: (release: RuntimeArtifactRelease) => FileArtifactSourceService;
  }) => Layer.Layer<RecipeId>;
  readonly layerInstaller: (installer: FileArtifactInstallerService) => Layer.Layer<InstallerId>;
}

export interface RegisteredFileCorpus<Corpus extends CorpusFileName = CorpusFileName> {
  readonly corpus: Corpus;
  readonly label: string;
  readonly wired: Effect.Effect<Option.Option<WiredFileCorpus>>;
}

export interface WiredFileCorpus {
  readonly recipe: FileArtifactRecipeService;
  readonly installer: FileArtifactInstallerService;
}

export const makeUnregisteredFileCorpusArtifact = <
  Corpus extends string,
  RecipeId,
  InstallerId,
>(input: {
  readonly corpus: Corpus;
  readonly label: string;
  readonly Recipe: Context.Service<RecipeId, FileArtifactRecipeService>;
  readonly Installer: Context.Service<InstallerId, FileArtifactInstallerService>;
}): FileCorpusArtifact<Corpus, RecipeId, InstallerId> => ({
  corpus: input.corpus,
  label: input.label,
  storage: makeCorpusStorageIdentity(input.corpus),
  Recipe: input.Recipe,
  Installer: input.Installer,
  wired: Effect.gen(function* () {
    const recipe = yield* Effect.serviceOption(input.Recipe);
    const installer = yield* Effect.serviceOption(input.Installer);
    if (Option.isNone(recipe) || Option.isNone(installer)) return Option.none();
    return Option.some({ recipe: recipe.value, installer: installer.value });
  }),
  layerRecipe: (recipe) =>
    Layer.succeed(input.Recipe, {
      sources: [...recipe.sources].sort(
        (left, right) => sourcePriority[left.kind] - sourcePriority[right.kind],
      ),
      releaseSource: Option.fromUndefinedOr(recipe.releaseSource),
    }),
  layerInstaller: (installer) => Layer.succeed(input.Installer, installer),
});

export const makeFileCorpusArtifact = <
  Corpus extends CorpusFileName,
  RecipeId,
  InstallerId,
>(input: {
  readonly corpus: Corpus;
  readonly label: string;
  readonly Recipe: Context.Service<RecipeId, FileArtifactRecipeService>;
  readonly Installer: Context.Service<InstallerId, FileArtifactInstallerService>;
}): FileCorpusArtifact<Corpus, RecipeId, InstallerId> & RegisteredFileCorpus<Corpus> =>
  makeUnregisteredFileCorpusArtifact(input);

export const BibleArtifact = makeFileCorpusArtifact({
  corpus: 'bible',
  label: 'Bible',
  Recipe: BibleArtifactRecipe,
  Installer: BibleArtifactInstaller,
});

export const TOPICS_SCHEMA_MAJOR = 1;
export const TOPICS_SCHEMA_MINOR = 0;

const TopicsSchemaMajor = Schema.String.check(Schema.isPattern(/^\d+$/)).pipe(
  Schema.decodeTo(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
    SchemaTransformation.numberFromString,
  ),
);

export const readTopicsSchemaMajor: (raw: string) => Option.Option<number> =
  Schema.decodeUnknownOption(TopicsSchemaMajor);

export class TopicsArtifactRecipe extends Context.Service<
  TopicsArtifactRecipe,
  FileArtifactRecipeService
>()('@manna/core/corpus-supply/TopicsArtifactRecipe') {}

export class TopicsArtifactInstaller extends Context.Service<
  TopicsArtifactInstaller,
  FileArtifactInstallerService
>()('@manna/core/corpus-supply/TopicsArtifactInstaller') {}

export const TopicsArtifact = makeFileCorpusArtifact({
  corpus: 'topics',
  label: 'Topics',
  Recipe: TopicsArtifactRecipe,
  Installer: TopicsArtifactInstaller,
});

export class WebsterArtifactRecipe extends Context.Service<
  WebsterArtifactRecipe,
  FileArtifactRecipeService
>()('@manna/core/corpus-supply/WebsterArtifactRecipe') {}

export class WebsterArtifactInstaller extends Context.Service<
  WebsterArtifactInstaller,
  FileArtifactInstallerService
>()('@manna/core/corpus-supply/WebsterArtifactInstaller') {}

export const WebsterArtifact = makeFileCorpusArtifact({
  corpus: 'webster',
  label: 'Webster 1828',
  Recipe: WebsterArtifactRecipe,
  Installer: WebsterArtifactInstaller,
});
