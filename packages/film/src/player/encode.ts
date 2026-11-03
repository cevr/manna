import {
  BufferTarget,
  CanvasSource,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  NullTarget,
  Output,
  Quality,
  type VideoEncodingConfig,
  canEncodeVideo,
} from 'mediabunny';
import type { Copies, Encoder, EncoderChoice } from '../core/encoder.ts';
import { secondsAt } from '../core/time.ts';

interface Settings {
  readonly hardwareAcceleration: 'prefer-hardware' | 'prefer-software';
  readonly master: Quality;
  readonly share: Quality | null;
  readonly preroll: number;
}

export const SETTINGS = {
  Hardware: {
    hardwareAcceleration: 'prefer-hardware',
    master: /* @__PURE__ */ new Quality({ quantizer: 16 }),
    share: /* @__PURE__ */ new Quality({ quantizer: 26 }),
    preroll: 0,
  },
  Software: {
    hardwareAcceleration: 'prefer-software',
    master: /* @__PURE__ */ new Quality({ bitrate: 37_000_000, bitrateMode: 'variable' }),
    share: null,
    preroll: 2,
  },
} satisfies Readonly<Record<Encoder['_tag'], Settings>>;

export const chooseEncoder = (
  candidates: ReadonlyArray<Encoder>,
  can: (encoder: Encoder) => Promise<boolean>,
  reason: string,
): Promise<EncoderChoice> =>
  candidates.reduce<Promise<EncoderChoice>>(
    (before, encoder) =>
      before.then((found) =>
        found._tag === 'Missing' ? can(encoder).then((yes) => (yes ? encoder : found)) : found,
      ),
    Promise.resolve({ _tag: 'Missing', reason }),
  );

const KEY_FRAME_EVERY = 2;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

const encodedSize = (width: number, height: number, scale: number) => ({
  width: even(width * scale),
  height: even(height * scale),
});

export const config = (
  width: number,
  height: number,
  scale: number,
  encoder: Encoder,
  quality: Quality,
): VideoEncodingConfig => {
  const base: VideoEncodingConfig = {
    codec: 'avc',
    quality,
    hardwareAcceleration: SETTINGS[encoder._tag].hardwareAcceleration,
    keyFrameInterval: KEY_FRAME_EVERY,
    latencyMode: 'quality',
  };
  if (scale === 1) return base;
  return { ...base, transform: { ...encodedSize(width, height, scale), fit: 'fill' } };
};

interface Copy {
  readonly copy: 'master' | 'share';
  readonly quality: Quality;
}

const HOLDS = {
  master: ['master'],
  'master+share': ['master', 'share'],
  share: ['share'],
} as const satisfies Readonly<Record<Copies, ReadonlyArray<Copy['copy']>>>;

export const qualities = (encoder: Encoder, copies: Copies): ReadonlyArray<Copy> => {
  const settings = SETTINGS[encoder._tag];
  const share = [settings.share].flatMap((quality): ReadonlyArray<Copy> => {
    if (quality === null) return [];
    return [{ copy: 'share', quality }];
  });
  const held: ReadonlyArray<Copy['copy']> = HOLDS[copies];
  return [{ copy: 'master', quality: settings.master } satisfies Copy, ...share].filter((c) =>
    held.includes(c.copy),
  );
};

export const encoderChoice = (
  canvas: HTMLCanvasElement,
  fps: number,
  scale: number,
  copies: Copies,
  candidates: ReadonlyArray<Encoder>,
): Promise<EncoderChoice> => {
  const size = encodedSize(canvas.width, canvas.height, scale);
  const can = (encoder: Encoder) =>
    Promise.all(
      qualities(encoder, copies).map(({ quality }) =>
        canEncodeVideo('avc', {
          ...size,
          quality,
          hardwareAcceleration: SETTINGS[encoder._tag].hardwareAcceleration,
          latencyMode: 'quality',
          frameRate: fps,
        }),
      ),
    ).then((each) => each.every(Boolean));
  const tried = candidates.map((c) => c._tag.toLowerCase()).join(' or ');
  return chooseEncoder(
    candidates,
    can,
    `no ${tried} H.264 encoder for ${size.width}×${size.height} at ${fps} fps`,
  );
};

interface EncodedChunk {
  readonly master: Uint8Array | undefined;
  readonly share: Uint8Array | undefined;
}

interface Rendition {
  readonly start: () => Promise<unknown>;
  readonly warm: () => Promise<void>;
  readonly add: (t: number, first: boolean) => Promise<unknown>;
  readonly finalize: () => Promise<unknown>;
  readonly cancel: () => Promise<unknown>;
  readonly bytes: () => Uint8Array;
}

const written = (target: BufferTarget) => () => {
  if (target.buffer === null) throw new Error('the encoder wrote nothing');
  return new Uint8Array(target.buffer);
};

const direct = (canvas: HTMLCanvasElement, fps: number, video: VideoEncodingConfig): Rendition => {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, video);
  output.addVideoTrack(source, { frameRate: fps });
  return {
    start: () => output.start(),
    warm: () => Promise.resolve(),
    add: (t) => source.add(t, secondsAt(1, fps)),
    finalize: () => output.finalize(),
    cancel: () => output.cancel(),
    bytes: written(target),
  };
};

const prerolled = (
  canvas: HTMLCanvasElement,
  fps: number,
  video: VideoEncodingConfig,
  preroll: number,
): Rendition => {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const kept = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(kept, { frameRate: fps });
  const session = new Output({ format: new Mp4OutputFormat(), target: new NullTarget() });
  let decoder: EncodedVideoChunkMetadata | undefined;
  let copied = 0;
  let copying: Promise<unknown> = Promise.resolve();
  const source = new CanvasSource(canvas, {
    ...video,
    onEncodedPacket: (packet, meta) => {
      if (meta?.decoderConfig !== undefined) decoder = meta;
      if (packet.timestamp < 0) return;
      const withConfig = copied === 0 ? decoder : undefined;
      copied += 1;
      copying = copying.then(() => kept.add(packet, withConfig));
    },
  });
  session.addVideoTrack(source, { frameRate: fps });
  return {
    start: () => Promise.all([session.start(), output.start()]),
    warm: () =>
      Array.from({ length: preroll }, (_, k) => secondsAt(k - preroll, fps)).reduce(
        async (before, t) => {
          await before;
          await source.add(t, secondsAt(1, fps));
        },
        Promise.resolve(),
      ),
    add: (t, first) => source.add(t, secondsAt(1, fps), first ? { keyFrame: true } : undefined),
    finalize: async () => {
      await session.finalize();
      await copying;
      await output.finalize();
    },
    cancel: () => Promise.all([session.cancel(), output.cancel()]),
    bytes: written(target),
  };
};

const rendition = (
  canvas: HTMLCanvasElement,
  fps: number,
  scale: number,
  encoder: Encoder,
  quality: Quality,
): Rendition => {
  const video = config(canvas.width, canvas.height, scale, encoder, quality);
  const { preroll } = SETTINGS[encoder._tag];
  return preroll === 0 ? direct(canvas, fps, video) : prerolled(canvas, fps, video, preroll);
};

export const encodeChunk = async (
  draw: (i: number) => Promise<void>,
  canvas: HTMLCanvasElement,
  fps: number,
  from: number,
  to: number,
  scale: number,
  copies: Copies,
  encoder: Encoder,
): Promise<EncodedChunk> => {
  const made = qualities(encoder, copies).map(({ copy, quality }) => ({
    copy,
    rendition: rendition(canvas, fps, scale, encoder, quality),
  }));
  if (made.length === 0) throw new Error(`${encoder._tag} makes none of ${copies} in the page`);
  const all = made.map((m) => m.rendition);
  const bytesOf = (copy: Copy['copy']) => made.find((m) => m.copy === copy)?.rendition.bytes();
  const frames = async () => {
    await Promise.all(all.map((r) => r.start()));
    await Array.from({ length: to - from }, (_, k) => from + k).reduce(async (before, i) => {
      await before;
      await draw(i);
      if (i === from) await Promise.all(all.map((r) => r.warm()));
      await Promise.all(all.map((r) => r.add(secondsAt(i - from, fps), i === from)));
    }, Promise.resolve());
    await Promise.all(all.map((r) => r.finalize()));
  };
  await frames().catch(async (e: unknown) => {
    await Promise.all(all.map((r) => r.cancel()));
    throw e;
  });
  return { master: bytesOf('master'), share: bytesOf('share') };
};
