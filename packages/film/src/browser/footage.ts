import { Context, Data, Effect, Layer, Option } from 'effect';
import type { Scope } from 'effect';
import type { Film, FootageFrames, FootageRead, RenderOptions } from '../canvas/film.ts';

export class FootageFrameMissing extends Data.TaggedError('FootageFrameMissing')<{
  readonly source: string;
  readonly at: number;
  readonly why: string;
}> {
  override get message() {
    return `footage ${this.source} has no frame at ${this.at.toFixed(3)} s: ${this.why}`;
  }
}

interface FootageRun {
  readonly next: Effect.Effect<FootageFrames, FootageFrameMissing>;
}

interface FootageOps {
  readonly ready: (
    reads: ReadonlyArray<FootageRead>,
  ) => Effect.Effect<FootageFrames, FootageFrameMissing>;
  readonly run: (
    frames: ReadonlyArray<ReadonlyArray<FootageRead>>,
  ) => Effect.Effect<FootageRun, never, Scope.Scope>;
}

const framesOf = (
  reads: ReadonlyArray<FootageRead>,
  frameOf: (read: FootageRead) => Option.Option<CanvasImageSource>,
): Effect.Effect<FootageFrames, FootageFrameMissing> =>
  Option.match(Option.fromUndefinedOr(reads.find((read) => Option.isNone(frameOf(read)))), {
    onNone: () =>
      Effect.succeed({ frame: (read: FootageRead) => Option.getOrUndefined(frameOf(read)) }),
    onSome: (missing) => Effect.fail(new FootageFrameMissing({ ...missing, why: 'no such frame' })),
  });

export class Footage extends Context.Service<Footage, FootageOps>()('@manna/film/browser/Footage') {
  static readonly layerOver = (
    frameOf: (read: FootageRead) => Option.Option<CanvasImageSource>,
  ): Layer.Layer<Footage> =>
    Layer.succeed(
      Footage,
      Footage.of({
        ready: (reads) => framesOf(reads, frameOf),
        run: (frames) =>
          Effect.sync(() => {
            let k = 0;
            return {
              next: Effect.suspend(() => {
                const reads = Option.getOrElse(Option.fromUndefinedOr(frames[k]), () => []);
                k += 1;
                return framesOf(reads, frameOf);
              }),
            };
          }),
      }),
    );

  static readonly none: Layer.Layer<Footage> = Footage.layerOver(() => Option.none());
}

export type FootageShown = Pick<RenderOptions, 'footage'>;

const NONE: FootageShown = {};

export const footageReads = (
  film: Pick<Film, 'footageAt'>,
): Option.Option<(T: number) => ReadonlyArray<FootageRead>> =>
  Option.fromUndefinedOr(film.footageAt);

export const readsFootage = (film: Pick<Film, 'footageAt'>): boolean =>
  Option.isSome(footageReads(film));

export const footageAt = (
  film: Pick<Film, 'footageAt'>,
  T: number,
): Effect.Effect<FootageShown, FootageFrameMissing, Footage> =>
  Option.match(footageReads(film), {
    onNone: () => Effect.succeed(NONE),
    onSome: (reads) =>
      Effect.map(
        Footage.use((footage) => footage.ready(reads(T))),
        (footage): FootageShown => ({ footage }),
      ),
  });
