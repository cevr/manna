// The lab's server: one web handler for the lab's whole API (`LabHttpApi` in
// `core/api.ts`, where every path, body and answer is declared), for every
// film the app has, and its pages (`LabPage`). It serves the asks' pages and
// what they read (a film's script and Board, a series' drafts, a beat's
// attempts, the renders under the roots) and the easel's looks and matches,
// and runs for days: `film lab`. The agents' writes (notes, the Board,
// a version's edits, a scene's cues and knobs) go through the lab's MCP
// commands (`lab-commands.ts`), not its routes.
//
// The API rewrites source (a beat's delivery marks) and is reached from a phone, so every request, the
// pages included, passes the one gate (`api-server.ts`): each listener's own
// name (loopback, and the phone's address, `labPhone`) and port, nothing else.

import { AskStore } from './ask-store.ts';
import { asksGroup } from './asks-http.ts';
import type { FileSystem } from 'effect';
import { Cache, Config, Duration, Effect, Layer, Option, Path } from 'effect';
import { type HttpPlatform, HttpServerRequest } from 'effect/http';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import { LabHttpApi, type MarksPost, pageHref } from '../core/api.ts';
import { StagingTakeUnknown } from '../core/refusals.ts';
import { SCRIPT_FILE, editMarks, marksTarget, sayMissed } from './script-source.ts';
import { ScriptVoices } from './script-voice.ts';
import { SeriesDrafts, draftRead } from './series-drafts.ts';
import { StagingCache } from './staging.ts';
import { type BesideRoutes, answered, serveApi } from './api-server.ts';
import { Easel } from './easel.ts';
import { LabPage } from './lab-page.ts';
import { CACHE, serveFile, urlPath } from './review-file.ts';
import { home } from './lab-home.ts';
import { reviewGroup } from './review-http.ts';
import type { Review } from './review.ts';
import type { ContentStore } from './content-store.ts';
import { FilmFolder, Stamped, filmNamed, keptWhenMade } from './film-repo.ts';
import { staleWhy } from './board-stale.ts';
import { staleInLab } from './board-stale-read.ts';
import { BoardStore } from './board-store.ts';
import { SourceWriter, type Wrote } from './source-writer.ts';
import { FreshFilm } from './fresh-film.ts';
import { writeAnswer } from './write-answer.ts';
import { type StudioReadings, studioGroup } from './studio.ts';
import type { Takes } from './takes.ts';

/** How many films' scripts the lab keeps read: one film, a few stamps of it. */
const SCRIPTS_KEPT = 8;

/**
 * A staging take's audio, `file` as the staging cache names it
 * (`audioNamed`: a name, never a path), else StagingTakeUnknown. Named by
 * its request's key, a take's audio never changes.
 */
const stagingTakeAnswer = (request: HttpServerRequest.HttpServerRequest, file: string) =>
  Effect.gen(function* () {
    const found = yield* (yield* StagingCache).audioNamed(file);
    if (Option.isNone(found)) return yield* StagingTakeUnknown.make({ file });
    return yield* serveFile(request, found.value, CACHE.hashed);
  });

/**
 * The film's script as the words reader reads it: each beat's line, picture
 * and sources, read fresh (`FreshFilm.script`) and kept under the film's
 * source stamp, so a line or a brief fixed while the lab is open is read once
 * after the change. A failed read is not kept.
 */
const scriptGroup = HttpApiBuilder.group(LabHttpApi, 'script', (handlers) =>
  Effect.gen(function* () {
    const fresh = yield* FreshFilm;
    const folder = yield* FilmFolder;
    const read = yield* Cache.makeWith((at: Stamped) => fresh.script(at.film), {
      capacity: SCRIPTS_KEPT,
      timeToLive: keptWhenMade,
    });
    return handlers
      .handle('beats', ({ params }) =>
        answered(
          Effect.gen(function* () {
            const film = yield* filmNamed(params.film);
            const stamp = yield* folder.stamp(film);
            return { film, beats: yield* Cache.get(read, new Stamped({ film, stamp })) };
          }),
        ),
      )
      .handle('voice', ({ params }) =>
        answered(
          Effect.gen(function* () {
            const film = yield* filmNamed(params.film);
            return yield* (yield* ScriptVoices).voice(film);
          }),
        ),
      )
      .handle('take', ({ params, request }) =>
        answered(Effect.andThen(filmNamed(params.film), stagingTakeAnswer(request, params.file))),
      )
      .handle('marks', ({ params, payload }) => marksWrite(params.film, payload));
  }),
);

/**
 * A beat's delivery marks written into the film's `script.ts`: one splice
 * of its `say` literal, read back only when the line parses with the words
 * it had and exactly the marks asked (`sayMissed`). Its staging take is
 * voiced again by the fill, under its new key; no take of the film's is
 * touched.
 */
const marksWrite = (name: string, payload: MarksPost) =>
  answered(
    Effect.gen(function* () {
      const film = yield* filmNamed(name);
      const path = yield* Path.Path;
      const file = path.join((yield* FilmFolder).paths(film).dir, SCRIPT_FILE);
      const target = marksTarget(payload.beat);
      const [change] = yield* (yield* SourceWriter).write({
        film,
        scene: Option.some(payload.beat),
        file,
        target,
        edit: (source) =>
          editMarks(source, payload.beat, payload.marks, Option.fromUndefinedOr(payload.read)),
        verify: (after, before) => sayMissed(after, before, payload.beat, payload.marks),
        check: () => Effect.void,
      });
      const wrote: Wrote = { scene: Option.some(payload.beat), file, target, change };
      return yield* writeAnswer(film, wrote, Effect.succeed({}));
    }),
  );

/**
 * The app's series drafts beside its films: the list, a draft's beats, each
 * spoken beat's staging take (voiced as a film's are, in the staging voice)
 * and its audio, and a beat's delivery marks written into the draft's
 * Markdown (`SeriesDrafts.mark`), answered with the draft as it now reads.
 */
const seriesGroup = HttpApiBuilder.group(LabHttpApi, 'series', (handlers) =>
  handlers
    .handle('list', () => answered(Effect.flatMap(SeriesDrafts, (d) => d.list)))
    .handle('read', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const read = yield* (yield* SeriesDrafts).read(params.series, params.draft);
          return draftRead(params.series, params.draft, read);
        }),
      ),
    )
    .handle('voice', ({ params }) =>
      answered(Effect.flatMap(ScriptVoices, (v) => v.draft(params.series, params.draft))),
    )
    .handle('take', ({ params, request }) =>
      answered(
        Effect.andThen(
          Effect.flatMap(SeriesDrafts, (drafts) => drafts.read(params.series, params.draft)),
          stagingTakeAnswer(request, params.file),
        ),
      ),
    )
    .handle('marks', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const read = yield* (yield* SeriesDrafts).mark(params.series, params.draft, payload);
          return draftRead(params.series, params.draft, read);
        }),
      ),
    ),
);

/**
 * The film's storyboard as an ask shows it: its record, the panels
 * `film board` would draw again and why, and its images (named by panel and
 * try, written once).
 */
const boardGroup = HttpApiBuilder.group(LabHttpApi, 'board', (handlers) =>
  handlers
    .handle('read', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* (yield* BoardStore).read(film);
        }),
      ),
    )
    .handle('stale', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const stale = yield* staleInLab(film);
          return { panels: stale.map((s) => ({ panel: s.panel, why: staleWhy(film, s) })) };
        }),
      ),
    )
    .handle('file', ({ params, query, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const file = yield* (yield* BoardStore).image(film, params.file, query.folder);
          return yield* serveFile(request, file, CACHE.derived);
        }),
      ),
    ),
);

/** The pages' build: a wait that answers once a source a build read changes, or the page's film is mixed, or at once for a page another server served. */
const pageGroup = HttpApiBuilder.group(LabHttpApi, 'page', (handlers) =>
  handlers.handle('wait', ({ query }) =>
    answered(
      Effect.flatMap(LabPage, (page) =>
        page.wait(
          {
            since: query.since,
            server: Option.fromUndefinedOr(query.server),
            film: Option.fromUndefinedOr(query.film),
          },
          Duration.seconds(query.timeout),
        ),
      ),
    ),
  ),
);

/** A look: stills of a scene as its sources stand, from the page the lab holds warm (`Easel`). */
const looksGroup = HttpApiBuilder.group(LabHttpApi, 'looks', (handlers) =>
  handlers.handle('take', ({ params, payload }) =>
    answered(
      Effect.gen(function* () {
        const film = yield* filmNamed(params.film);
        return yield* (yield* Easel).look(film, payload);
      }),
    ),
  ),
);

/** A match: a scene's figures held against their concepts, from the page the lab holds warm (`Easel`). */
const matchesGroup = HttpApiBuilder.group(LabHttpApi, 'matches', (handlers) =>
  handlers.handle('take', ({ params, payload }) =>
    answered(
      Effect.gen(function* () {
        const film = yield* filmNamed(params.film);
        return yield* (yield* Easel).match(film, payload);
      }),
    ),
  ),
);

/**
 * Where the owner's phone opens the lab (`FILM_LAB_PHONE_URL`, this
 * machine's tailnet address by its IP: `http://100.92.183.50:8230/`), when it
 * is set: `film lab` listens there itself, behind the same gate, which admits
 * the bound IP (a name the address resolves from is not).
 */
export const labPhone = Config.option(Config.URL('FILM_LAB_PHONE_URL'));

/**
 * What the lab's handlers run with: the asks, the Board, the film's folder,
 * its source (read, a beat's marks written), its takes, the renders' index,
 * the pages, the easel, and `FreshFilm` for every read of a film's modules.
 * The lab runs for days and keeps a module as it first imported it, so
 * nothing here loads a film (`FilmRepo`), the sound library
 * (`SoundLibrary`) or mixes in process (`Mixer`): the script and the beats
 * are read fresh (`StudioReadings`, `ScriptVoices`). `lab-context.types.ts`
 * fails the typecheck if a loader joins.
 */
export type LabContext =
  | AskStore
  | BoardStore
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
  | ContentStore
  | FilmFolder
  | SourceWriter
  | FreshFilm
  | Takes
  | StudioReadings
  | ScriptVoices
  | SeriesDrafts
  | StagingCache
  | Review
  | LabPage
  | Easel;

/**
 * The lab's whole server as one web handler over the services the caller
 * runs with (`LabContext`): every request passes the gate first, the pages
 * included, so a foreign Host reads nothing; then the API's routes answer
 * theirs, for any film the app has, and the pages the rest. A fixture's own
 * routes (`beside`, outside `/api/`) pass the same gate. Every listener
 * serves this one handler. Closed when the scope closes.
 */
export const labHandler = Effect.fn('film.lab.handler')(function* (
  beside: BesideRoutes = Layer.empty,
) {
  // The script's reads are kept for the server's life: its group is built over the services
  // the server runs with.
  const reads = yield* Effect.context<FreshFilm | FilmFolder>();
  const routes = HttpApiBuilder.layer(LabHttpApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.provide(scriptGroup, Layer.succeedContext(reads)),
        seriesGroup,
        boardGroup,
        studioGroup,
        reviewGroup,
        looksGroup,
        matchesGroup,
        pageGroup,
        asksGroup,
      ),
    ),
  );
  const pages = (yield* LabPage).answer;
  const asks = yield* AskStore;
  // `/` is no page: it sends the owner on to the ask that waits on him (`lab-home.ts`).
  const page = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (urlPath(request.url) === pageHref.home())
      return yield* Effect.provideService(home, AskStore, asks);
    return yield* pages;
  });
  return yield* serveApi(LabHttpApi, routes, { page, beside });
});
