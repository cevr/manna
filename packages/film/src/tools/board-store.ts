import {
  Array as Arr,
  Boolean as Bool,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
} from 'effect';
import type { Result } from 'effect';
import {
  type BoardFile,
  type BoardName,
  BoardFileJson,
  type BoardRefusal,
  type BoardTry,
  type Panel,
  type TryExt,
  emptyBoard,
  nextTry,
  panelById,
  tryFile,
  withPanel,
  withTries,
} from '../core/board.ts';
import { BoardFileUnknown, BoardRefused } from '../core/refusals.ts';
import type { Segment } from '../core/segment.ts';
import type { BoardBeat } from './board-prompt.ts';
import { type Staleness, stalenessOf } from './board-stale.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder, type FilmName } from './film-repo.ts';

interface BoardPaths {
  readonly record: Manifest<BoardFile>;
  readonly folder: string;
}

const boardFiles = (board: BoardFile): ReadonlyArray<{ file: string; sha256: string }> => [
  ...Option.toArray(
    Option.map(Option.fromUndefinedOr(board.style), (s) => ({ file: s.ref, sha256: s.sha256 })),
  ),
  ...board.panels.flatMap((p) => p.tries.map((t) => ({ file: t.file, sha256: t.sha256 }))),
];

interface BoardFileProblem {
  readonly file: string;
  readonly problem: 'missing' | 'changed';
}

type NewTry = Omit<BoardTry, 'n' | 'file' | 'sha256'> & {
  readonly bytes: Uint8Array;
  readonly ext: TryExt;
};

interface PanelAt {
  readonly id: string;
  readonly beat: BoardName;
  readonly at: BoardName;
}

interface BoardStoreService {
  readonly paths: (film: FilmName, folder?: Segment) => BoardPaths;
  readonly read: (film: FilmName, folder?: Segment) => Effect.Effect<BoardFile, StoreError>;
  readonly transact: <A, E, R>(
    film: FilmName,
    change: (current: BoardFile) => Effect.Effect<readonly [A, BoardFile], E, R>,
  ) => Effect.Effect<A, E | StoreError, R>;
  readonly modify: (
    film: FilmName,
    change: (current: BoardFile) => Result.Result<BoardFile, BoardRefusal>,
  ) => Effect.Effect<BoardFile, StoreError | BoardRefused>;
  readonly put: (
    film: FilmName,
    file: string,
    bytes: Uint8Array,
  ) => Effect.Effect<string, StoreError>;
  readonly addTries: (
    film: FilmName,
    panel: PanelAt,
    order: (board: BoardFile) => ReadonlyArray<string>,
    tries: ReadonlyArray<NewTry>,
  ) => Effect.Effect<ReadonlyArray<BoardTry>, StoreError>;
  readonly image: (
    film: FilmName,
    file: string,
    version?: Segment,
  ) => Effect.Effect<string, BoardFileUnknown | StoreError>;
  readonly problems: (film: FilmName) => Effect.Effect<ReadonlyArray<BoardFileProblem>, StoreError>;
  readonly stale: (
    film: FilmName,
    beats: ReadonlyArray<BoardBeat>,
  ) => Effect.Effect<ReadonlyArray<Staleness>, StoreError>;
}

export class BoardStore extends Context.Service<BoardStore, BoardStoreService>()(
  '@manna/film/tools/BoardStore',
) {
  static readonly layer = Layer.effect(
    BoardStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const folder = yield* FilmFolder;

      const paths = (film: FilmName, version?: Segment): BoardPaths => {
        const dir = folder.paths(film, version).dir;
        return {
          record: {
            file: path.join(dir, 'board.json'),
            codec: BoardFileJson,
            empty: emptyBoard(film),
          },
          folder: path.join(dir, 'board'),
        };
      };

      const read = (film: FilmName, version?: Segment) => store.read(paths(film, version).record);

      const transact = <A, E, R>(
        film: FilmName,
        change: (current: BoardFile) => Effect.Effect<readonly [A, BoardFile], E, R>,
      ) => store.transact(paths(film).record, change);

      const modify = Effect.fn('BoardStore.modify')(function* (
        film: FilmName,
        change: (current: BoardFile) => Result.Result<BoardFile, BoardRefusal>,
      ) {
        return yield* transact(film, (current) =>
          Effect.map(
            Effect.mapError(Effect.fromResult(change(current)), (r) =>
              BoardRefused.make({ film, reason: r.reason }),
            ),
            (next) => [next, next] as const,
          ),
        );
      });

      const put = Effect.fn('BoardStore.put')(function* (
        film: FilmName,
        file: string,
        bytes: Uint8Array,
      ) {
        yield* store.writeFile(path.join(paths(film).folder, file), bytes);
        return sha256Hex(bytes);
      });

      const addTries = Effect.fn('BoardStore.addTries')(function* (
        film: FilmName,
        panel: PanelAt,
        order: (board: BoardFile) => ReadonlyArray<string>,
        tries: ReadonlyArray<NewTry>,
      ) {
        return yield* transact(film, (current) =>
          Effect.gen(function* () {
            const was = Option.getOrElse(panelById(current, panel.id), (): Panel => ({
              ...panel,
              tries: [],
            }));
            const first = nextTry(was);
            const made = yield* Effect.forEach(tries, ({ bytes, ext, ...rest }, i) =>
              Effect.map(
                put(film, tryFile(panel.beat, panel.at, first + i, ext), bytes),
                (sha256): BoardTry => ({
                  ...rest,
                  n: first + i,
                  file: tryFile(panel.beat, panel.at, first + i, ext),
                  sha256,
                }),
              ),
            );
            const next = withPanel(current, withTries(was, made), order(current));
            return [made, next] as const;
          }),
        );
      });

      const image = Effect.fn('BoardStore.image')(function* (
        film: FilmName,
        file: string,
        version?: Segment,
      ) {
        const named = Arr.findFirst(boardFiles(yield* read(film, version)), (f) => f.file === file);
        if (Option.isNone(named))
          return yield* BoardFileUnknown.make({
            film,
            file,
            reason: 'the board names no such image',
          });
        const at = path.join(paths(film, version).folder, named.value.file);
        if (!(yield* fs.exists(at)))
          return yield* BoardFileUnknown.make({
            film,
            file,
            reason: 'not in this checkout (the images are git-ignored: copy the board folder here)',
          });
        return at;
      });

      const problems = Effect.fn('BoardStore.problems')(function* (film: FilmName) {
        const dir = paths(film).folder;
        return yield* Effect.forEach(
          boardFiles(yield* read(film)),
          (f) =>
            Effect.gen(function* () {
              const at = path.join(dir, f.file);
              if (!(yield* fs.exists(at)))
                return Option.some<BoardFileProblem>({ file: f.file, problem: 'missing' });
              const bytes = yield* fs.readFile(at);
              return Bool.match(sha256Hex(bytes) === f.sha256, {
                onTrue: () => Option.none<BoardFileProblem>(),
                onFalse: () => Option.some<BoardFileProblem>({ file: f.file, problem: 'changed' }),
              });
            }),
          { concurrency: 8 },
        ).pipe(Effect.map(Arr.getSomes));
      });

      const stale = Effect.fn('BoardStore.stale')(function* (
        film: FilmName,
        beats: ReadonlyArray<BoardBeat>,
      ) {
        return yield* stalenessOf(film, paths(film).folder, yield* read(film), beats).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.provideService(FilmFolder, folder),
        );
      });

      return BoardStore.of({
        paths,
        read,
        transact,
        modify,
        put,
        addTries,
        image,
        problems,
        stale,
      });
    }),
  );
}
