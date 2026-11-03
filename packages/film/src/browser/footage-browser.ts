import { Context, Effect, Layer, Option, Scope, Semaphore } from 'effect';
import type * as MediabunnyModule from 'mediabunny';
import type { Input, VideoSample, VideoSampleSink } from 'mediabunny';
import type { FootageFrames, FootageRead } from '../canvas/film.ts';
import { Footage, FootageFrameMissing } from './footage.ts';

type Samples = ReturnType<VideoSampleSink['samplesAtTimestamps']>;

const KEPT = 8;

const AT_ONCE = 4;

type Mediabunny = Pick<
  typeof MediabunnyModule,
  'Input' | 'UrlSource' | 'ALL_FORMATS' | 'VideoSampleSink'
>;

const loadMediabunny = (): Promise<Mediabunny> => import('mediabunny');

export class FootageDecoders extends Context.Service<
  FootageDecoders,
  { readonly load: () => Promise<Mediabunny> }
>()('@manna/film/browser/FootageDecoders') {
  static readonly layer = Layer.succeed(
    FootageDecoders,
    FootageDecoders.of({ load: loadMediabunny }),
  );
}

const RUN_ENDED = 'its run had ended';

const keyOf = (read: FootageRead) => `${read.source}@${read.at}`;

const ask = <A>(promise: () => Promise<A>): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: promise, catch: String });

const present = <A>(found: Effect.Effect<A, string>, why: string) =>
  Effect.flatMap(found, (value) => Effect.fromOption(Option.fromNullishOr(value), () => why));

const sampleIn = (got: Awaited<ReturnType<Samples['next']>>): Option.Option<VideoSample> => {
  if (got.done === true) return Option.none();
  return Option.fromNullishOr(got.value);
};

const missing = (read: FootageRead) => (why: string) =>
  new FootageFrameMissing({ source: read.source, at: read.at, why });

const copied = (sample: VideoSample): Effect.Effect<HTMLCanvasElement> =>
  Effect.sync(() => {
    const canvas = document.createElement('canvas');
    canvas.width = sample.displayWidth;
    canvas.height = sample.displayHeight;
    return canvas;
  }).pipe(
    Effect.flatMap((canvas) =>
      Option.match(Option.fromNullishOr(canvas.getContext('2d')), {
        onNone: () => Effect.die('2d context unavailable'),
        onSome: (ctx) =>
          Effect.sync(() => {
            sample.draw(ctx, 0, 0);
            return canvas;
          }),
      }),
    ),
    Effect.ensuring(Effect.sync(() => sample.close())),
  );

export const footageLayer = (
  urlOf: (source: string) => string,
): Layer.Layer<Footage, never, FootageDecoders> =>
  Layer.effect(
    Footage,
    Effect.gen(function* () {
      const { load } = yield* FootageDecoders;
      const library = yield* Effect.cached(ask(load));
      const inputs: Array<Input> = [];
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => inputs.forEach((input) => input.dispose())),
      );
      const sinks = new Map<string, VideoSampleSink>();
      const opening = yield* Semaphore.make(1);
      const sinkOf = (source: string): Effect.Effect<VideoSampleSink, string> =>
        opening.withPermits(1)(
          Option.match(Option.fromUndefinedOr(sinks.get(source)), {
            onSome: (sink) => Effect.succeed(sink),
            onNone: () =>
              Effect.gen(function* () {
                const mb = yield* library;
                const input = new mb.Input({
                  source: new mb.UrlSource(urlOf(source)),
                  formats: mb.ALL_FORMATS,
                });
                inputs.push(input);
                const track = yield* present(
                  ask(() => input.getPrimaryVideoTrack()),
                  'it has no picture',
                );
                const sink = new mb.VideoSampleSink(track);
                sinks.set(source, sink);
                return sink;
              }),
          }),
        );

      const kept = new Map<string, HTMLCanvasElement>();
      const keep = (key: string, canvas: HTMLCanvasElement) => {
        kept.delete(key);
        kept.set(key, canvas);
        for (const old of kept.keys()) {
          if (kept.size <= KEPT) break;
          kept.delete(old);
        }
      };
      const decodeOne = (
        read: FootageRead,
      ): Effect.Effect<readonly [string, HTMLCanvasElement], FootageFrameMissing> =>
        Option.match(Option.fromUndefinedOr(kept.get(keyOf(read))), {
          onSome: (canvas) => Effect.succeed([keyOf(read), canvas] as const),
          onNone: () =>
            Effect.gen(function* () {
              const sink = yield* sinkOf(read.source);
              const sample = yield* present(
                ask(() => sink.getSample(read.at)),
                'it starts after that time',
              );
              const canvas = yield* copied(sample);
              keep(keyOf(read), canvas);
              return [keyOf(read), canvas] as const;
            }).pipe(Effect.mapError(missing(read))),
        });

      const runOf = (frames: ReadonlyArray<ReadonlyArray<FootageRead>>) =>
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          const times = new Map<string, Array<number>>();
          for (const read of frames.flat())
            times.set(read.source, [
              ...Option.getOrElse(Option.fromUndefinedOr(times.get(read.source)), () => []),
              read.at,
            ]);
          let ended = false;
          const iterators = new Map<string, Samples>();
          const iteratorOf = (source: string): Effect.Effect<Samples, string> =>
            Option.match(Option.fromUndefinedOr(iterators.get(source)), {
              onSome: (it) => Effect.succeed(it),
              onNone: () =>
                Effect.flatMap(sinkOf(source), (sink) =>
                  Effect.suspend(() => {
                    if (ended) return Effect.fail(RUN_ENDED);
                    const it = sink.samplesAtTimestamps(
                      Option.getOrElse(Option.fromUndefinedOr(times.get(source)), () => []),
                    );
                    iterators.set(source, it);
                    return Effect.succeed(it);
                  }),
                ),
            });
          let held: Array<VideoFrame> = [];
          const letGo = Effect.sync(() => {
            held.forEach((frame) => frame.close());
            held = [];
          });
          yield* Scope.addFinalizer(
            scope,
            Effect.andThen(
              Effect.andThen(
                Effect.sync(() => {
                  ended = true;
                }),
                letGo,
              ),
              Effect.suspend(() =>
                Effect.forEach(
                  [...iterators.values()],
                  (it) => Effect.ignore(ask(() => it.return())),
                  { concurrency: AT_ONCE, discard: true },
                ),
              ),
            ),
          );
          const frameOf = (read: FootageRead) =>
            Effect.gen(function* () {
              const it = yield* iteratorOf(read.source);
              const got = yield* ask(() => it.next());
              const sample = yield* Effect.fromOption(sampleIn(got), () => 'no frame at that time');
              if (ended) {
                sample.close();
                return yield* Effect.fail(RUN_ENDED);
              }
              const frame = sample.toVideoFrame();
              sample.close();
              held.push(frame);
              return [keyOf(read), frame] as const;
            }).pipe(Effect.mapError(missing(read)));
          let k = 0;
          const next = Effect.suspend(() => {
            const reads = Option.getOrElse(Option.fromUndefinedOr(frames[k]), () => []);
            k += 1;
            return Effect.andThen(
              letGo,
              Effect.map(Effect.forEach(reads, frameOf), (decoded): FootageFrames => {
                const byKey = new Map<string, CanvasImageSource>(decoded);
                return { frame: (read) => byKey.get(keyOf(read)) };
              }),
            );
          });
          return { next };
        });

      return Footage.of({
        ready: (reads) =>
          Effect.map(
            Effect.forEach(reads, decodeOne, { concurrency: AT_ONCE }),
            (decoded): FootageFrames => {
              const byKey = new Map<string, CanvasImageSource>(decoded);
              return { frame: (read) => byKey.get(keyOf(read)) };
            },
          ),
        run: runOf,
      });
    }),
  );
