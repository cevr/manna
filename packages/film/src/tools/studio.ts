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

const READINGS_KEPT = 8;

interface StudioReadingsService {
  readonly reading: (film: FilmName) => Effect.Effect<StudioReading, FreshError | PlatformError>;
}

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

const reading = (film: FilmName) => StudioReadings.use((readings) => readings.reading(film));

const timingsOf = Effect.fn('studio.timings')(function* (film: FilmName) {
  return yield* (yield* ContentStore).read((yield* FilmFolder).paths(film).timings);
});

const pathsOf = (film: FilmName) => FilmFolder.use((folder) => Effect.succeed(folder.paths(film)));

const filmBeat = Effect.fn('studio.filmBeat')(function* (params: {
  readonly film: string;
  readonly beat: string;
}) {
  const film = yield* filmNamed(params.film);
  const known = (yield* reading(film)).beats.map((b) => b.id);
  if (!known.includes(params.beat)) return yield* UnknownScene.make({ scene: params.beat, known });
  return { film, beat: params.beat };
});

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
  return Option.match(
    Option.filter(timing, (t) => !attempts.some((a) => a.file === t.file)),
    {
      onNone: () => read,
      onSome: (t): StudioAttempts => ({ ...read, staged: { file: t.file, duration: t.duration } }),
    },
  );
});

export const studioGroup = HttpApiBuilder.group(LabHttpApi, 'studio', (handlers) =>
  handlers
    .handle('attempts', ({ params }) => answered(beatAttempts(params)))
    .handle('attempt', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const { film, beat } = yield* filmBeat(params);
          const found = yield* (yield* Takes).attemptFile(yield* pathsOf(film), beat, params.file);
          if (Option.isNone(found)) return yield* AttemptUnknown.make({ beat, file: params.file });
          return yield* serveFile(request, found.value, CACHE.derived);
        }),
      ),
    ),
);
