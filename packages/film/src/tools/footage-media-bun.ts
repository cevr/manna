import { Effect, FileSystem, Layer, Option, Path, Stream } from 'effect';
import type { Scope } from 'effect';
import {
  ALL_FORMATS,
  AudioSampleSink,
  FilePathSource,
  FilePathTarget,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  VideoSampleSource,
} from 'mediabunny';
import { type Pcm, toMono } from '../core/audio.ts';
import {
  FOOTAGE_HINTS,
  FOOTAGE_RECIPES,
  type FootageCopy,
  type FootagePicture,
} from '../core/footage.ts';
import { MediaFailed } from '../core/refusals.ts';
import { writeWhole } from './content-store.ts';
import { FootageMedia, type FootageProbed } from './footage-media.ts';
import { Media } from './media.ts';
import { resample } from './resample.ts';

const attempt = <A>(op: MediaFailed['op'], file: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => MediaFailed.make({ op, file, reason: String(cause) }),
  });

const present = <A>(op: MediaFailed['op'], file: string, what: string, value: A) =>
  Effect.fromOption(Option.fromNullishOr(value), () =>
    MediaFailed.make({ op, file, reason: `no ${what}` }),
  );

const opened = (file: string): Effect.Effect<Input, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => new Input({ source: new FilePathSource(file), formats: ALL_FORMATS })),
    (input) => Effect.sync(() => input.dispose()),
  );

const pictureOf = (file: string, input: Input) =>
  Effect.flatMap(
    attempt('read', file, () => input.getPrimaryVideoTrack()),
    (track) => present('read', file, 'picture in it', track),
  );

const soundOf = (file: string, input: Input) =>
  Effect.map(
    attempt('read', file, () => input.getPrimaryAudioTrack()),
    (track) => Option.fromNullishOr(track),
  );

const FAST_START = { mezzanine: false, proxy: 'in-memory' } as const;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

const sizeFor = (picture: FootagePicture, long: Option.Option<number>) =>
  Option.match(
    Option.filter(long, (side) => side < Math.max(picture.width, picture.height)),
    {
      onNone: () => ({ width: even(picture.width), height: even(picture.height) }),
      onSome: (side) => {
        const scale = side / Math.max(picture.width, picture.height);
        return { width: even(picture.width * scale), height: even(picture.height * scale) };
      },
    },
  );

const probePicture = (file: string, track: InputVideoTrack) =>
  Effect.gen(function* () {
    const codec = yield* attempt('read', file, () => track.getCodec());
    const rate = yield* attempt('read', file, () => track.computeFrameRateMetrics());
    const picture: FootagePicture = {
      codec: Option.getOrElse(Option.fromNullishOr(codec), () => 'unknown'),
      width: yield* attempt('read', file, () => track.getDisplayWidth()),
      height: yield* attempt('read', file, () => track.getDisplayHeight()),
      rotation: yield* attempt('read', file, () => track.getRotation()),
      fps: rate.bestGuessFrameRate,
      variable: Option.isNone(Option.fromNullishOr(rate.underlyingFrameRate)),
      start: yield* attempt('read', file, () => track.getFirstTimestamp()),
    };
    return picture;
  });

const probeSound = (file: string, track: InputAudioTrack) =>
  Effect.gen(function* () {
    const codec = yield* attempt('read', file, () => track.getCodec());
    return {
      codec: Option.getOrElse(Option.fromNullishOr(codec), () => 'unknown'),
      rate: yield* attempt('read', file, () => track.getSampleRate()),
      channels: yield* attempt('read', file, () => track.getNumberOfChannels()),
    };
  });

const laid = (
  rate: number,
  blocks: ReadonlyArray<{ readonly at: number; readonly pcm: Pcm }>,
): Pcm => {
  const frames = blocks.reduce((end, block) => Math.max(end, block.at + block.pcm.frames), 0);
  const out = new Float32Array(Math.max(0, frames));
  for (const block of blocks) {
    const skip = Math.max(0, -block.at);
    for (const mono of toMono(block.pcm).channels)
      out.set(mono.subarray(skip), Math.max(0, block.at));
  }
  return { rate, frames: out.length, channels: [out] };
};

export const layer = Layer.effect(
  FootageMedia,
  Effect.gen(function* () {
    yield* Media;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const probe = Effect.fn('FootageMedia.probe')(function* (file: string) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const input = yield* opened(file);
          const format = yield* attempt('read', file, () => input.getFormat());
          const video = yield* pictureOf(file, input);
          const sound = yield* soundOf(file, input);
          const heard = yield* Option.match(sound, {
            onNone: () => Effect.succeed({}),
            onSome: (track) => Effect.map(probeSound(file, track), (found) => ({ sound: found })),
          });
          const probed: FootageProbed = {
            probe: {
              container: format.name,
              duration: yield* attempt('read', file, () => input.computeDuration()),
              picture: yield* probePicture(file, video),
              ...heard,
            },
            hdr: yield* attempt('read', file, () => video.hasHighDynamicRange()),
          };
          return probed;
        }),
      );
    });

    const copyInto = (file: string, picture: FootagePicture, copy: FootageCopy, partial: string) =>
      Effect.scoped(
        Effect.gen(function* () {
          const recipe = FOOTAGE_RECIPES[copy];
          const input = yield* opened(file);
          const video = yield* pictureOf(file, input);
          const output = new Output({
            format: new Mp4OutputFormat({ fastStart: FAST_START[copy] }),
            target: new FilePathTarget(partial),
          });
          const source = new VideoSampleSource({
            codec: 'avc',
            quality: new Quality({ quantizer: recipe.crf }),
            keyFrameInterval: recipe.keyEvery,
            contentHint: FOOTAGE_HINTS[copy],
            transform: {
              ...sizeFor(picture, recipe.longSide),
              fit: 'fill',
              frameRate: recipe.fps,
              force: true,
            },
          });
          output.addVideoTrack(source, { frameRate: recipe.fps });
          yield* Effect.gen(function* () {
            yield* attempt('encode', file, () => output.start());
            yield* Stream.fromAsyncIterable(
              new VideoSampleSink(video).samples(picture.start),
              (cause) => MediaFailed.make({ op: 'decode', file, reason: String(cause) }),
            ).pipe(
              Stream.runForEach((sample) =>
                Effect.ensuring(
                  Effect.suspend(() => {
                    sample.setTimestamp(Math.max(0, sample.timestamp - picture.start));
                    return attempt('encode', file, () => source.add(sample));
                  }),
                  Effect.sync(() => sample.close()),
                ),
              ),
            );
            yield* attempt('encode', file, () => output.finalize());
          }).pipe(
            Effect.onError(() => Effect.ignore(attempt('encode', file, () => output.cancel()))),
          );
        }),
      );

    const copy = Effect.fn('FootageMedia.copy')(function* (
      file: string,
      picture: FootagePicture,
      which: FootageCopy,
      out: string,
    ) {
      yield* fs
        .makeDirectory(path.dirname(out), { recursive: true })
        .pipe(
          Effect.mapError((e) => MediaFailed.make({ op: 'write', file: out, reason: e.message })),
        );
      yield* writeWhole(fs, out, (partial) => copyInto(file, picture, which, partial)).pipe(
        Effect.mapError((error) =>
          Option.match(
            Option.liftPredicate(error, (e) => e._tag === 'MediaFailed'),
            {
              onSome: (failed) => failed,
              onNone: () => MediaFailed.make({ op: 'write', file: out, reason: error.message }),
            },
          ),
        ),
      );
    });

    const voice = Effect.fn('FootageMedia.voice')(function* (
      file: string,
      picture: FootagePicture,
      rate: number,
    ) {
      const blocks = yield* Effect.scoped(
        Effect.gen(function* () {
          const input = yield* opened(file);
          const track = yield* Effect.flatMap(soundOf(file, input), (found) =>
            Effect.fromOption(found, () =>
              MediaFailed.make({ op: 'decode', file, reason: 'no sound in it' }),
            ),
          );
          const own = yield* attempt('decode', file, () => track.getSampleRate());
          return yield* Stream.fromAsyncIterable(new AudioSampleSink(track).samples(), (cause) =>
            MediaFailed.make({ op: 'decode', file, reason: String(cause) }),
          ).pipe(
            Stream.map((sample) => {
              const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
                const plane = new Float32Array(sample.numberOfFrames);
                sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
                return plane;
              });
              const at = Math.round((sample.timestamp - picture.start) * own);
              const block = { at, pcm: { rate: own, frames: sample.numberOfFrames, channels } };
              sample.close();
              return block;
            }),
            Stream.runCollect,
            Effect.map((collected) => laid(own, collected)),
          );
        }),
      );
      if (blocks.rate === rate) return blocks;
      return yield* resample(file, blocks, rate, 1);
    });

    return FootageMedia.of({ probe, copy, voice });
  }),
);
