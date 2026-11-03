import { Array as Arr, Context, Effect, Layer, type Option } from 'effect';
import type { Scope } from '../core/address.ts';
import type { PageOpenError } from './browser.ts';
import type { FrameFailed, PageCrashed, PageError } from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import {
  type Drawn,
  type HandFrame,
  type LookSample,
  type Looked,
  THUMB_H,
  THUMB_W,
  farHands,
  handJumps,
  handSpans,
  hiddenHands,
  lookSamples,
  sceneLooks,
} from './look.ts';
import { Pages } from './pages.ts';

type LookError = PageOpenError | PageError | PageCrashed | FrameFailed;

const BATCH = 40;
const HANDS_THUMB = 1;

interface LookerService {
  readonly look: (
    film: LoadedFilm,
    workers: number,
    scope: Scope,
    server: Option.Option<string>,
  ) => Effect.Effect<Looked, LookError>;
}

export class Looker extends Context.Service<Looker, LookerService>()('@manna/film/tools/Looker') {
  static readonly layer = Layer.effect(
    Looker,
    Effect.gen(function* () {
      const pages = yield* Pages;

      const look = Effect.fn('Looker.look')(function* (
        film: LoadedFilm,
        workers: number,
        scope: Scope,
        server: Option.Option<string>,
      ) {
        const placed = scope.scenes;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const size = Math.max(1, workers);
            const pool = yield* pages.open(film.paths.name, {
              workers: size,
              captions: true,
              server,
            });
            const info = pool.info;
            const drawAll = (samples: ReadonlyArray<LookSample>, w: number, h: number) =>
              Effect.map(
                Effect.forEach(
                  Arr.chunksOf(
                    samples.map((s) => s.frame),
                    BATCH,
                  ),
                  (frames) =>
                    Effect.map(pool.call('look', frames, w, h), (got) => {
                      const bytes = w * h * 4;
                      return frames.map((_, k): Drawn => ({
                        thumb: got.thumbs.subarray(k * bytes, (k + 1) * bytes),
                        faces: got.faces[k] ?? [],
                        hands: got.hands[k] ?? [],
                      }));
                    }),
                  { concurrency: size },
                ),
                (batches) => batches.flat(),
              );
            const handsOf = (samples: ReadonlyArray<LookSample>, drawn: ReadonlyArray<Drawn>) =>
              Arr.zipWith(samples, drawn, (s, d): HandFrame => ({ ...s, hands: d.hands }));
            const samples = lookSamples(placed, info.fps, info.frames);
            const drawn = yield* drawAll(samples, THUMB_W, THUMB_H);
            yield* Effect.log(`look.done film=${film.paths.name} frames=${samples.length}`);
            const coarse = handsOf(samples, drawn);
            const spans = handSpans(coarse, info.fps);
            const fine = handsOf(spans, yield* drawAll(spans, HANDS_THUMB, HANDS_THUMB));
            yield* Effect.log(`look.hands film=${film.paths.name} frames=${spans.length}`);
            return {
              looks: sceneLooks(placed, samples, drawn, info),
              height: info.height,
              jumps: handJumps(fine),
              far: farHands([...coarse, ...fine]),
              hidden: hiddenHands([...coarse, ...fine]),
            };
          }),
        );
      });

      return Looker.of({ look });
    }),
  ).pipe(Layer.provide(Pages.layer));
}
