import { AskMaterials } from '../ask-materials.ts';
import { AskStore } from '../ask-store.ts';
import type { FileSystem } from 'effect';
import { ConfigProvider, Layer, Path } from 'effect';
import { RenderCatalogue } from '../catalogue.ts';
import { ContentStore } from '../content-store.ts';
import { NotesStore } from '../notes-store.ts';
import { ProductionStore } from '../production-store.ts';
import { BoardStore } from '../board-store.ts';
import { FilmFolder } from '../film-repo.ts';
import type { StudioReadings } from '../studio.ts';
import type { SeriesDrafts } from '../series-drafts.ts';
import type { SourceWriter } from '../source-writer.ts';
import { FilmTimelines } from '../film-timeline.ts';
import { BeatEdits } from '../beat-edits.ts';
import type { FreshFilm } from '../fresh-film.ts';
import type { Takes } from '../takes.ts';
import type { Review } from '../review.ts';
import { HttpPlatform } from 'effect/http';
import { Critic } from '../critique.ts';
import {
  echoPages,
  freshFilm,
  noStudio,
  noRenders,
  noWrites,
  noScenes,
  noReview,
} from '../film-services/testing.ts';
import { memoryFileSystem, memoryLocks } from '../host/testing.ts';

export const NOTES_LAB = '/lab';

interface LabInMemory {
  readonly film?: Layer.Layer<FreshFilm>;
  readonly asking?: Layer.Layer<
    Review | SeriesDrafts | StudioReadings | Takes,
    never,
    ContentStore | FileSystem.FileSystem | Path.Path
  >;
  readonly mtimes?: ReadonlyMap<string, number>;
  readonly critic?: Layer.Layer<Critic, never, FileSystem.FileSystem | Path.Path>;
  readonly writes?: Layer.Layer<
    SourceWriter,
    never,
    FileSystem.FileSystem | Path.Path | FilmFolder | ContentStore
  >;
}

const noCritic = Critic.skipping('no critic in this test');

export const labInMemory = (
  files: Map<string, Uint8Array>,
  pages = echoPages,
  {
    film = freshFilm({}),
    mtimes = new Map(),
    asking = Layer.mergeAll(noStudio, noRenders),
    critic = noCritic,
    writes = noWrites,
  }: LabInMemory = {},
) => withTimelines(labStores(files, pages, { film, mtimes, asking, critic, writes }));

export const withTimelines = <A, E, R>(stores: Layer.Layer<A, E, R>) =>
  BeatEdits.layer.pipe(
    Layer.provideMerge(FilmTimelines.layer.pipe(Layer.provide(RenderCatalogue.layer))),
    Layer.provideMerge(stores),
  );

const labStores = (
  files: Map<string, Uint8Array>,
  pages: typeof echoPages,
  { film, mtimes, asking, critic, writes }: Required<LabInMemory>,
) =>
  Layer.mergeAll(
    critic,
    writes.pipe(Layer.provide(FilmFolder.layer('/films'))),
    NotesStore.layer,
    ProductionStore.layer,
    BoardStore.layer.pipe(Layer.provide(FilmFolder.layer('/films'))),
    AskStore.layer.pipe(
      Layer.provide(AskMaterials.layer),
      Layer.provide([BoardStore.layer, NotesStore.layer, ProductionStore.layer, asking, film]),
      Layer.provide(FilmFolder.layer('/films')),
    ),
    FilmFolder.layer('/films'),
    noScenes,
    noStudio,
    noReview,
    pages,
    film,
    HttpPlatform.layer,
  ).pipe(
    Layer.provideMerge(ContentStore.layer),
    Layer.provideMerge([
      memoryFileSystem(files, new Set(), mtimes),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: NOTES_LAB })),
    ]),
  );
