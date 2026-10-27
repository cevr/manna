/** Recording selection below the score clock: every hand-over gets the same fallback policy. */
import { Clock, Effect, Layer, Option } from 'effect';

import { audioUrl } from '~/remote';

import {
  Playback,
  PlaybackError,
  type PlaybackApi,
  type Intent,
  type RecordingSelection,
  type Status,
} from './player';

export const recordingsOver = (device: PlaybackApi): PlaybackApi => {
  let turn = 0;
  let wants: Intent = 'play';
  let selection = Option.none<RecordingSelection>();
  let preparing = Option.none<number>();
  const selected = (status: Status): Status =>
    Option.match(selection, {
      onNone: () => status,
      onSome: (recording) => ({ ...status, recording }),
    });
  return {
    ...device,
    play: (uri, fromMs, options) =>
      Effect.gen(function* () {
        const owner = ++turn;
        preparing = Option.liftPredicate(
          fromMs,
          () => options?.ready === true || options?.continuous === true,
        );
        const identity = options?.recording;
        wants = options?.intent ?? 'play';
        selection = Option.map(Option.fromNullishOr(identity), (identity) => ({
          number: identity.number,
          requested: identity.offset,
          effective: identity.offset,
        }));
        const began = yield* Clock.currentTimeMillis;
        const attempt = (source: string, at: number) =>
          device
            .play(source, at, {
              ...options,
              continuous: options?.continuous ?? false,
              ready: options?.ready ?? false,
              intent: wants,
            })
            .pipe(
              Effect.filterOrFail(
                (status) => status.state !== 'failed',
                (status) =>
                  PlaybackError.make({
                    operation: 'play',
                    message: 'recording unavailable',
                    positionMs: status.replacementMs,
                  }),
              ),
            );
        return yield* attempt(uri, fromMs).pipe(
          Effect.catchTag('PlaybackError', (error) =>
            Effect.gen(function* () {
              if (
                owner !== turn ||
                !identity ||
                identity.offset === 0 ||
                error.operation === 'superseded'
              )
                return yield* error;
              selection = Option.some({
                number: identity.number,
                requested: identity.offset,
                effective: 0,
              });
              yield* Effect.logWarning('player.key.fallback').pipe(
                Effect.annotateLogs({
                  hymn: identity.number,
                  requested: identity.offset,
                  effective: 0,
                }),
              );
              let advanced = 0;
              if (options?.continuous && wants === 'play')
                advanced = (yield* Clock.currentTimeMillis) - began;
              return yield* attempt(
                audioUrl(identity.number),
                error.positionMs ?? fromMs + advanced,
              );
            }),
          ),
          Effect.map((status) => {
            if (owner !== turn) return status;
            return selected(status);
          }),
          Effect.ensuring(
            Effect.sync(() => {
              if (owner === turn) preparing = Option.none();
            }),
          ),
        );
      }),
    // A failure status may precede play's rejection. Keep the reader
    // observing until this owner and its one fallback have answered.
    status: Effect.map(device.status, (status) =>
      selected(
        Option.match(preparing, {
          onNone: () => status,
          onSome: (fromMs): Status => ({
            ...status,
            state: 'loading',
            positionMs: status.replacementMs ?? fromMs,
          }),
        }),
      ),
    ),
    pause: Effect.suspend(() => {
      wants = 'pause';
      return Effect.map(device.pause, selected);
    }),
    resume: Effect.suspend(() => {
      wants = 'play';
      return Effect.map(device.resume, selected);
    }),
    seek: (at) => Effect.map(device.seek(at), selected),
    stop: Effect.suspend(() => {
      turn++;
      selection = Option.none();
      preparing = Option.none();
      return device.stop;
    }),
  };
};

export const recordingsOn = (device: Layer.Layer<Playback>): Layer.Layer<Playback> =>
  Layer.effect(Playback)(Effect.map(Playback, recordingsOver)).pipe(Layer.provide(device));
