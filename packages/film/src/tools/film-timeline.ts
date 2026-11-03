import {
  Array as Arr,
  Cache,
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { pickVersion, timelineOf, versionsOf } from '../core/film-timeline.ts';
import type { FilmTimeline } from '../core/timeline-schema.ts';
import type { FilmUnknown, FilmVersionUnkept, FilmVersionUnknown } from '../core/refusals.ts';
import { Segment } from '../core/segment.ts';
import { AskStore } from './ask-store.ts';
import { BoardStore } from './board-store.ts';
import { type CatalogueError, RenderCatalogue } from './catalogue.ts';
import type { StoreError } from './content-store.ts';
import { FilmFolder, type FilmName, filmNamed, keptWhenMade } from './film-repo.ts';
import { type FreshError, FreshFilm } from './fresh-film.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';

export type TimelineError =
  | FilmUnknown
  | FilmVersionUnknown
  | FilmVersionUnkept
  | FreshError
  | StoreError
  | CatalogueError
  | PlatformError;

interface FilmTimelinesService {
  readonly timeline: (
    film: string,
    version: Option.Option<number>,
  ) => Effect.Effect<FilmTimeline, TimelineError>;
}

class Clocked extends Data.Class<{
  readonly film: FilmName;
  readonly stamp: number;
  readonly folder: Option.Option<string>;
}> {}

const CLOCKS_KEPT = 16;

const folderOf = (n: number) => Segment.make(`v${n}`);

const filesOf = (version: { readonly n: number; readonly files: string }) =>
  Option.as(
    Option.liftPredicate(version, (v) => v.files === 'folder'),
    folderOf(version.n),
  );

export class FilmTimelines extends Context.Service<FilmTimelines, FilmTimelinesService>()(
  '@manna/film/tools/FilmTimelines',
) {
  static readonly layer = Layer.effect(
    FilmTimelines,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const folder = yield* FilmFolder;
      const fresh = yield* FreshFilm;
      const boards = yield* BoardStore;
      const notes = yield* NotesStore;
      const asks = yield* AskStore;
      const catalogues = yield* RenderCatalogue;
      const productions = yield* ProductionStore;
      const films = yield* Effect.context<FilmFolder>();
      const clocks = yield* Cache.makeWith((at: Clocked) => fresh.clock(at.film, at.folder), {
        capacity: CLOCKS_KEPT,
        timeToLive: keptWhenMade,
      });

      const timeline = Effect.fn('FilmTimelines.timeline')(function* (
        name: string,
        asked: Option.Option<number>,
      ) {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const at = folder.paths(film);
        const ledger = Arr.findFirst(yield* productions.list, (p) => Option.contains(p.film, film));
        const numbers = Option.match(ledger, {
          onNone: () => [],
          onSome: (l) => l.versions.map((_, i) => i + 1),
        });
        const folders = yield* Effect.filter(numbers, (n) =>
          fs.exists(path.join(at.dir, folderOf(n), 'script.ts')),
        );
        const versions = versionsOf(ledger, folders, film);
        const version = yield* Effect.fromResult(pickVersion(film, versions, asked));
        const open = Option.getOrElse(
          Arr.findFirst(versions, (v) => v.open),
          () => version,
        );
        const stamp = yield* folder.stamp(film);
        const sources = yield* Effect.all(
          {
            clock: Cache.get(clocks, new Clocked({ film, stamp, folder: filesOf(version) })),
            board: boards.read(film, Option.getOrUndefined(filesOf(version))),
            openBoard: boards.read(film, Option.getOrUndefined(filesOf(open))),
            catalogue: catalogues.read(at),
            notes: notes.read(film),
            asks: asks.list,
          },
          { concurrency: 'unbounded' },
        );
        yield* Effect.logDebug(
          `[timeline] read film=${film} version=${version.n} files=${version.files}`,
        );
        return timelineOf({
          film,
          ledger,
          version,
          versions,
          ...sources,
        });
      });

      return FilmTimelines.of({ timeline });
    }),
  );
}
