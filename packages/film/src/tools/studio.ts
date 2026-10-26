// A beat's recorded attempts as the lab answers them: the handlers of the lab
// API's `studio` group (`core/api.ts`), which an ask's take block calls to
// list a beat's attempts and play one. The lab runs for hours and keeps the
// film's modules as it first imported them, so the script and the beats are
// read from a fresh process (`FreshFilm.reading`, kept under the film's
// source stamp): a line fixed while the lab is open reaches the list at once.

import { Array as Arr, Cache, Context, Effect, Layer, Option } from 'effect';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import { LabHttpApi } from '../core/api.ts';
import { hashText } from '../core/narration.ts';
import { type StudioAttempts, type StudioReading } from '../core/studio.ts';
import type { PlatformError } from 'effect/PlatformError';
import { answered } from './api-server.ts';
import { UnknownScene } from '../core/errors.ts';
import { AttemptUnknown } from '../core/refusals.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, type FilmName, Stamped, filmNamed, keptWhenMade } from './film-repo.ts';
import { type FreshError, FreshFilm } from './fresh-film.ts';
import { CACHE, serveFile } from './review-file.ts';
import { Takes } from './takes.ts';

/** How many films' readings the lab keeps: one film, a few stamps of it. */
const READINGS_KEPT = 8;

interface StudioReadingsService {
  /** The film's script, voice and beats as they stand: read fresh only when its stamp moved. */
  readonly reading: (film: FilmName) => Effect.Effect<StudioReading, FreshError | PlatformError>;
}

/**
 * What the studio read of each film (`FreshFilm.reading`), kept under the
 * film's source stamp (`FilmFolder.stamp`), so the studio's routes cost a
 * fresh process only after a file under the film changed. A failed read is
 * not kept.
 */
export class StudioReadings extends Context.Service<StudioReadings, StudioReadingsService>()(
  '@manna/film/tools/StudioReadings',
) {
  static readonly layer = Layer.effect(
    StudioReadings,
    Effect.gen(function* () {
      const fresh = yield* FreshFilm;
      const folder = yield* FilmFolder;
      const read = yield* Cache.makeWith((at: Stamped) => fresh.reading(at.film), {
        capacity: READINGS_KEPT,
        timeToLive: keptWhenMade,
      });
      return StudioReadings.of({
        reading: (film) =>
          Effect.flatMap(folder.stamp(film), (stamp) =>
            Cache.get(read, new Stamped({ film, stamp })),
          ),
      });
    }),
  );
}

/** The film's script, voice and beats as they stand. */
const reading = (film: FilmName) => StudioReadings.use((readings) => readings.reading(film));

/** The film's timings as they are stored now: a take kept a moment ago is in them. */
const timingsOf = Effect.fn('studio.timings')(function* (film: FilmName) {
  return yield* (yield* ContentStore).read((yield* FilmFolder).paths(film).timings);
});

/** Where the film's narration and attempts are. */
const pathsOf = (film: FilmName) => FilmFolder.use((folder) => Effect.succeed(folder.paths(film)));

/**
 * The film a studio route names and its `:beat`, when that is one of the
 * film's beats; anything else (another name, a `/` or `..` smuggled in
 * encoded) fails UnknownScene before the route reads or writes a thing.
 */
const filmBeat = Effect.fn('studio.filmBeat')(function* (params: {
  readonly film: string;
  readonly beat: string;
}) {
  const film = yield* filmNamed(params.film);
  const known = (yield* reading(film)).beats.map((b) => b.id);
  if (!known.includes(params.beat)) return yield* UnknownScene.make({ scene: params.beat, known });
  return { film, beat: params.beat };
});

/**
 * A film's beat's attempts as the studio lists them, newest first, each
 * kept or not and in its line as it stands or not, and the take its timings
 * name when that is none of them (a staging take): refused UnknownScene
 * unless `beat` is one of the film's beats (`filmBeat`), before a file is
 * read. The one read of a beat's takes: the studio's route answers it, and
 * an ask's take is checked by it when the ask is made (`AskMaterials`).
 */
export const beatAttempts = Effect.fn('studio.beatAttempts')(function* (params: {
  readonly film: string;
  readonly beat: string;
}) {
  const { film, beat } = yield* filmBeat(params);
  const timing = Option.fromNullishOr((yield* timingsOf(film)).scenes[beat]);
  const script = Arr.findFirst((yield* reading(film)).beats, (b) => b.id === beat);
  const attempts = yield* (yield* Takes).attempts(yield* pathsOf(film), beat);
  const read: StudioAttempts = {
    beat,
    attempts: attempts.map((a) => ({
      file: a.file,
      transcript: a.heard,
      wer: a.wer,
      at: a.at,
      duration: a.take.duration,
      kept: Option.exists(timing, (t) => t.file === a.file),
      current: Option.exists(script, (b) => a.take.hash === hashText(b.script)),
    })),
  };
  // The take the timings name, when no attempt is it: a staging take, heard until the owner records his.
  return Option.match(
    Option.filter(timing, (t) => !attempts.some((a) => a.file === t.file)),
    {
      onNone: () => read,
      onSome: (t): StudioAttempts => ({ ...read, staged: { file: t.file, duration: t.duration } }),
    },
  );
});

/** The `studio` group's handlers: a beat's attempts listed, and one attempt's file served. */
export const studioGroup = HttpApiBuilder.group(LabHttpApi, 'studio', (handlers) =>
  handlers
    .handle('attempts', ({ params }) => answered(beatAttempts(params)))
    .handle('attempt', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const { film, beat } = yield* filmBeat(params);
          const found = yield* (yield* Takes).attemptFile(yield* pathsOf(film), beat, params.file);
          if (Option.isNone(found)) return yield* AttemptUnknown.make({ beat, file: params.file });
          // A phone's Safari plays and seeks an <audio> by byte ranges.
          return yield* serveFile(request, found.value, CACHE.derived);
        }),
      ),
    ),
);
