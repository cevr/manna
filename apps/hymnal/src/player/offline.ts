/** Resolve completed recordings below selection; queue saves above the silent clock. */
import { Clock, Effect, Layer, Option } from 'effect';
import { Offline } from '~/offline/cache';
import { clockAt, placeOf, type Clock as Run } from '~/follow/clock';
import { Playback, PlaybackError, type PlaybackApi, type PlayOptions, type Intent } from './player';

export const localOver = (device: PlaybackApi, cache: typeof Offline.Service): PlaybackApi => {
  let generation = 0;
  let wants: Intent = 'play';
  let preparing = Option.none<{ readonly clock: Run; readonly continuous: boolean }>();
  const stale = () =>
    PlaybackError.make({ operation: 'superseded', message: 'newer playback owns the session' });
  const position = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    return Option.map(preparing, (p) => placeOf(p.clock, now));
  });
  const intend = Effect.fn('OfflinePlayback.intent')(function* (intent: Intent) {
    const now = yield* Clock.currentTimeMillis;
    wants = intent;
    preparing = Option.map(preparing, (p) => ({
      ...p,
      clock: clockAt(placeOf(p.clock, now), p.continuous && intent === 'play', now),
    }));
  });
  return {
    ...device,
    play: Effect.fn('OfflinePlayback.play')(function* (
      uri: string,
      at: number,
      options?: PlayOptions,
    ) {
      const owner = ++generation;
      wants = options?.intent ?? 'play';
      preparing = Option.some({
        clock: clockAt(
          at,
          options?.continuous === true && wants === 'play',
          yield* Clock.currentTimeMillis,
        ),
        continuous: options?.continuous === true,
      });
      const attempt = (source: string, from: number) => {
        let selected = options;
        if (options) selected = { ...options, intent: wants };
        return device.play(source, from, selected);
      };
      const work = Effect.gen(function* () {
        const id = options?.recording;
        if (!id) return yield* attempt(uri, at);
        const local = yield* cache.local(id);
        if (owner !== generation) return yield* stale();
        const from = Option.getOrElse(yield* position, () => at);
        if (Option.isNone(local)) return yield* attempt(uri, from);
        return yield* attempt(local.value, from).pipe(
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
              if (owner !== generation) return yield* stale();
              // One remote retry only; the existing recording wrapper owns key fallback.
              return yield* attempt(
                uri,
                error.positionMs ?? Option.getOrElse(yield* position, () => at),
              );
            }),
          ),
        );
      });
      return yield* work.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (owner === generation) preparing = Option.none();
          }),
        ),
      );
    }),
    pause: intend('pause').pipe(Effect.andThen(device.pause)),
    resume: intend('play').pipe(Effect.andThen(device.resume)),
    stop: Effect.suspend(() => {
      generation++;
      wants = 'pause';
      preparing = Option.none();
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
