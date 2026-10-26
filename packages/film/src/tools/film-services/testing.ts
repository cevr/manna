// The lab's film services in memory for the tool tests (`film-services.ts`):
// a fresh film's runs answered from what a test gives, voices kept here, and
// the services a test does not call standing in as ones that die if called.

import type { Context, FileSystem, Path } from 'effect';
import { Effect, Layer, Option, Schema, Sink, Stream } from 'effect';
import { type ChildProcess, ChildProcessSpawner } from 'effect/process';
import type * as PlatformError from 'effect/PlatformError';
import { ServerFailed } from '../../core/api.ts';
import type { Route } from '../../core/testing.ts';
import { withSay } from '../../core/choice.ts';
import { hashText } from '../../core/narration.ts';
import { LookFailed } from '../../core/easel.ts';
import { Easel } from '../easel.ts';
import {
  FilmUnknown,
  FreshProcessFailed,
  RecordingInvalid,
  TakeMismatch,
} from '../../core/refusals.ts';
import type { FilmFolder } from '../film-repo.ts';
import { FilmRepo, placeFilm } from '../film-repo.ts';
import { cueOf, locateHere } from '../read-cli.ts';
import { StudioReadings } from '../studio.ts';
import { ScriptVoices } from '../script-voice.ts';
import { SeriesDrafts } from '../series-drafts.ts';
import { StagingCache } from '../staging.ts';
import { SceneSources } from '../scene-sources.ts';
import { SceneWriter } from '../scene-writer.ts';
import { SourceWriter } from '../source-writer.ts';
import { FreshFilm, type FreshFilmService, OptionsKept, SitesRead } from '../fresh-film.ts';
import { beatsOf, voicedOf } from '../narrator.ts';
import { voicePoints } from '../choice-points.ts';
import { Takes } from '../takes.ts';
import { Review } from '../review.ts';
import { Choices } from '../choices.ts';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LabPage } from '../lab-page.ts';

/** `route`'s path filled in: every `:film` naming `film`, every other param and a trailing `*` naming `x`. */
export const routePath = (route: Route, film: string): string =>
  route.path
    .split('/')
    .map((segment) => {
      if (segment === ':film') return film;
      if (segment.startsWith(':') || segment === '*') return 'x';
      return segment;
    })
    .join('/');

const unusedSource = Effect.die('the scene source is not called here');

/**
 * FreshFilm that answers only the runs a test gives it: any other run dies,
 * naming itself, since no test here spawns the film CLI unless it says so.
 */
export const freshFilm = (given: Partial<FreshFilmService>) => {
  const unused = (run: string) => () => Effect.die(`no fresh \`film ${run}\` here`);
  return Layer.succeed(
    FreshFilm,
    FreshFilm.of({
      choices: unused('options list'),
      checked: unused('options list --check'),
      mix: unused('options mix'),
      sound: unused('options sound'),
      keepVoice: unused('options keep-voice'),
      take: unused('options take'),
      reading: unused('read voice'),
      script: unused('read script'),
      cue: unused('read cue'),
      sites: unused('read sites'),
      cues: unused('read cues'),
      scenes: unused('read scenes'),
      clock: unused('read clock'),
      remix: unused('mix'),
      project: unused('project'),
      check: unused('check'),
      ...given,
    }),
  );
};

/** What a command is given on stdin, when it is given a stream. */
const stdinOf = (
  command: ChildProcess.Command,
): Stream.Stream<Uint8Array, PlatformError.PlatformError> => {
  if (command._tag !== 'StandardCommand') return Stream.empty;
  const given = command.options.stdin;
  if (Stream.isStream(given)) return given;
  return Stream.empty;
};

/**
 * A child process spawner whose every run prints back what it was given on
 * stdin and exits 0: oxfmt that leaves a text as it is. The SourceWriter
 * formats what it writes through oxfmt; over an in-memory film there is no
 * folder to run it from, and the text it formats is not what a test checks.
 */
export const formatAsIs = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make((command) => {
    const stdout = stdinOf(command);
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout,
        stderr: Stream.empty,
        all: stdout,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    );
  }),
);

const isFilmUnknown = Schema.is(FilmUnknown);

/** A failure as a fresh run answers it: a film it cannot find as itself, any other as `ServerFailed`. */
const freshFailure = (error: { readonly _tag: string; readonly message: string }) => {
  if (isFilmUnknown(error)) return error;
  return ServerFailed.make({ tag: error._tag, reason: error.message });
};

const isKeepRefusal = Schema.is(Schema.Union([TakeMismatch, RecordingInvalid]));

/**
 * `film options list` run in this process over the test's `FilmRepo` and
 * `Takes` (in `context`), for a film whose only points are its voices: each
 * beat's attempts, as `film options list` lists them.
 */
export const voicesHere = (context: Context.Context<FilmRepo | Takes>) => (film: string) =>
  Effect.gen(function* () {
    const loaded = yield* (yield* FilmRepo).load(film);
    const beats = yield* Effect.fromResult(beatsOf(loaded));
    const takes = yield* Takes;
    const attempts = yield* Effect.forEach(beats, (beat) =>
      Effect.map(takes.attempts(loaded.paths, beat.id), (made) => ({
        beat: beat.id,
        hash: hashText(beat.script),
        attempts: made,
      })),
    );
    return voicePoints(loaded, attempts).map((draft) => withSay(Option.none(), draft));
  }).pipe(Effect.provideContext(context), Effect.orDie);

/**
 * `film options keep-voice` run in this process over the test's `FilmRepo`
 * and `Takes` (in `context`), as the fresh run would over the same files:
 * the attempt kept, `mixing` standing in for its mix (answering whether it
 * mixed), a take it will not keep refused as itself, any other failure as
 * `ServerFailed`.
 */
export const keepVoiceHere =
  (
    context: Context.Context<FilmRepo | Takes>,
    mixing: Effect.Effect<boolean> = Effect.succeed(true),
  ) =>
  (film: string, beat: string, file: string, options: { readonly acceptMismatch: boolean }) =>
    Effect.gen(function* () {
      const voiced = yield* Effect.fromResult(voicedOf(yield* (yield* FilmRepo).load(film)));
      const kept = yield* (yield* Takes).keepAttempt(voiced, beat, file, options);
      const mixed = yield* mixing;
      return OptionsKept.make({ take: kept.take, heard: kept.heard, wer: kept.wer, mixed });
    }).pipe(
      Effect.provideContext(context),
      Effect.mapError((error) => {
        if (isKeepRefusal(error)) return error;
        return ServerFailed.make({ tag: error._tag, reason: error.message });
      }),
    );

/**
 * `freshFilm(given)` whose `film read cue` and `film read sites` run in this
 * process over the test's `FilmRepo` and its folder, as the fresh run would
 * over the same files: a film that does not load fails the run. A test's
 * film is a fresh folder, so this process's imports of it are its files.
 */
export const freshHere = (given: Partial<FreshFilmService>) =>
  Layer.unwrap(
    Effect.map(
      Effect.context<FilmRepo | FilmFolder | FileSystem.FileSystem | Path.Path>(),
      (context) =>
        freshFilm({
          sites: (film) =>
            locateHere(film).pipe(
              Effect.map((located) =>
                SitesRead.make({
                  sites: [...located.sites.values()],
                  unlocated: located.unlocated,
                }),
              ),
              Effect.mapError(freshFailure),
              Effect.provideContext(context),
            ),
          cue: (film, scene, cue, spans, patch) =>
            FilmRepo.use((repo) => repo.load(film)).pipe(
              Effect.flatMap(placeFilm),
              Effect.map((placed) =>
                cueOf(
                  placed,
                  scene,
                  cue,
                  Option.getOrElse(spans, () => ({})),
                  patch,
                ),
              ),
              Effect.mapError((error) =>
                FreshProcessFailed.make({
                  command: 'film read cue',
                  reason: `${error._tag}: ${error.message}`,
                }),
              ),
              Effect.provideContext(context),
            ),
          ...given,
        }),
    ),
  );

/**
 * The scenes' source services where a test calls none of their routes (it
 * may still write through a real SourceWriter): the lab's handler serves
 * them too, so they only have to exist.
 */
export const noScenes = Layer.mergeAll(
  Layer.succeed(
    SceneSources,
    SceneSources.of({
      locate: () => unusedSource,
      site: () => unusedSource,
      writable: () => unusedSource,
      code: () => unusedSource,
    }),
  ),
  Layer.succeed(
    SceneWriter,
    SceneWriter.of({ setCue: () => unusedSource, setKnob: () => unusedSource }),
  ),
);

/**
 * The scene source's services where a test calls none of its routes: the
 * lab's handler serves them too, so they only have to exist.
 */
export const noWrites = Layer.succeed(
  SourceWriter,
  SourceWriter.of({
    write: () => unusedSource,
    around: () => unusedSource,
    undo: () => unusedSource,
    history: () => unusedSource,
    // Nothing lands through a writer no test calls.
    landings: Effect.succeed([]),
  }),
);

/** No film's source behind the lab: its scenes and its writer only have to exist. */
export const noSource = Layer.mergeAll(noScenes, noWrites);

/**
 * A real SourceWriter over a lab in memory (`labInMemory`'s `writes`), oxfmt
 * leaving each text as it is (`formatAsIs`): the studio's edits land in the
 * test's files and step back and on.
 */
export const writesInMemory = SourceWriter.layer.pipe(Layer.provide(formatAsIs));

const unstaged = Effect.die('the staging takes are not called here');

/**
 * The Script reader's staging takes, and an app with no series drafts, where
 * a test calls none of their routes: the lab's handler serves them too, so
 * they only have to exist.
 */
export const noStaging = Layer.mergeAll(
  Layer.succeed(
    ScriptVoices,
    ScriptVoices.of({ voice: () => unstaged, draft: () => unstaged, fill: unstaged }),
  ),
  Layer.succeed(
    SeriesDrafts,
    SeriesDrafts.of({
      list: Effect.succeed({ series: [] }),
      keys: Effect.succeed([]),
      read: () => unstaged,
      reading: () => unstaged,
      mark: () => unstaged,
    }),
  ),
  Layer.succeed(
    StagingCache,
    StagingCache.of({
      get: () => unstaged,
      put: () => unstaged,
      reading: () => unstaged,
      audioOf: () => '',
      audioNamed: () => unstaged,
      charge: () => unstaged,
      today: unstaged,
    }),
  ),
);

/**
 * The studio's services where a test calls none of its routes: the lab's
 * handler serves the studio too, so they only have to exist.
 */
export const noStudio = Layer.mergeAll(
  Layer.succeed(
    Takes,
    Takes.of({
      importPath: () => Effect.die('the studio is not called here'),
      recordAttempt: () => Effect.die('the studio is not called here'),
      attempts: () => Effect.die('the studio is not called here'),
      attemptFile: () => Effect.die('the studio is not called here'),
      keepAttempt: () => Effect.die('the studio is not called here'),
      named: () => ({
        bring: () => Effect.die('the studio is not called here'),
        putAway: () => Effect.die('the studio is not called here'),
        remake: Option.none(),
      }),
    }),
  ),
  Layer.succeed(
    StudioReadings,
    StudioReadings.of({ reading: () => Effect.die('the studio is not called here') }),
  ),
  noStaging,
);

const unreviewed = (op: string) => Effect.die(`the review is not called here (${op})`);

/**
 * The review's renders where a test calls none of their routes (it may still
 * pick through a real Choices): the lab's handler serves them too, so they
 * only have to exist.
 */
export const noRenders = Layer.succeed(
  Review,
  Review.of({
    roots: [],
    index: () => unreviewed('index'),
    // A write tells the review it wrote: with no review there is nothing to drop.
    written: Effect.void,
    pictures: () => unreviewed('pictures'),
    renderVideo: () => unreviewed('renderVideo'),
    resolve: () => unreviewed('resolve'),
    duration: () => unreviewed('duration'),
    frame: () => unreviewed('frame'),
    phone: () => unreviewed('phone'),
    derive: () => unreviewed('derive'),
  }),
);

/**
 * The review's services where a test calls none of its routes (the renders,
 * the choices): the lab's handler serves them too, so they only have to
 * exist.
 */
export const noReview = Layer.mergeAll(
  noRenders,
  Layer.succeed(
    Choices,
    Choices.of({
      list: () => unreviewed('list'),
      checked: () => unreviewed('checked'),
      pick: () => unreviewed('pick'),
      say: () => unreviewed('say'),
      alone: () => unreviewed('alone'),
      inPlace: () => unreviewed('inPlace'),
    }),
  ),
);

/**
 * The lab's pages as a test sees them: each answers its path, a wait the
 * build it was asked past, and no page hears a mix; the easel draws nothing
 * (a look fails `LookFailed`), since no browser runs.
 */
export const echoPages = Layer.mergeAll(
  Layer.succeed(
    LabPage,
    LabPage.of({
      answer: Effect.map(HttpServerRequest.HttpServerRequest, (request) =>
        HttpServerResponse.text(`page ${new URL(request.url, 'http://lab').pathname}`),
      ),
      wait: (served) => Effect.succeed({ build: served.since, server: 'echo' }),
      heardAt: () => Effect.succeedNone,
      built: Effect.succeed({
        build: { build: 0, server: 'echo' },
        kept: 0,
        failed: Option.none(),
      }),
      wedge: () =>
        Effect.succeed({
          build: { build: 0, server: 'echo' },
          kept: 0,
          failed: Option.none(),
          wedge: 'w',
        }),
    }),
  ),
  Layer.succeed(
    Easel,
    Easel.of({
      serve: () => Effect.void,
      look: () => Effect.fail(LookFailed.make({ reason: 'no easel in this test' })),
      match: () => Effect.fail(LookFailed.make({ reason: 'no easel in this test' })),
    }),
  ),
);
