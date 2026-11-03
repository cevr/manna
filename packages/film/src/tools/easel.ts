import {
  Array as Arr,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Result,
  Scope,
  Semaphore,
} from 'effect';
import {
  type Look,
  LabElsewhere,
  LookFailed,
  type LookLevelUnknown,
  type LookPost,
  type LookTaken,
  PagesBroken,
  type PlaceError,
  type SceneTimes,
  lookFileName,
  momentOf,
  viewBox,
  wedgeName,
} from '../core/easel.ts';
import { pageHref } from '../core/api.ts';
import { UnknownScene } from '../core/errors.ts';
import { measureFigure } from '../core/figure.ts';
import {
  type ConceptImage,
  type FigureMark,
  type FigureMatched,
  MatchFigureUnknown,
  type MatchPost,
  type MatchTaken,
  type Unmatched,
  compareFigures,
  conceptImageName,
  figureName,
  matchStem,
  matchTable,
  onFrame,
  sceneBoxOf,
  sideBySide,
} from '../core/match.ts';
import { keptFile } from '../core/cast-sheet.ts';
import { cropRaster } from '../core/raster.ts';
import type { SourceRefused } from '../core/refusals.ts';
import { Browser, type FramePage } from './browser.ts';
import { FilmFolder, type FilmName, type FilmPaths } from './film-repo.ts';
import { LabPage, type PagesNow } from './lab-page.ts';
import { castFolder } from './cast-library.ts';
import { decodePng, encodePng } from './png.ts';
import { PALETTE_FILE, paletteSwaps } from './wedge.ts';

type LookError =
  | PlaceError
  | UnknownScene
  | PagesBroken
  | LookFailed
  | LabElsewhere
  | LookLevelUnknown
  | SourceRefused;

type MatchError =
  | PlaceError
  | UnknownScene
  | PagesBroken
  | LookFailed
  | LabElsewhere
  | MatchFigureUnknown;

const MATCH_VIEW = { mode: 'plain', captions: false, format: 'image/png' } as const;

const conceptPath = (
  path: Path.Path,
  paths: FilmPaths,
  image: ConceptImage,
): Effect.Effect<string, string, FilmFolder | FileSystem.FileSystem | Path.Path> =>
  Match.value(image).pipe(
    Match.when({ set: Match.string }, (set) =>
      Effect.succeed(path.join(path.dirname(paths.out), set.set, set.file)),
    ),
    Match.when({ board: Match.string }, (board) =>
      Effect.succeed(path.join(paths.dir, 'board', board.board)),
    ),
    Match.when({ cast: Match.string }, (cast) =>
      castFolder(paths.name, cast.cast).pipe(
        Effect.map((folder) => path.join(folder, keptFile(cast.sheet, cast.view ?? cast.sheet))),
        Effect.mapError((e) => e.message),
      ),
    ),
    Match.exhaustive,
  );

interface EaselService {
  readonly serve: (origin: string) => Effect.Effect<void>;
  readonly look: (film: FilmName, post: LookPost) => Effect.Effect<LookTaken, LookError>;
  readonly match: (film: FilmName, post: MatchPost) => Effect.Effect<MatchTaken, MatchError>;
}

interface Held {
  readonly build: string;
  readonly page: FramePage;
  readonly scenes: ReadonlyArray<SceneTimes>;
  readonly scope: Scope.Closeable;
}

const HELD_MAX = 4;

const reachable = (origin: string): string =>
  origin.replace('//0.0.0.0', '//127.0.0.1').replace('//[::]', '//127.0.0.1');

const easelUrl = (origin: string, film: string, kept: number, wedge: string): string => {
  const pinned = Arr.match(
    Arr.filter([wedge], (w) => w !== ''),
    {
      onEmpty: () => `build=${kept}`,
      onNonEmpty: ([w]) => `wedge=${encodeURIComponent(w)}`,
    },
  );
  return new URL(`${pageHref.export(film)}?${pinned}`, reachable(origin)).href;
};

const failedLook = (error: { readonly message: string }) =>
  LookFailed.make({ reason: error.message });

export const plainAbsolute = (folder: string): boolean =>
  folder.startsWith('/') && !folder.split('/').includes('..');

export const elsewhereOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  from: string,
  film: string,
): Effect.Effect<Option.Option<LabElsewhere>> =>
  Effect.gen(function* () {
    const real = (folder: string) => Effect.option(fs.realPath(folder));
    const lab = path.resolve(dir);
    const served = yield* real(path.dirname(lab));
    const asked = yield* Option.match(Option.liftPredicate(from, plainAbsolute), {
      onNone: () => Effect.succeedNone,
      onSome: real,
    });
    if (Option.isSome(served) && Option.isSome(asked) && served.value === asked.value)
      return Option.none();
    const here = Option.match(asked, {
      onNone: () => `${from.replace(/\/+$/u, '')}/${film}`,
      onSome: (folder) => path.join(folder, film),
    });
    return Option.some(LabElsewhere.make({ lab, here }));
  });

export class Easel extends Context.Service<Easel, EaselService>()('@manna/film/tools/Easel') {
  static readonly layer: Layer.Layer<
    Easel,
    never,
    Browser | LabPage | FilmFolder | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    Easel,
    Effect.gen(function* () {
      const browser = yield* Browser;
      const pages = yield* LabPage;
      const folder = yield* FilmFolder;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const scope = yield* Effect.scope;
      const origin = yield* Deferred.make<string>();
      const one = yield* Semaphore.make(1);
      const held = new Map<string, Held>();

      const drop = (key: string) =>
        Option.match(Option.fromUndefinedOr(held.get(key)), {
          onNone: () => Effect.void,
          onSome: (h) =>
            Effect.andThen(
              Effect.sync(() => held.delete(key)),
              Scope.close(h.scope, Exit.void),
            ),
        });

      const pageOn = Effect.fn('Easel.page')(function* (key: string, build: string, url: string) {
        const kept = Option.filter(Option.fromUndefinedOr(held.get(key)), (h) => h.build === build);
        if (Option.isSome(kept)) return kept.value;
        yield* drop(key);
        for (const old of [...held.keys()].slice(0, Math.max(0, held.size - HELD_MAX + 1)))
          yield* drop(old);
        const opened = yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const own = yield* Scope.fork(scope);
            return yield* restore(
              Effect.gen(function* () {
                const page = yield* Scope.provide(own)(browser.open(url));
                const scenes = yield* page.call('scenes');
                return { build, page, scenes, scope: own } satisfies Held;
              }),
            ).pipe(
              Effect.onExit((exit) => {
                if (Exit.isSuccess(exit)) return Effect.sync(() => void held.set(key, exit.value));
                return Scope.close(own, Exit.void);
              }),
            );
          }),
        ).pipe(Effect.mapError(failedLook));
        yield* Effect.log(
          `easel.page.opened page=${key} build=${build} scenes=${opened.scenes.length}`,
        );
        return opened;
      });

      const buildFor = Effect.fn('Easel.build')(function* (
        film: FilmName,
        levels: Readonly<Record<string, string>>,
      ) {
        const palette = path.join(folder.paths(film).dir, PALETTE_FILE);
        const swaps = yield* paletteSwaps(fs, palette, levels);
        if (swaps.size === 0) {
          const now: PagesNow = yield* pages.built;
          return { ...now, wedge: '' };
        }
        return yield* pages.wedge(swaps);
      });

      const look = Effect.fn('Easel.look')(function* (film: FilmName, post: LookPost) {
        const started = yield* Clock.currentTimeMillis;
        const paths = folder.paths(film);
        const elsewhere = yield* Option.match(Option.fromUndefinedOr(post.from), {
          onNone: () => Effect.succeedNone,
          onSome: (from) => elsewhereOf(fs, path, paths.dir, from, film),
        });
        if (Option.isSome(elsewhere)) return yield* elsewhere.value;
        const levels = Option.getOrElse(Option.fromUndefinedOr(post.levels), () => ({}));
        const wedge = wedgeName(levels);
        const now = yield* buildFor(film, levels);
        if (Option.isSome(now.failed)) return yield* PagesBroken.make({ reason: now.failed.value });
        const build = [now.build.server, now.kept, ...[now.wedge].filter(Boolean)].join('.');
        const builtAt = yield* Clock.currentTimeMillis;
        const key = [film, ...[wedge].filter(Boolean)].join('?');
        const page = yield* pageOn(
          key,
          build,
          easelUrl(yield* Deferred.await(origin), film, now.kept, now.wedge),
        );
        const pageAt = yield* Clock.currentTimeMillis;
        const scene = yield* Effect.fromOption(
          Option.fromUndefinedOr(page.scenes.find((s) => s.id === post.scene)),
        ).pipe(
          Effect.mapError(() =>
            UnknownScene.make({ scene: post.scene, known: page.scenes.map((s) => s.id) }),
          ),
        );
        const { info } = page.page;
        const box = yield* Effect.fromResult(viewBox(post.view, info.width, info.height));
        const moments = yield* Effect.forEach(post.at, (at) =>
          Effect.fromResult(momentOf(scene, info.fps, at)),
        );
        const dir = path.join(paths.out, 'look', scene.id);
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(failedLook));
        const looks = yield* Effect.forEach(moments, (moment) =>
          Effect.gen(function* () {
            const bytes = yield* page.page
              .call('still', moment.frame, post.view)
              .pipe(Effect.tapError(() => drop(key)));
            const file = path.join(dir, lookFileName(moment, post.view, build, wedge));
            yield* fs.writeFile(file, bytes);
            return {
              file,
              scene: scene.id,
              at: moment.at,
              frame: moment.frame,
              time: moment.time,
              width: box.dw,
              height: box.dh,
            } satisfies Look;
          }).pipe(Effect.mapError(failedLook)),
        );
        const doneAt = yield* Clock.currentTimeMillis;
        yield* Effect.log(
          `easel.look film=${film} scene=${scene.id} stills=${looks.length} mode=${post.view.mode} wedge=${wedge || 'none'} build=${build} ms=${doneAt - started} built_ms=${builtAt - started} page_ms=${pageAt - builtAt} draw_ms=${doneAt - pageAt}`,
        );
        return { build, looks } satisfies LookTaken;
      });

      const freshBuild = Effect.fn('Easel.fresh')(function* (
        film: FilmName,
        from: Option.Option<string>,
      ) {
        const paths = folder.paths(film);
        const elsewhere = yield* Option.match(from, {
          onNone: () => Effect.succeedNone,
          onSome: (asked) => elsewhereOf(fs, path, paths.dir, asked, film),
        });
        if (Option.isSome(elsewhere)) return yield* elsewhere.value;
        const now: PagesNow = yield* pages.built;
        if (Option.isSome(now.failed)) return yield* PagesBroken.make({ reason: now.failed.value });
        return now;
      });

      const match = Effect.fn('Easel.match')(function* (film: FilmName, post: MatchPost) {
        const started = yield* Clock.currentTimeMillis;
        const paths = folder.paths(film);
        const now = yield* freshBuild(film, Option.fromUndefinedOr(post.from));
        const build = [now.build.server, now.kept].join('.');
        const page = yield* pageOn(
          film,
          build,
          easelUrl(yield* Deferred.await(origin), film, now.kept, ''),
        );
        const scene = yield* Effect.fromOption(
          Option.fromUndefinedOr(page.scenes.find((s) => s.id === post.scene)),
        ).pipe(
          Effect.mapError(() =>
            UnknownScene.make({ scene: post.scene, known: page.scenes.map((s) => s.id) }),
          ),
        );
        const { info } = page.page;
        const moment = yield* Effect.fromResult(momentOf(scene, info.fps, post.at));
        const drawn = <A, E>(call: Effect.Effect<A, E>) =>
          call.pipe(Effect.tapError(() => drop(film)));
        const marks = (yield* drawn(page.page.call('figures', moment.frame)).pipe(
          Effect.mapError(failedLook),
        )).filter((m) => m.scene === scene.id);
        const asked = Option.fromUndefinedOr(post.figure);
        const named = (m: FigureMark) =>
          Option.match(asked, {
            onNone: () => true,
            onSome: (figure) => figureName(m.key) === figure || m.key === figure,
          });
        const figures = marks.filter((m) => m.face && named(m));
        if (Option.isSome(asked) && figures.length === 0)
          return yield* MatchFigureUnknown.make({
            scene: scene.id,
            figure: asked.value,
            known: marks.filter((m) => m.face).map((m) => figureName(m.key)),
          });
        const png = yield* drawn(page.page.call('still', moment.frame, MATCH_VIEW)).pipe(
          Effect.mapError(failedLook),
        );
        const still = yield* Effect.fromResult(decodePng(png)).pipe(Effect.mapError(failedLook));
        const dir = path.join(paths.out, 'match', scene.id);
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(failedLook));
        const place = `${scene.id} ${post.at}, t=${moment.time.toFixed(2)} frame ${moment.frame}, build ${build}`;

        const matchOne = (mark: FigureMark) =>
          Effect.gen(function* () {
            const name = figureName(mark.key);
            const unmatched = (reason: string) => Result.fail<Unmatched>({ figure: name, reason });
            if (!onFrame(mark, still.width, still.height))
              return unmatched("the frame does not show it: its box lies past the frame's edge");
            const declared = Option.fromUndefinedOr(mark.concept);
            if (Option.isNone(declared)) return unmatched('its rig declares no concept');
            const concept = declared.value;
            const found = yield* Effect.result(
              conceptPath(path, paths, concept.image).pipe(
                Effect.provideService(FilmFolder, folder),
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              ),
            );
            if (Result.isFailure(found))
              return unmatched(`its concept ${conceptImageName(concept.image)}: ${found.failure}`);
            const file = found.success;
            const bytes = yield* Effect.result(fs.readFile(file));
            if (Result.isFailure(bytes))
              return unmatched(`its concept ${conceptImageName(concept.image)} is not at ${file}`);
            const image = decodePng(bytes.success);
            if (Result.isFailure(image))
              return unmatched(`its concept ${file}: ${image.failure.message}`);
            const conceptCrop = cropRaster(image.success, concept.box);
            const conceptMeasure = measureFigure(conceptCrop);
            if (Result.isFailure(conceptMeasure))
              return unmatched(`in its concept, ${conceptMeasure.failure.message}`);
            const sceneBox = sceneBoxOf(mark, marks, still.width, still.height);
            const sceneCrop = cropRaster(still, sceneBox);
            const sceneMeasure = measureFigure(sceneCrop);
            if (Result.isFailure(sceneMeasure))
              return unmatched(
                `in the scene (box ${sceneBox.map(Math.round).join(',')}), ${sceneMeasure.failure.message}`,
              );
            const rows = compareFigures(conceptMeasure.success, sceneMeasure.success);
            const stem = path.join(dir, matchStem(name, moment.time, build));
            const side = `${stem}.png`;
            const table = `${stem}.md`;
            yield* fs.writeFile(
              side,
              encodePng(
                sideBySide(
                  { crop: conceptCrop, measure: conceptMeasure.success },
                  { crop: sceneCrop, measure: sceneMeasure.success },
                ),
              ),
            );
            yield* fs.writeFileString(table, matchTable(name, concept, rows, place));
            const crops = { concept: `${stem}.concept.png`, scene: `${stem}.scene.png` };
            yield* fs.writeFile(crops.concept, encodePng(conceptCrop));
            yield* fs.writeFile(crops.scene, encodePng(sceneCrop));
            return Result.succeed<FigureMatched>({
              figure: name,
              key: mark.key,
              concept,
              rows,
              side,
              table,
              crops,
            });
          }).pipe(Effect.mapError(failedLook));
        const results = yield* Effect.forEach(figures, matchOne);
        const matched = Arr.getSuccesses(results);
        const unmatched = Arr.getFailures(results);
        const doneAt = yield* Clock.currentTimeMillis;
        yield* Effect.log(
          `easel.match film=${film} scene=${scene.id} at=${post.at} figures=${matched.length} unmatched=${unmatched.length} build=${build} ms=${doneAt - started}`,
        );
        return {
          build,
          scene: scene.id,
          at: post.at,
          frame: moment.frame,
          time: moment.time,
          marks: scene.marks,
          figures: matched,
          unmatched,
        } satisfies MatchTaken;
      });

      return Easel.of({
        serve: (at) => Effect.asVoid(Deferred.succeed(origin, at)),
        look: (film, post) => one.withPermits(1)(look(film, post)),
        match: (film, post) => one.withPermits(1)(match(film, post)),
      });
    }),
  );
}
