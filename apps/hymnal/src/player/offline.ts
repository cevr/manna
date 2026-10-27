/** Resolve completed recordings below selection; queue saves above the silent clock. */
import { Effect, Layer, Option } from 'effect';
import { Offline } from '~/offline/cache';
import { Playback, PlaybackError, type PlaybackApi } from './player';

export const localOver = (device: PlaybackApi, cache: typeof Offline.Service): PlaybackApi => {
  let generation = 0;
  return {
    ...device,
    play: (uri, at, options) =>
      Effect.gen(function* () {
        const owner = ++generation;
        const id = options?.recording;
        if (!id) return yield* device.play(uri, at, options);
        const local = yield* cache.local(id);
        if (owner !== generation)
          return yield* PlaybackError.make({
            operation: 'superseded',
            message: 'newer playback owns the session',
          });
        if (Option.isNone(local)) return yield* device.play(uri, at, options);
        return yield* device.play(local.value, at, options).pipe(
          Effect.filterOrFail(
            (s) => s.state !== 'failed',
            () =>
              PlaybackError.make({
                operation: 'local-read',
                message: 'saved recording could not be read',
              }),
          ),
          Effect.catchTag('PlaybackError', (error) =>
            Effect.gen(function* () {
              if (owner !== generation || error.operation === 'superseded') return yield* error;
              if (error.operation !== 'play' && error.operation !== 'local-read')
                return yield* error;
              yield* cache
                .invalidate(id)
                .pipe(
                  Effect.catch((error) =>
                    Effect.logWarning('offline.invalidate.failed').pipe(
                      Effect.annotateLogs({ code: error.code }),
                    ),
                  ),
                );
              // One remote retry only; the existing recording wrapper owns key fallback.
              return yield* device.play(uri, at, options);
            }),
          ),
        );
      }),
    stop: Effect.suspend(() => {
      generation++;
      return device.stop;
    }),
  };
};
export const localOn = (device: Layer.Layer<Playback>) =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      return localOver(yield* Playback, yield* Offline);
    }),
  ).pipe(Layer.provide(device));

export const savingOn = (device: Layer.Layer<Playback>) =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      const cache = yield* Offline;
      const playback = yield* Playback;
      const scope = yield* Effect.scope;
      return Playback.of({
        ...playback,
        play: (uri, at, options) =>
          Effect.gen(function* () {
            if (options?.recording)
              yield* cache.enqueue(options.recording).pipe(Effect.forkIn(scope));
            return yield* playback.play(uri, at, options);
          }),
      });
    }),
  ).pipe(Layer.provide(device));
