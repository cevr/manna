// H.264 in Bun: x264, in-process through NodeAV (the FFmpeg
// @mediabunny/server decodes with), registered as mediabunny's encoder for
// `avc`, so a mediabunny conversion encodes with it. @mediabunny/server's own
// libx264 runs the default preset with no tune and loses the paper's grain
// at any size measured. This one encodes the copies the tools make, told
// apart by what mediabunny hands a registered encoder, its config: a
// footage copy by its content hint (`FOOTAGE_HINTS`, `core/footage.ts`),
// and a film's by the quality a conversion asks for: a quantizer is x264's
// CRF at that value, a bitrate a review's phone copy (`media.ts`
// `PHONE_ENCODE`), at level 4.1 (preset slow's reference frames would
// otherwise raise it to 5.0, which some phones refuse). x264
// places every key frame by its own interval: NodeAV's encoder clears the
// picture type a frame carries, so the key frames a conversion asks for
// never reach it. Packets leave in Annex B, and mediabunny's MP4 muxer
// writes them as AVC.

import { toAvFrame } from '@mediabunny/server';
import { Array as Arr, Effect, Match, Option, Stream } from 'effect';
import { CustomVideoEncoder, EncodedPacket, type VideoCodec, type VideoSample } from 'mediabunny';
import * as NodeAv from 'node-av';
import {
  FOOTAGE_COPIES,
  FOOTAGE_HINTS,
  FOOTAGE_RECIPES,
  type FootageCopy,
  type FootageRecipe,
} from '../core/footage.ts';
import { FILM_FPS } from '../core/time.ts';
import { PHONE_ENCODE } from './media.ts';

/** Microseconds: the time base frames and packets carry. */
const MICROS = 1_000_000;

/** An Annex B stream's first SPS (NAL type 7): its profile, constraints and level bytes. */
const spsBytes = (data: Uint8Array): Option.Option<Uint8Array> =>
  Option.map(
    Arr.findFirst(
      Arr.range(0, Math.max(0, data.length - 8)),
      (i) =>
        data[i] === 0 &&
        data[i + 1] === 0 &&
        data[i + 2] === 1 &&
        ((data[i + 3] ?? 0) & 0x1f) === 7,
    ),
    (i) => data.subarray(i + 4, i + 7),
  );

/** The codec string a decoder is configured with: `avc1.PPCCLL` from the SPS. */
const codecString = (sps: Uint8Array) =>
  `avc1.${Array.from(sps, (b) => b.toString(16).padStart(2, '0')).join('')}`;

/**
 * A footage copy (`core/footage.ts`): x264's CRF at the quantizer it asks,
 * preset medium, tune film, BT.709 colour named in the stream, and its key
 * frames at most its recipe's `keyEvery` apart, by x264's own `keyint`.
 * The key frames mediabunny asks for (`keyFrameInterval`) never reach x264:
 * NodeAV's encoder clears each frame's picture type before it encodes
 * (`prepareFrameForEncoding`), so a copy's key frames are x264's to place.
 */
const FOOTAGE_X264 = {
  preset: 'medium',
  tune: 'film',
};

/**
 * x264's `keyint` and colour for a footage copy at `fps` (a camera's 29.97
 * as it is): a key frame at most `keyEvery` seconds apart, so 29 frames at
 * 29.97 for a second.
 */
const footageParams = (recipe: FootageRecipe, fps: number) =>
  [
    `keyint=${Math.max(1, Math.floor(recipe.keyEvery * fps))}`,
    'colorprim=bt709',
    'transfer=bt709',
    'colormatrix=bt709',
  ].join(':');

/** The footage copy a content hint names (`FOOTAGE_HINTS`), if it names one. */
const footageCopyOf = (hint: VideoEncoderConfig['contentHint']): Option.Option<FootageCopy> =>
  Arr.findFirst(FOOTAGE_COPIES, (copy) => FOOTAGE_HINTS[copy] === hint);

/** x264's context and settings for the copy mediabunny's config asks for (above), at `fps` frames a second. */
const settingsOf = (config: VideoEncoderConfig, options: VideoEncoderEncodeOptions, fps: number) =>
  Option.match(footageCopyOf(config.contentHint), {
    onSome: (copy) => ({
      context: {},
      options: {
        ...FOOTAGE_X264,
        ...Option.match(Option.fromNullishOr(options.avc?.quantizer), {
          onNone: () => ({ crf: FOOTAGE_RECIPES[copy].crf }),
          onSome: (crf) => ({ crf }),
        }),
        'x264-params': footageParams(FOOTAGE_RECIPES[copy], fps),
      },
    }),
    onNone: () => filmSettingsOf(config, options, fps),
  });

/**
 * A film's copy (above), at `fps` frames a second: a quantizer quality is
 * x264's CRF at that value (at level 4.1); a bitrate, the phone copy's.
 */
const filmSettingsOf = (
  config: VideoEncoderConfig,
  options: VideoEncoderEncodeOptions,
  fps: number,
) =>
  Match.value(config.bitrateMode).pipe(
    Match.when('quantizer', () => ({
      context: {},
      options: {
        level: '4.1',
        ...Option.match(Option.fromNullishOr(options.avc?.quantizer), {
          onNone: () => ({}),
          onSome: (crf) => ({ crf }),
        }),
      },
    })),
    Match.orElse(() => ({
      context: {
        threadCount: PHONE_ENCODE.threads,
        // Never a frame past `keyEvery`: at 29.97 frames a second, every 29.
        gopSize: Math.max(1, Math.floor(fps * PHONE_ENCODE.keyEvery)),
        ...Option.match(Option.fromNullishOr(config.bitrate), {
          onNone: () => ({}),
          onSome: (bitrate) => ({
            rcMaxRate: bitrate,
            rcBufferSize: PHONE_ENCODE.bufferSeconds * bitrate,
          }),
        }),
      },
      options: PHONE_ENCODE.x264,
    })),
  );

export class X264Encoder extends CustomVideoEncoder {
  /** Made on the first frame, which carries the quantizer a CRF comes from. */
  private encoder = Option.none<NodeAv.Encoder>();
  private readonly frame = new NodeAv.Frame();
  /** Whether a packet has carried the decoder's codec string yet. */
  private configured = false;

  static override supports(codec: VideoCodec): boolean {
    return codec === 'avc';
  }

  init(): void {
    this.frame.alloc();
  }

  encode(sample: VideoSample, options: VideoEncoderEncodeOptions): Promise<void> {
    const frame = this.frame;
    const filled = Effect.promise(() => {
      frame.unref();
      return toAvFrame(sample, frame);
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          frame.pts = BigInt(sample.microsecondTimestamp);
          frame.duration = BigInt(sample.microsecondDuration);
          frame.timeBase = new NodeAv.Rational(1, MICROS);
        }),
      ),
    );
    return Effect.runPromise(
      this.opened(sample, options).pipe(
        Effect.tap(() => filled),
        Effect.flatMap((encoder) => Effect.promise(() => encoder.encodeAll(frame))),
        Effect.map((packets) => this.emit(packets)),
      ),
    );
  }

  flush(): Promise<void> {
    return Effect.runPromise(
      Option.match(this.encoder, {
        onNone: () => Effect.void,
        onSome: (encoder) =>
          Stream.fromAsyncIterable(encoder.flushPackets(), String).pipe(
            Stream.runCollect,
            Effect.orDie,
            Effect.map((rest) => this.emit(rest)),
          ),
      }),
    );
  }

  close(): void {
    Option.map(this.encoder, (encoder) => encoder.close());
    this.frame.free();
  }

  /**
   * The encoder, made on the first frame with the settings its copy asks
   * (`settingsOf`), at the rate the conversion names, else the video's own:
   * one frame in its first frame's length (a conversion that keeps the
   * video's rate names none), else the films' own.
   */
  private opened(
    first: VideoSample,
    options: VideoEncoderEncodeOptions,
  ): Effect.Effect<NodeAv.Encoder> {
    return Option.match(this.encoder, {
      onSome: Effect.succeed,
      onNone: () => {
        const fps = Option.getOrElse(
          Option.orElse(Option.fromNullishOr(this.config.framerate), () =>
            Option.map(
              Option.liftPredicate(first.microsecondDuration, (length) => length > 0),
              (length) => MICROS / length,
            ),
          ),
          () => FILM_FPS,
        );
        const settings = settingsOf(this.config, options, fps);
        return Effect.promise(() =>
          // The time base comes with each frame (`encode`), in microseconds.
          NodeAv.Encoder.create(NodeAv.FF_ENCODER_LIBX264, {
            context: {
              ...settings.context,
              framerate: new NodeAv.Rational(Math.round(fps * 1000), 1000),
            },
            options: settings.options,
          }),
        ).pipe(Effect.tap((made) => Effect.sync(() => (this.encoder = Option.some(made)))));
      },
    });
  }

  /** Packets to mediabunny, in decode order; the first with an SPS carries the decoder's codec string. */
  private emit(packets: Iterable<NodeAv.Packet>): void {
    for (const packet of packets) {
      Option.map(Option.fromNullishOr(packet.data), (data) =>
        this.send(packet, new Uint8Array(data)),
      );
      packet.free();
    }
  }

  private send(packet: NodeAv.Packet, bytes: Uint8Array): void {
    const encoded = new EncodedPacket(
      bytes,
      Match.value((packet.flags & NodeAv.AV_PKT_FLAG_KEY) !== 0).pipe(
        Match.when(true, () => 'key' as const),
        Match.orElse(() => 'delta' as const),
      ),
      Number(packet.pts) / MICROS,
      Number(packet.duration) / MICROS,
    );
    Option.match(
      Option.filter(spsBytes(bytes), () => !this.configured),
      {
        onNone: () => this.onPacket(encoded),
        onSome: (sps) => {
          this.configured = true;
          this.onPacket(encoded, {
            decoderConfig: {
              codec: codecString(sps),
              codedWidth: this.config.width,
              codedHeight: this.config.height,
            },
          });
        },
      },
    );
  }
}
