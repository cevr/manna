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

const SCRIPTS_KEPT = 8;

const stagingTakeAnswer = (request: HttpServerRequest.HttpServerRequest, file: string) =>
  Effect.gen(function* () {
    const found = yield* (yield* StagingCache).audioNamed(file);
    if (Option.isNone(found)) return yield* StagingTakeUnknown.make({ file });
    return yield* serveFile(request, found.value, CACHE.hashed);
  });

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

export const labPhone = Config.option(Config.URL('FILM_LAB_PHONE_URL'));

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

export const labHandler = Effect.fn('film.lab.handler')(function* (
  beside: BesideRoutes = Layer.empty,
) {
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
  const page = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (urlPath(request.url) === pageHref.home())
      return yield* Effect.provideService(home, AskStore, asks);
    return yield* pages;
  });
  return yield* serveApi(LabHttpApi, routes, { page, beside });
});
