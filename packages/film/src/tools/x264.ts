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
import { PHONE_ENCODE } from './media.ts';

const MICROS = 1_000_000;

const UNTIMED_FPS = 30;

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

const codecString = (sps: Uint8Array) =>
  `avc1.${Array.from(sps, (b) => b.toString(16).padStart(2, '0')).join('')}`;

const FOOTAGE_X264 = {
  preset: 'medium',
  tune: 'film',
};

const footageParams = (recipe: FootageRecipe, fps: number) =>
  [
    `keyint=${Math.max(1, Math.floor(recipe.keyEvery * fps))}`,
    'colorprim=bt709',
    'transfer=bt709',
    'colormatrix=bt709',
  ].join(':');

const footageCopyOf = (hint: VideoEncoderConfig['contentHint']): Option.Option<FootageCopy> =>
  Arr.findFirst(FOOTAGE_COPIES, (copy) => FOOTAGE_HINTS[copy] === hint);

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
  private encoder = Option.none<NodeAv.Encoder>();
  private readonly frame = new NodeAv.Frame();
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
          () => UNTIMED_FPS,
        );
        const settings = settingsOf(this.config, options, fps);
        return Effect.promise(() =>
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
