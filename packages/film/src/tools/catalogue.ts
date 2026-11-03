import { Context, Effect, Layer, Option, Path, Result, Schema } from 'effect';
import type { Scope } from '../core/address.ts';
import type { PlatformError } from 'effect/PlatformError';
import {
  type Catalogue,
  CatalogueJson,
  type Render,
  type Stamp,
  emptyCatalogue,
  recordRender,
} from '../core/catalogue.ts';
import { ContentStore, type Manifest } from './content-store.ts';
import { CatalogueInvalid } from '../core/refusals.ts';
import { FileInvalid, type StoreLocked } from './errors.ts';
import type { FilmPaths } from './film-repo.ts';
import { RenderJob, type RenderOutput } from './render-plan.ts';

export const CATALOGUE_FILE = 'catalogue.json';

type ProjectFolder = Pick<FilmPaths, 'name' | 'out'>;

export const renderRecord = (
  project: ProjectFolder,
  job: RenderJob,
  scope: Pick<Scope, 'span'>,
  stamp: Stamp,
  output: RenderOutput,
  at: number,
  path: Path.Path,
): Render => {
  const rel = (file: string) => path.relative(project.out, file);
  return {
    address: job.address,
    variant: job.variant,
    kind: output.kind,
    settings: {
      scale: RenderJob.$match(job, {
        Video: (v) => v.scale,
        Stills: () => 1,
        Contact: () => 1,
        LookBook: () => 1,
      }),
      captions: job.captions,
    },
    stamp,
    span: scope.span,
    files: {
      clip: Option.map(output.clip, rel),
      share: Option.map(output.share, rel),
      captions: Option.map(output.captions, rel),
      chapters: Option.map(output.chapters, rel),
      description: Option.map(output.description, rel),
      images: output.images.map(rel),
    },
    sound: output.sound,
    at,
  };
};

export type CatalogueError = CatalogueInvalid | StoreLocked | PlatformError;

interface CatalogueService {
  readonly read: (project: ProjectFolder) => Effect.Effect<Catalogue, CatalogueError>;
  readonly update: <A>(
    project: ProjectFolder,
    change: (catalogue: Catalogue) => readonly [A, Catalogue],
  ) => Effect.Effect<A, CatalogueError>;
  readonly attempt: <A, E>(
    project: ProjectFolder,
    change: (catalogue: Catalogue) => Result.Result<readonly [A, Catalogue], E>,
  ) => Effect.Effect<A, E | CatalogueError>;
  readonly record: (project: ProjectFolder, render: Render) => Effect.Effect<void, CatalogueError>;
}

const invalid = (error: FileInvalid) =>
  CatalogueInvalid.make({ file: error.file, reason: error.reason });

export class RenderCatalogue extends Context.Service<RenderCatalogue, CatalogueService>()(
  '@manna/film/tools/RenderCatalogue',
) {
  static readonly layer = Layer.effect(
    RenderCatalogue,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const store = yield* ContentStore;

      const manifestOf = (project: ProjectFolder): Manifest<Catalogue> => ({
        file: path.join(project.out, CATALOGUE_FILE),
        codec: CatalogueJson,
        empty: emptyCatalogue(project.name),
      });

      const read = Effect.fn('RenderCatalogue.read')(function* (project: ProjectFolder) {
        return yield* store.read(manifestOf(project)).pipe(Effect.catchTag('FileInvalid', invalid));
      });

      const attempt = <A, E>(
        project: ProjectFolder,
        change: (catalogue: Catalogue) => Result.Result<readonly [A, Catalogue], E>,
      ): Effect.Effect<A, E | CatalogueError> =>
        store
          .transact(manifestOf(project), (catalogue) => Effect.fromResult(change(catalogue)))
          .pipe(
            Effect.catchIf(Schema.is(FileInvalid), (error) => Effect.fail(invalid(error))),
            Effect.withSpan('RenderCatalogue.update'),
          );

      const update = <A>(
        project: ProjectFolder,
        change: (catalogue: Catalogue) => readonly [A, Catalogue],
      ) => attempt(project, (catalogue) => Result.succeed(change(catalogue)));

      const record = Effect.fn('RenderCatalogue.record')(function* (
        project: ProjectFolder,
        render: Render,
      ) {
        yield* update(project, (catalogue) => [render, recordRender(catalogue, render)] as const);
        yield* Effect.log(
          `catalogue.record film=${project.name} kind=${render.kind} variant=${render.variant} key=${render.stamp.key.slice(0, 12)}`,
        );
      });

      return RenderCatalogue.of({ read, update, attempt, record });
    }),
  );
}
