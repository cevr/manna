import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { registerFlacEncoder } from '@mediabunny/flac-encoder';
import { registerMediabunnyServer } from '@mediabunny/server';
import {
  Array as Arr,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Order,
  Stream,
} from 'effect';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  type EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FilePathSource,
  FilePathTarget,
  FLAC,
  FlacOutputFormat,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
  MP3,
  Mp4OutputFormat,
  NullTarget,
  Output,
  Quality,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WavOutputFormat,
  registerEncoder,
} from 'mediabunny';
import { MPEGDecoder } from 'mpg123-decoder';
import { type Pcm, concat, toInt16 } from '../core/audio.ts';
import type { Raster } from '../core/raster.ts';
import { isAiff, readAiff } from './aiff.ts';
import { writeWhole } from './content-store.ts';
import { MediaFailed } from '../core/refusals.ts';
import { jpegOf } from './jpeg.ts';
import { encodePng } from './png.ts';
import { resample } from './resample.ts';
import { X264Encoder } from './x264.ts';
import {
  type AacTrack,
  type JoinedFilm,
  Media,
  PHONE_ENCODE,
  PHONE_RATE,
  type Segment,
  type Timing,
} from './media.ts';

const phoneRateFor = (seconds: number) =>
  Math.max(1, Math.floor((PHONE_RATE * seconds) / (seconds + PHONE_ENCODE.bufferSeconds)));

const STILL_LIMIT = Duration.minutes(1);
const PHONE_LIMIT = Duration.minutes(30);

const WRITE_BLOCK = 65536;

const AAC_BITRATE = 192_000;
const AAC_FRAME = 1024;
const AAC_PRIMING = 1024;

interface Opened {
  readonly file: string;
  readonly bytes: Uint8Array;
  readonly input: Input;
  readonly codec: 'mp3' | 'flac' | 'aiff' | 'other';
}

const attempt = <A>(op: MediaFailed['op'], file: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => MediaFailed.make({ op, file, reason: String(cause) }),
  });

const attemptSync = <A>(op: MediaFailed['op'], file: string, run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) => MediaFailed.make({ op, file, reason: String(cause) }),
  });

const audioTrack = (opened: Opened) =>
  Effect.flatMap(
    attempt('decode', opened.file, () => opened.input.getPrimaryAudioTrack()),
    (track) =>
      Effect.fromOption(Option.fromNullishOr(track), () =>
        MediaFailed.make({ op: 'decode', file: opened.file, reason: 'no audio track' }),
      ),
  );

const decodeMp3 = (opened: Opened, track: InputAudioTrack) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new MPEGDecoder()),
    (decoder) =>
      Effect.gen(function* () {
        yield* attempt('decode', opened.file, () => decoder.ready);
        const out = yield* attemptSync('decode', opened.file, () => decoder.decode(opened.bytes));
        const broken = Arr.head(out.errors);
        if (Option.isSome(broken))
          return yield* MediaFailed.make({
            op: 'decode',
            file: opened.file,
            reason: broken.value.message,
          });
        const pcm: Pcm = {
          rate: out.sampleRate,
          frames: out.samplesDecoded,
          channels: out.channelData
            .slice(0, track.numberOfChannels)
            .map((channel) => channel.subarray(0, out.samplesDecoded)),
        };
        return pcm;
      }),
    (decoder) => Effect.sync(() => decoder.free()),
  );

const planar = (file: string, track: InputAudioTrack, sample: AudioSample) =>
  attemptSync('decode', file, (): Pcm => {
    const early = Math.round(-sample.timestamp * sample.sampleRate);
    const skip = Math.min(sample.numberOfFrames, Math.max(0, early));
    return {
      rate: sample.sampleRate,
      frames: sample.numberOfFrames - skip,
      channels: Array.from({ length: track.numberOfChannels }, (_, planeIndex) => {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
        return plane.subarray(skip);
      }),
    };
  }).pipe(Effect.ensuring(Effect.sync(() => sample.close())));

const decodeSamples = (opened: Opened, track: InputAudioTrack) =>
  Stream.fromAsyncIterable(new AudioSampleSink(track).samples(), (cause) =>
    MediaFailed.make({ op: 'decode', file: opened.file, reason: String(cause) }),
  ).pipe(
    Stream.mapEffect((sample) => planar(opened.file, track, sample)),
    Stream.runFold(
      (): Array<Pcm> => [],
      (blocks, block) => {
        blocks.push(block);
        return blocks;
      },
    ),
    Effect.map((blocks) => concat(track.sampleRate, track.numberOfChannels, blocks)),
  );

const decodeOpened = (opened: Opened) =>
  Effect.gen(function* () {
    if (opened.codec === 'aiff')
      return yield* Effect.mapError(Effect.fromResult(readAiff(opened.bytes)), (reason) =>
        MediaFailed.make({ op: 'decode', file: opened.file, reason }),
      );
    const track = yield* audioTrack(opened);
    if (opened.codec === 'mp3') return yield* decodeMp3(opened, track);
    return yield* decodeSamples(opened, track);
  });

const block = (pcm: Pcm, from: number, frames: number, at: number) => {
  const data = new Float32Array(frames * pcm.channels.length);
  for (const [c, plane] of pcm.channels.entries())
    data.set(plane.subarray(from, from + frames), c * frames);
  return new AudioSample({
    data,
    format: 'f32-planar',
    numberOfChannels: pcm.channels.length,
    sampleRate: pcm.rate,
    timestamp: at,
  });
};

const hex = (description: AllowSharedBufferSource) => {
  if (ArrayBuffer.isView(description))
    return new Uint8Array(
      description.buffer,
      description.byteOffset,
      description.byteLength,
    ).toHex();
  return new Uint8Array(description).toHex();
};

const configKey = (config: VideoDecoderConfig) =>
  [
    config.codec,
    `${config.codedWidth}x${config.codedHeight}`,
    Option.match(Option.fromNullishOr(config.description), { onNone: () => '', onSome: hex }),
  ].join(' ');

const present = <A>(op: MediaFailed['op'], file: string, what: string, value: A) =>
  Effect.fromOption(Option.fromNullishOr(value), () =>
    MediaFailed.make({ op, file, reason: `no ${what}` }),
  );

const joinInto = (fs: FileSystem.FileSystem, film: JoinedFilm) =>
  Effect.gen(function* () {
    const { out } = film;
    const target = new FilePathTarget(out);
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'reserve' }), target });
    const video = new EncodedVideoPacketSource('avc');
    output.addVideoTrack(video, { maximumPacketCount: film.frames });
    const audio = Option.map(film.audio, (aac) => {
      const source = new EncodedAudioPacketSource('aac');
      output.addAudioTrack(source, { maximumPacketCount: aac.packets.length });
      return { aac, source, written: 0 };
    });

    const soundTo = (until: number) =>
      Option.match(audio, {
        onNone: () => Effect.void,
        onSome: (track) =>
          Effect.gen(function* () {
            const { packets, meta } = track.aac;
            const due = () =>
              Option.filter(Arr.get(packets, track.written), (packet) => packet.timestamp < until);
            for (let next = due(); Option.isSome(next); next = due()) {
              const packet = next.value;
              const first = Option.liftPredicate(meta, () => track.written === 0);
              yield* attempt('write', out, () =>
                track.source.add(packet, Option.getOrUndefined(first)),
              );
              track.written += 1;
            }
          }),
      });

    const copy = (segment: Segment, first: Option.Option<string>) =>
      Effect.scoped(
        Effect.gen(function* () {
          const bytes = yield* fs
            .readFile(segment.file)
            .pipe(
              Effect.mapError((error) =>
                MediaFailed.make({ op: 'read', file: segment.file, reason: error.message }),
              ),
            );
          const input = yield* Effect.acquireRelease(
            Effect.sync(() => new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })),
            (opened) => Effect.sync(() => opened.dispose()),
          );
          const track = yield* present(
            'join',
            segment.file,
            'video track',
            yield* attempt('join', segment.file, () => input.getPrimaryVideoTrack()),
          );
          const config = yield* present(
            'join',
            segment.file,
            'decoder config',
            yield* attempt('join', segment.file, () => track.getDecoderConfig()),
          );
          const key = configKey(config);
          if (Option.isSome(first) && first.value !== key)
            return yield* MediaFailed.make({
              op: 'join',
              file: segment.file,
              reason: `encoded unlike the first segment (${key} vs ${first.value})`,
            });
          let meta = Option.filter(Option.some({ decoderConfig: config }), () =>
            Option.isNone(first),
          );
          const packets = Stream.fromAsyncIterable(
            new EncodedPacketSink(track).packets(),
            (cause) => MediaFailed.make({ op: 'join', file: segment.file, reason: String(cause) }),
          );
          yield* Stream.runForEach(packets, (packet) =>
            Effect.gen(function* () {
              const moved = packet.clone({ timestamp: packet.timestamp + segment.at });
              yield* soundTo(moved.timestamp);
              yield* attempt('write', out, () => video.add(moved, Option.getOrUndefined(meta)));
              meta = Option.none();
            }),
          );
          return key;
        }),
      );

    yield* Effect.gen(function* () {
      yield* attempt('write', out, () => output.start());
      let first = Option.none<string>();
      for (const segment of film.segments) {
        first = Option.some(yield* copy(segment, first));
      }
      yield* soundTo(Infinity);
      yield* attempt('write', out, () => output.finalize());
    }).pipe(Effect.onError(() => Effect.ignore(attempt('write', out, () => output.cancel()))));
  });

const TRACK = 'the track';
const TAKE = 'take.flac';

const encodeTrack = (pcm: Pcm) =>
  Effect.gen(function* () {
    const packets: Array<EncodedPacket> = [];
    const metas: Array<EncodedAudioChunkMetadata> = [];
    const output = new Output({ format: new Mp4OutputFormat(), target: new NullTarget() });
    const source = new AudioSampleSource({
      codec: 'aac',
      bitrate: AAC_BITRATE,
      onEncodedPacket: (packet, meta) => {
        packets.push(packet);
        metas.push(...Option.toArray(Option.fromNullishOr(meta)));
      },
    });
    output.addAudioTrack(source, {
      maximumPacketCount: Math.ceil((pcm.frames + AAC_PRIMING) / AAC_FRAME) + 1,
    });
    yield* Effect.gen(function* () {
      yield* attempt('encode', TRACK, () => output.start());
      for (let written = 0; written < pcm.frames; written += WRITE_BLOCK) {
        const frames = Math.min(WRITE_BLOCK, pcm.frames - written);
        const at = (written - AAC_PRIMING) / pcm.rate;
        yield* Effect.acquireUseRelease(
          attemptSync('encode', TRACK, () => block(pcm, written, frames, at)),
          (sample) => attempt('encode', TRACK, () => source.add(sample)),
          (sample) => Effect.sync(() => sample.close()),
        );
      }
      yield* attempt('encode', TRACK, () => output.finalize());
    }).pipe(Effect.onError(() => Effect.ignore(attempt('encode', TRACK, () => output.cancel()))));
    const meta = yield* Effect.fromOption(Arr.head(metas), () =>
      MediaFailed.make({ op: 'encode', file: TRACK, reason: 'no decoder config' }),
    );
    const track: AacTrack = { packets, meta };
    return track;
  });

const within = <A>(
  op: MediaFailed['op'],
  file: string,
  limit: Duration.Duration,
  effect: Effect.Effect<A, MediaFailed>,
) =>
  Effect.timeoutOrElse(effect, {
    duration: limit,
    orElse: () =>
      Effect.fail(MediaFailed.make({ op, file, reason: `took over ${Duration.format(limit)}` })),
  });

const openInPlace = (file: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new Input({ source: new FilePathSource(file), formats: ALL_FORMATS })),
    (opened) => Effect.sync(() => opened.dispose()),
  );

const videoTrackOf = (op: MediaFailed['op'], file: string, input: Input) =>
  Effect.flatMap(
    attempt(op, file, () => input.getPrimaryVideoTrack()),
    (track) => present(op, file, 'video track', track),
  );

const RATE_PACKETS = 120;

const gcd = (a: number, b: number): number => {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y > 0) [x, y] = [y, x % y];
  return x;
};

const rateOfTicks = (ticks: ReadonlyArray<number>, resolution: number): Option.Option<number> =>
  Option.map(
    Option.filter(Arr.last(ticks), (span) => ticks.length > 1 && span > 0),
    (span) => {
      const step = Arr.reduce(ticks, 0, gcd);
      const measured = ((ticks.length - 1) * resolution) / span;
      const spreadOf = (num: number, den: number) => {
        const period = resolution * den;
        const lines = ticks.map((at) => Math.round((at * num) / period));
        const offsets = Arr.zipWith(ticks, lines, (at, line) => at * num - line * period);
        const adjacent = Arr.zip(lines, Arr.drop(lines, 1)).some(([from, to]) => to - from === 1);
        return {
          spread: Match.value(adjacent).pipe(
            Match.when(true, () => Math.max(...offsets) - Math.min(...offsets)),
            Match.orElse(() => Infinity),
          ),
          step: step * num,
          tells: step * num * 2 < period,
        };
      };
      const whole = Math.round(measured);
      const ntsc = Math.round((measured * 1001) / 1000);
      const spreads = Arr.filter(
        [
          { rate: whole, ...spreadOf(whole, 1) },
          { rate: (ntsc * 1000) / 1001, ...spreadOf(ntsc * 1000, 1001) },
        ],
        (each) => each.rate > 0,
      );
      const only = (holds: (each: { spread: number; step: number }) => boolean) => {
        const fitting = Arr.filter(spreads, holds);
        return Option.map(
          Option.filter(Arr.head(fitting), () => fitting.length === 1),
          (each) => each.rate,
        );
      };
      const strictly = Arr.filter(spreads, (each) => each.spread < each.step);
      return Option.getOrElse(
        Option.flatMap(
          Option.filter(Option.some(spreads), (each) => each.every((one) => one.tells)),
          () =>
            Match.value(strictly.length).pipe(
              Match.when(0, () => only((each) => each.spread <= each.step)),
              Match.orElse(() => only((each) => each.spread < each.step)),
            ),
        ),
        () => measured,
      );
    },
  );

const firstFrameTimes = (file: string, track: InputVideoTrack) => {
  const unbounded = Option.getOrUndefined(Option.none<EncodedPacket>());
  return Stream.fromAsyncIterable(
    new EncodedPacketSink(track).packets(unbounded, unbounded, { metadataOnly: true }),
    (cause) => MediaFailed.make({ op: 'read', file, reason: String(cause) }),
  ).pipe(
    Stream.mapAccum(
      () => ({ count: 0, latest: -Infinity }),
      (seen, packet) =>
        [
          { count: seen.count + 1, latest: Math.max(seen.latest, packet.timestamp) },
          [
            {
              at: packet.timestamp,
              past: seen.count >= RATE_PACKETS && packet.timestamp >= seen.latest,
            },
          ],
        ] as const,
    ),
    Stream.takeWhile((frame) => !frame.past),
    Stream.map((frame) => frame.at),
    Stream.runCollect,
    Effect.map((times) => Arr.sort(times, Order.Number)),
  );
};

const frameRateIn = (file: string, input: Input): Effect.Effect<Option.Option<number>> =>
  Effect.gen(function* () {
    const track = yield* videoTrackOf('read', file, input);
    const resolution = yield* attempt('read', file, () => track.getTimeResolution());
    const times = yield* firstFrameTimes(file, track);
    const ticks = times.map((at) => Math.round(at * resolution));
    const first = Option.getOrElse(Arr.head(ticks), () => 0);
    return rateOfTicks(
      ticks.map((at) => at - first),
      resolution,
    );
  }).pipe(Effect.orElseSucceed(() => Option.none<number>()));

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

const evenDown = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

const reencode = (
  video: string,
  out: string,
  qualityFor: (seconds: number) => Quality,
  size: (width: number, height: number) => Option.Option<{ width: number; height: number }>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const input = yield* openInPlace(video);
      const track = yield* videoTrackOf('encode', video, input);
      const quality = qualityFor(yield* attempt('encode', video, () => input.computeDuration()));
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new FilePathTarget(out),
      });
      const sized = Option.match(size(track.displayWidth, track.displayHeight), {
        onNone: () => ({}),
        onSome: (to) => ({ ...to, fit: 'fill' as const }),
      });
      const conversion = yield* attempt('encode', video, () =>
        Conversion.init({
          input,
          output,
          tracks: 'primary',
          video: { ...sized, codec: 'avc', quality, forceTranscode: true },
          showWarnings: false,
        }),
      );
      if (!conversion.isValid)
        return yield* MediaFailed.make({
          op: 'encode',
          file: video,
          reason: conversion.discardedTracks.map((d) => d.reason).join(', '),
        });
      yield* Effect.tryPromise({
        try: (signal) => {
          signal.addEventListener('abort', () => void conversion.cancel());
          return conversion.execute();
        },
        catch: (cause) => MediaFailed.make({ op: 'encode', file: video, reason: String(cause) }),
      });
    }),
  );

const frameJpeg = (video: string, at: number, width: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const input = yield* openInPlace(video);
      const track = yield* videoTrackOf('decode', video, input);
      const sample = yield* Effect.acquireRelease(
        Effect.flatMap(
          attempt('decode', video, () => new VideoSampleSink(track).getSample(Math.max(0, at))),
          (found) => present('decode', video, `frame at ${at.toFixed(3)} s`, found),
        ),
        (found) => Effect.sync(() => found.close()),
      );
      return yield* jpegOf(video, sample, even(width));
    }),
  );

interface I420 {
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

const i420Of = (image: Raster): I420 => {
  const width = evenDown(image.width);
  const height = evenDown(image.height);
  const luma = width * height;
  const bytes = new Uint8Array(luma * 1.5);
  const at = (x: number, y: number, k: number) => image.rgba[(y * image.width + x) * 4 + k] ?? 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      bytes[y * width + x] = Math.round(
        16 + (65.481 * at(x, y, 0) + 128.553 * at(x, y, 1) + 24.966 * at(x, y, 2)) / 255,
      );
  const half = width / 2;
  for (let y = 0; y < height / 2; y++)
    for (let x = 0; x < half; x++) {
      const mean = (k: number) =>
        (at(2 * x, 2 * y, k) +
          at(2 * x + 1, 2 * y, k) +
          at(2 * x, 2 * y + 1, k) +
          at(2 * x + 1, 2 * y + 1, k)) /
        4;
      const [r, g, b] = [mean(0), mean(1), mean(2)];
      bytes[luma + y * half + x] = Math.round(128 + (-37.797 * r - 74.203 * g + 112 * b) / 255);
      bytes[luma * 1.25 + y * half + x] = Math.round(
        128 + (112 * r - 93.786 * g - 18.214 * b) / 255,
      );
    }
  return { width, height, bytes };
};

const CARD_FPS = 1;

const cardFile = (file: string, image: Raster, track: AacTrack, seconds: number) =>
  Effect.gen(function* () {
    const picture = i420Of(image);
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const video = new VideoSampleSource({
      codec: 'avc',
      bitrate: phoneRateFor(seconds),
      keyFrameInterval: PHONE_ENCODE.keyEvery,
    });
    output.addVideoTrack(video);
    const audio = new EncodedAudioPacketSource('aac');
    output.addAudioTrack(audio);
    const heldFor = (n: number) => {
      const left = seconds - n / CARD_FPS;
      if (left > 0 && left < 1 / CARD_FPS) return left;
      return 1 / CARD_FPS;
    };
    const frame = (n: number) =>
      Effect.acquireUseRelease(
        attemptSync(
          'encode',
          file,
          () =>
            new VideoSample(picture.bytes, {
              format: 'I420',
              codedWidth: picture.width,
              codedHeight: picture.height,
              timestamp: n / CARD_FPS,
              duration: heldFor(n),
            }),
        ),
        (sample) => attempt('encode', file, () => video.add(sample)),
        (sample) => Effect.sync(() => sample.close()),
      );
    yield* Effect.gen(function* () {
      yield* attempt('write', file, () => output.start());
      for (const [k, packet] of track.packets.entries())
        yield* attempt('write', file, () =>
          audio.add(packet, Option.getOrUndefined(Option.liftPredicate(track.meta, () => k === 0))),
        );
      for (const n of Arr.range(0, Math.max(1, Math.ceil(seconds * CARD_FPS)) - 1)) yield* frame(n);
      yield* attempt('write', file, () => output.finalize());
    }).pipe(Effect.onError(() => Effect.ignore(attempt('write', file, () => output.cancel()))));
    return yield* Effect.fromOption(Option.fromNullishOr(target.buffer), () =>
      MediaFailed.make({ op: 'write', file, reason: 'nothing was written' }),
    );
  });

const aacFile = (file: string, track: AacTrack) =>
  Effect.gen(function* () {
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const source = new EncodedAudioPacketSource('aac');
    output.addAudioTrack(source);
    yield* Effect.gen(function* () {
      yield* attempt('write', file, () => output.start());
      for (const [k, packet] of track.packets.entries())
        yield* attempt('write', file, () =>
          source.add(
            packet,
            Option.getOrUndefined(Option.liftPredicate(track.meta, () => k === 0)),
          ),
        );
      yield* attempt('write', file, () => output.finalize());
    }).pipe(Effect.onError(() => Effect.ignore(attempt('write', file, () => output.cancel()))));
    return yield* Effect.fromOption(Option.fromNullishOr(target.buffer), () =>
      MediaFailed.make({ op: 'write', file, reason: 'nothing was written' }),
    );
  });

export const layer = Layer.effect(
  Media,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* Effect.sync(() => {
      registerAacEncoder();
      registerFlacEncoder();
      registerEncoder(X264Encoder);
      // oxlint-disable-next-line effect/noNullish -- @mediabunny/server's own "no GPU"
      registerMediabunnyServer({ hardwareContext: null });
    });

    const open = (file: string) =>
      Effect.gen(function* () {
        const bytes = yield* fs
          .readFile(file)
          .pipe(
            Effect.mapError((error) =>
              MediaFailed.make({ op: 'read', file, reason: error.message }),
            ),
          );
        const input = yield* Effect.acquireRelease(
          Effect.sync(() => new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })),
          (opened) => Effect.sync(() => opened.dispose()),
        );
        if (isAiff(bytes)) {
          const aiff: Opened = { file, bytes, input, codec: 'aiff' };
          return aiff;
        }
        const format = yield* attempt('read', file, () => input.getFormat());
        const codec = Match.value(format).pipe(
          Match.when(
            (f) => f === MP3,
            (): Opened['codec'] => 'mp3',
          ),
          Match.when(
            (f) => f === FLAC,
            (): Opened['codec'] => 'flac',
          ),
          Match.orElse((): Opened['codec'] => 'other'),
        );
        const opened: Opened = { file, bytes, input, codec };
        return opened;
      });

    const indexedTiming = (file: string) =>
      Effect.scoped(
        Effect.gen(function* () {
          const input = yield* Effect.acquireRelease(
            Effect.sync(
              () => new Input({ source: new FilePathSource(file), formats: ALL_FORMATS }),
            ),
            (opened) => Effect.sync(() => opened.dispose()),
          );
          const format = yield* Effect.option(attempt('read', file, () => input.getFormat()));
          if (Option.isNone(format) || format.value === MP3 || format.value === FLAC)
            return Option.none<Timing>();
          const seconds = yield* attempt('read', file, () => input.computeDuration());
          const timing: Timing = { seconds, fps: yield* frameRateIn(file, input) };
          return Option.some(timing);
        }),
      );

    const timing = Effect.fn('Media.timing')(function* (file: string) {
      const indexed = yield* indexedTiming(file);
      if (Option.isSome(indexed)) return indexed.value;
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const opened = yield* open(file);
          if (opened.codec === 'other') {
            const seconds = yield* attempt('read', file, () => opened.input.computeDuration());
            const read: Timing = { seconds, fps: yield* frameRateIn(file, opened.input) };
            return read;
          }
          const pcm = yield* decodeOpened(opened);
          const decoded: Timing = { seconds: pcm.frames / pcm.rate, fps: Option.none() };
          return decoded;
        }),
      );
    });

    const decode = Effect.fn('Media.decode')(function* (file: string) {
      return yield* Effect.scoped(Effect.flatMap(open(file), decodeOpened));
    });

    const writeWav = Effect.fn('Media.writeWav')(function* (file: string, pcm: Pcm) {
      const channels = pcm.channels.length;
      const samples = toInt16(pcm);
      const target = new BufferTarget();
      const output = new Output({ format: new WavOutputFormat(), target });
      const source = new AudioSampleSource({ codec: 'pcm-s16' });
      output.addAudioTrack(source);
      const block = (at: number) =>
        Effect.acquireUseRelease(
          attemptSync(
            'write',
            file,
            () =>
              new AudioSample({
                data: samples.subarray(
                  at * channels,
                  Math.min(pcm.frames, at + WRITE_BLOCK) * channels,
                ),
                format: 's16',
                numberOfChannels: channels,
                sampleRate: pcm.rate,
                timestamp: at / pcm.rate,
              }),
          ),
          (sample) => attempt('write', file, () => source.add(sample)),
          (sample) => Effect.sync(() => sample.close()),
        );
      yield* Effect.gen(function* () {
        yield* attempt('write', file, () => output.start());
        for (let at = 0; at < pcm.frames; at += WRITE_BLOCK) yield* block(at);
        yield* attempt('write', file, () => output.finalize());
      }).pipe(Effect.onError(() => Effect.ignore(attempt('write', file, () => output.cancel()))));
      const bytes = yield* Option.match(Option.fromNullishOr(target.buffer), {
        onNone: () =>
          Effect.fail(MediaFailed.make({ op: 'write', file, reason: 'nothing was written' })),
        onSome: (buffer) => Effect.succeed(new Uint8Array(buffer)),
      });
      yield* fs
        .writeFile(file, bytes)
        .pipe(
          Effect.mapError((error) =>
            MediaFailed.make({ op: 'write', file, reason: error.message }),
          ),
        );
    });

    const videoPackets = (file: string) =>
      Effect.scoped(
        Effect.gen(function* () {
          const track = yield* videoTrackOf('join', file, yield* openInPlace(file));
          const stats = yield* attempt('join', file, () => track.computePacketStats());
          return stats.packetCount;
        }),
      );

    const mediaWhole = <E extends { readonly message: string }>(
      file: string,
      write: (partial: string) => Effect.Effect<void, E | MediaFailed>,
    ) =>
      writeWhole(fs, file, write).pipe(
        Effect.mapError((error) =>
          Match.value(error).pipe(
            Match.tag('MediaFailed', (failed) => failed),
            Match.orElse((other) => MediaFailed.make({ op: 'write', file, reason: other.message })),
          ),
        ),
      );

    const join = Effect.fn('Media.join')(function* (film: JoinedFilm) {
      yield* mediaWhole(film.out, (partial) => joinInto(fs, { ...film, out: partial }));
    });

    const remux = Effect.fn('Media.remux')(function* (video: string, audio: AacTrack) {
      const frames = yield* videoPackets(video);
      yield* mediaWhole(video, (partial) =>
        joinInto(fs, {
          out: partial,
          segments: [{ file: video, at: 0 }],
          frames,
          audio: Option.some(audio),
        }),
      );
    });

    const encodeAac = Effect.fn('Media.encodeAac')(function* (pcm: Pcm) {
      return yield* encodeTrack(pcm);
    });

    const writeAac = Effect.fn('Media.writeAac')(function* (file: string, pcm: Pcm) {
      const bytes = yield* aacFile(file, yield* encodeTrack(pcm));
      yield* fs
        .writeFile(file, new Uint8Array(bytes))
        .pipe(
          Effect.mapError((error) =>
            MediaFailed.make({ op: 'write', file, reason: error.message }),
          ),
        );
    });

    const still = Effect.fn('Media.still')(function* (
      video: string,
      at: number,
      width: number,
      out: string,
    ) {
      const bytes = yield* within('decode', video, STILL_LIMIT, frameJpeg(video, at, width));
      yield* fs
        .writeFile(out, bytes)
        .pipe(
          Effect.mapError((error) =>
            MediaFailed.make({ op: 'write', file: out, reason: error.message }),
          ),
        );
    });

    const phoneCopy = Effect.fn('Media.phoneCopy')(function* (video: string, out: string) {
      const { height } = PHONE_ENCODE;
      const phone = reencode(
        video,
        out,
        (seconds) => new Quality({ bitrate: phoneRateFor(seconds) }),
        (w, h) =>
          Option.some(
            Option.match(
              Option.liftPredicate(h, (tall) => tall > height),
              {
                onSome: (tall) => ({ width: even((height * w) / tall), height }),
                onNone: () => ({ width: evenDown(w), height: evenDown(h) }),
              },
            ),
          ),
      );
      yield* within('encode', video, PHONE_LIMIT, phone);
    });

    const writePng = Effect.fn('Media.writePng')(function* (file: string, image: Raster) {
      yield* fs
        .writeFile(file, encodePng(image))
        .pipe(
          Effect.mapError((error) =>
            MediaFailed.make({ op: 'write', file, reason: error.message }),
          ),
        );
    });

    const card = Effect.fn('Media.card')(function* (image: Raster, pcm: Pcm, out: string) {
      const bytes = yield* cardFile(out, image, yield* encodeTrack(pcm), pcm.frames / pcm.rate);
      yield* fs
        .writeFile(out, new Uint8Array(bytes))
        .pipe(
          Effect.mapError((error) =>
            MediaFailed.make({ op: 'write', file: out, reason: error.message }),
          ),
        );
    });

    const load = Effect.fn('Media.load')(function* (file: string, rate: number) {
      const recording = yield* decode(file);
      if (recording.channels.length === 1 && recording.rate === rate) return recording;
      return yield* resample(file, recording, rate, 1);
    });

    const encodeFlac = Effect.fn('Media.encodeFlac')(function* (pcm: Pcm) {
      const target = new BufferTarget();
      const output = new Output({ format: new FlacOutputFormat(), target });
      const source = new AudioSampleSource({ codec: 'flac' });
      output.addAudioTrack(source);
      yield* Effect.gen(function* () {
        yield* attempt('encode', TAKE, () => output.start());
        for (let written = 0; written < pcm.frames; written += WRITE_BLOCK) {
          const frames = Math.min(WRITE_BLOCK, pcm.frames - written);
          yield* Effect.acquireUseRelease(
            attemptSync('encode', TAKE, () => block(pcm, written, frames, written / pcm.rate)),
            (sample) => attempt('encode', TAKE, () => source.add(sample)),
            (sample) => Effect.sync(() => sample.close()),
          );
        }
        yield* attempt('encode', TAKE, () => output.finalize());
      }).pipe(Effect.onError(() => Effect.ignore(attempt('encode', TAKE, () => output.cancel()))));
      return yield* Option.match(Option.fromNullishOr(target.buffer), {
        onNone: () =>
          Effect.fail(
            MediaFailed.make({ op: 'encode', file: TAKE, reason: 'nothing was written' }),
          ),
        onSome: (buffer) => Effect.succeed(new Uint8Array(buffer)),
      });
    });

    return Media.of({
      timing,
      decode,
      writeWav,
      encodeAac,
      writeAac,
      join,
      remux,
      load,
      encodeFlac,
      still,
      phoneCopy,
      card,
      writePng,
    });
  }),
);
