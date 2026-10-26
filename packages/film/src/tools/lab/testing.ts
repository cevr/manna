// The lab in memory for the tool tests (`lab.ts`): its handler over the
// stores in memory, and the film timelines over them.

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

/** Where a lab in memory keeps a film's notes (`FILMS_LAB`): `/lab/<film>/notes.json`. */
export const NOTES_LAB = '/lab';

/** What else a lab in memory runs with: its films' fresh runs, and the mtimes its files keep. */
interface LabInMemory {
  readonly film?: Layer.Layer<FreshFilm>;
  /**
   * What an ask's material is found through beside the board and the film:
   * the review's files, the drafts, the studio's readings and takes (over
   * the lab's files and store, when real).
   */
  readonly asking?: Layer.Layer<
    Review | SeriesDrafts | StudioReadings | Takes,
    never,
    ContentStore | FileSystem.FileSystem | Path.Path
  >;
  readonly mtimes?: ReadonlyMap<string, number>;
  /** The critic the lab's `critique` tool asks: none given, one that skips every critique (`noCritic`). */
  readonly critic?: Layer.Layer<Critic, never, FileSystem.FileSystem | Path.Path>;
  /** What writes the films' source: none, unless given (`writesInMemory`). */
  readonly writes?: Layer.Layer<
    SourceWriter,
    never,
    FileSystem.FileSystem | Path.Path | FilmFolder | ContentStore
  >;
}

/** A critic that skips every critique, as a counsel that cannot run does: the lab's tests that critique nothing. */
const noCritic = Critic.skipping('no critic in this test');

/**
 * The lab's services over `files` in memory, its notes under `NOTES_LAB`:
 * what its handler (`labHandler`) runs with, its pages answered by `pages`,
 * its films' fresh runs by `film` (none, unless given), and no film's
 * source, studio or review behind it.
 */
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

/**
 * `stores` with the films' timelines read over them (`FilmTimelines`) and the
 * studio's edits made on them (`BeatEdits`), as the lab's handler has them.
 */
export const withTimelines = <A, E, R>(stores: Layer.Layer<A, E, R>) =>
  BeatEdits.layer.pipe(
    Layer.provideMerge(FilmTimelines.layer.pipe(Layer.provide(RenderCatalogue.layer))),
    Layer.provideMerge(stores),
  );

/** The lab's stores in memory under `labInMemory`'s timelines. */
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
