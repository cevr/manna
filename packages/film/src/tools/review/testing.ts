// The review's HTTP for the tool tests (`review.ts`; review-http,
// choices-http, project-http): a review of one film served in memory, and
// requests to it as a phone sends them.

import { AskMaterials } from '../ask-materials.ts';
import { AskStore } from '../ask-store.ts';
import {
  Array as Arr,
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Refusal } from '../../core/api.ts';
import { type Project, emptyCatalogue, projectOf } from '../../core/catalogue.ts';
import { type FilmChoices, withSay } from '../../core/choice.ts';
import { ChangeId } from '../../core/schema.ts';
import { RenderCatalogue } from '../catalogue.ts';
import { ContentStore } from '../content-store.ts';
import { labHandler } from '../lab.ts';
import { NotesStore } from '../notes-store.ts';
import { ProductionStore } from '../production-store.ts';
import { BoardStore } from '../board-store.ts';
import { SceneNotRendered, VerbRefused } from '../../core/refusals.ts';
import { FilmFolder } from '../film-repo.ts';
import { type Change, SourceWriter } from '../source-writer.ts';
import { Review } from '../review.ts';
import { Choices } from '../choices.ts';
import { freshFilm, noSource, noStudio, echoPages, noRenders } from '../film-services/testing.ts';
import { reviewMedia } from '../media/testing.ts';
import { withTimelines } from '../lab/testing.ts';

/** A score option as film `f` offers it. */
const reviewOption = (id: string, picked: boolean) => ({
  id,
  label: id,
  lines: [],
  state: 'current' as const,
  picked,
  verbs: Arr.filter(['pick'] as const, () => !picked),
  media: { _tag: 'Heard' as const, alone: false, inPlace: true },
  key: id,
});

/** Film `f`'s choices: one score of two options, `warm` playing. */
export const REVIEW_CHOICES: FilmChoices = {
  film: 'f',
  pictures: [],
  points: [
    withSay(Option.none(), {
      ref: { _tag: 'Score' },
      address: Option.some({ _tag: 'Film' }),
      title: 'score',
      lines: [],
      variants: [reviewOption('warm', true), reviewOption('bright', false)],
    }),
  ],
};

/** Film `f`'s project: one scene, `a`, not yet rendered. */
export const REVIEW_PROJECT: Project = projectOf(
  emptyCatalogue('f'),
  { key: 'fk', sound: Option.none(), acts: [], scenes: [{ scene: 'a', key: 'k1' }] },
  'main',
);

/** The `film project` args each fresh run of one review fixture was asked for, in order. */
export class ReviewProjectRuns extends Context.Service<
  ReviewProjectRuns,
  ReadonlyArray<ReadonlyArray<string>>
>()('test/ReviewProjectRuns') {}

/** The pick of `bright`, in `sound.ts` of film `f` under `films`. */
const reviewPickIn = (films: string): Change => ({
  id: ChangeId.make('pick-bright'),
  film: 'f',
  scene: Option.none(),
  file: `${films}/f/sound.ts`,
  target: 'score play bright',
  before: "play: 'warm'",
  after: "play: 'bright'",
  follows: Option.none(),
  files: Option.none(),
});

const reviewUnused = Effect.die('not used by the review routes');

/**
 * Film `f`'s services, faked over a films folder that holds only `f`: its
 * choices, a pick of `bright` that lands, an undo of it, and a check with
 * nothing to say. Every other name is no film of the app's. Each fresh run
 * of `film project` is noted in `runs`.
 */
const reviewFilmServices = (films: string, runs: Array<ReadonlyArray<string>>) => {
  const PICK = reviewPickIn(films);
  return Layer.mergeAll(
    Layer.succeed(
      Choices,
      Choices.of({
        list: () => Effect.succeed(REVIEW_CHOICES),
        checked: () => Effect.succeed({ choices: REVIEW_CHOICES, findings: [] }),
        pick: (_, asked) =>
          Effect.succeed({
            file: PICK.file,
            target: `${asked.point} play ${asked.variant}`,
            change: Option.some(PICK),
            mixed: Option.none(),
          }),
        say: () => Effect.succeed(REVIEW_CHOICES),
        alone: () => reviewUnused,
        inPlace: () => reviewUnused,
      }),
    ),
    freshFilm({
      project: (args) =>
        Effect.suspend((): Effect.Effect<Project, SceneNotRendered | VerbRefused> => {
          runs.push(args);
          if (args.includes('b'))
            return Effect.fail(
              VerbRefused.make({
                point: 'render:scenes:b',
                variant: 'main',
                verb: 'approve',
                reason: 'it is stale: its sources changed since it was made',
              }),
            );
          if (args.includes('--scene'))
            return Effect.fail(SceneNotRendered.make({ film: 'f', scene: 'a', variant: 'main' }));
          return Effect.succeed(REVIEW_PROJECT);
        }),
      check: (_, leg) =>
        Effect.succeed(
          Arr.filter(
            [{ level: 'warning', tag: 'DeadAir', message: 'no sound 3.0-4.2 s' }] as const,
            () => leg === 'sound',
          ),
        ),
    }),
    Layer.succeed(
      SourceWriter,
      SourceWriter.of({
        write: () => reviewUnused,
        around: () => reviewUnused,
        step: (verb) =>
          Effect.succeed([
            { ...PICK, target: `${verb} ${PICK.target}` },
            Option.none<number>(),
          ] as const),
        history: () =>
          Effect.succeed({
            undo: Option.none(),
            redo: Option.some(PICK),
            latest: Option.none(),
            landed: [],
          }),
        landings: Effect.succeed([]),
      }),
    ),
    FilmFolder.layer(films),
  );
};

export class ReviewTestRoot extends Context.Service<ReviewTestRoot, string>()('test/Root') {}

/**
 * The review over `out/art` (a set of two), its videos `seconds` long and a
 * frame the video copied; its fresh `film project` runs, its own, are
 * `ReviewProjectRuns`. With `phoneCopies`, a video over 1,000 bytes gets its
 * phone copy made in the background, as the index finds it.
 */
export const reviewHttpFixtureLasting = (seconds: number, phoneCopies = false) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = path.join(dir, 'out');
      yield* fs.makeDirectory(path.join(out, 'art'), { recursive: true });
      yield* fs.writeFileString(path.join(out, 'art', 'roof.A.mp4'), '0123456789');
      yield* fs.writeFileString(path.join(out, 'art', 'roof.B.mp4'), 'abcdefghij');
      yield* fs.writeFileString(path.join(out, 'art', 'roof.vtt'), 'WEBVTT');
      yield* fs.writeFileString(
        path.join(out, 'art', 'review.json'),
        '{ "title": "Art", "docs": ["roof.vtt"], "sets": { "roof": { "order": ["A", "B"] } } }',
      );
      yield* fs.writeFileString(path.join(dir, 'secret.mp4'), 'secret');
      const films = path.join(dir, 'films');
      yield* fs.makeDirectory(path.join(films, 'f', 'scenes'), { recursive: true });
      yield* fs.writeFileString(path.join(films, 'f', 'scenes', 'index.ts'), 'export {};\n');
      yield* fs.makeDirectory(path.join(dir, 'beside', 'scenes'), { recursive: true });
      yield* fs.writeFileString(path.join(dir, 'beside', 'scenes', 'index.ts'), 'export {};\n');
      const runs: Array<ReadonlyArray<string>> = [];
      return Review.layer({
        roots: [{ label: 'out', path: out }],
        cache: path.join(dir, 'cache'),
        phoneOver: 1000,
        maxVideo: 10_000,
        phoneCopies,
      }).pipe(
        Layer.provide(reviewMedia([], seconds)),
        Layer.provide(RenderCatalogue.layer.pipe(Layer.provide(ContentStore.layer))),
        Layer.merge(Layer.succeed(ReviewTestRoot, dir)),
        Layer.merge(
          Layer.mergeAll(
            noSource,
            noStudio,
            echoPages,
            Layer.mergeAll(
              NotesStore.layer,
              ProductionStore.layer,
              BoardStore.layer.pipe(Layer.provide(FilmFolder.layer(films))),
              AskStore.layer.pipe(
                Layer.provide(AskMaterials.layer),
                Layer.provide([
                  BoardStore.layer,
                  NotesStore.layer,
                  ProductionStore.layer,
                  noStudio,
                  noRenders,
                  freshFilm({}),
                ]),
                Layer.provide(FilmFolder.layer(films)),
              ),
            ).pipe(
              Layer.provideMerge(ContentStore.layer),
              Layer.provide(
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({
                    FILMS_LAB: path.join(dir, 'lab'),
                    FILMS_PRODUCTIONS: path.join(dir, 'productions'),
                  }),
                ),
              ),
            ),
          ),
        ),
        Layer.merge(reviewFilmServices(films, runs)),
        Layer.merge(Layer.succeed(ReviewProjectRuns, runs)),
        withTimelines,
      );
    }),
  ).pipe(Layer.provideMerge(Layer.mergeAll(BunServices.layer, BunHttpPlatform.layer)));

/** The review fixture, its videos 12.5 s long. */
export const reviewHttpFixture = reviewHttpFixtureLasting(12.5);

/** The listener a review test's request comes on: the owner's phone address (a tailnet one), on 8229. */
const reviewTestBound = { hostname: '100.64.0.9', port: 8229 } as const;

/** The Host a page served on that listener names. */
export const REVIEW_TEST_HOST = '100.64.0.9:8229';

export const reviewTestGet = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:8229${path}`, { method: 'GET', headers });

export const reviewTestAsk = (request: Request) =>
  Effect.gen(function* () {
    const review = yield* labHandler();
    return yield* Effect.promise(() => review(request, reviewTestBound));
  });

export const reviewTestBody = (response: Response) => Effect.promise(() => response.text());

/** A refusal's JSON, decoded as the page decodes it. */
export const reviewTestRefusalOf = Schema.decodeSync(Schema.fromJsonString(Refusal));

export const reviewTestPost = (
  route: string,
  body: string,
  origin: string,
  type = 'application/json',
) =>
  new Request(`http://127.0.0.1:8229${route}`, {
    method: 'POST',
    headers: { host: REVIEW_TEST_HOST, origin, 'content-type': type },
    body,
  });

export const REVIEW_TEST_HOME = `http://${REVIEW_TEST_HOST}`;
