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
        const status = yield* attempt(uri, fromMs).pipe(
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
        );
        if (owner !== turn) return status;
        return selected(status);
      }),
    status: Effect.map(device.status, selected),
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
      return device.stop;
    }),
  };
};

export const recordingsOn = (device: Layer.Layer<Playback>): Layer.Layer<Playback> =>
  Layer.effect(Playback)(Effect.map(Playback, recordingsOver)).pipe(Layer.provide(device));
