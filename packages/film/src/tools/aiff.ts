import { Array as Arr, Match, Option, Result } from 'effect';
import type { Pcm } from '../core/audio.ts';

const fourcc = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(...bytes.subarray(at, at + 4));

export const isAiff = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 &&
  fourcc(bytes, 0) === 'FORM' &&
  (fourcc(bytes, 8) === 'AIFF' || fourcc(bytes, 8) === 'AIFC');

type Encoding = 'int-be' | 'int-le' | 'float';

interface Layout {
  readonly encoding: Encoding;
  readonly bits: Option.Option<number>;
}

const LAYOUTS = new Map<string, Layout>([
  ['NONE', { encoding: 'int-be', bits: Option.none() }],
  ['twos', { encoding: 'int-be', bits: Option.none() }],
  ['sowt', { encoding: 'int-le', bits: Option.none() }],
  ['fl32', { encoding: 'float', bits: Option.some(32) }],
  ['FL32', { encoding: 'float', bits: Option.some(32) }],
  ['fl64', { encoding: 'float', bits: Option.some(64) }],
  ['FL64', { encoding: 'float', bits: Option.some(64) }],
]);

interface Chunk {
  readonly id: string;
  readonly body: number;
  readonly size: number;
}

const chunksOf = (bytes: Uint8Array, view: DataView): ReadonlyArray<Chunk> => {
  const chunks: Array<Chunk> = [];
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4);
    chunks.push({ id: fourcc(bytes, at), body: at + 8, size });
    at += 8 + size + (size % 2);
  }
  return chunks;
};

const extended = (view: DataView, at: number): number => {
  const exponent = view.getUint16(at) & 0x7fff;
  const mantissa = view.getUint32(at + 2) * 2 ** 32 + view.getUint32(at + 6);
  return mantissa * 2 ** (exponent - 16383 - 63);
};

interface Common {
  readonly channels: number;
  readonly frames: number;
  readonly bits: number;
  readonly rate: number;
  readonly encoding: Encoding;
}

const isSound = (common: Common) =>
  common.channels > 0 && common.bits > 0 && common.bits <= 64 && common.rate > 0;

const commonOf = (view: DataView, chunk: Chunk, type: string): Result.Result<Common, string> =>
  Result.flatMap(
    Result.fromOption(
      Option.fromUndefinedOr(LAYOUTS.get(type)),
      () => `compressed AIFF-C (${type}); export WAV or FLAC`,
    ),
    (layout) => {
      const common: Common = {
        channels: view.getUint16(chunk.body),
        frames: view.getUint32(chunk.body + 2),
        bits: Option.getOrElse(layout.bits, () => view.getUint16(chunk.body + 6)),
        rate: extended(view, chunk.body + 8),
        encoding: layout.encoding,
      };
      return Result.filterOrFail(
        Result.succeed(common),
        isSound,
        () => 'a COMM chunk that describes no sound',
      );
    },
  );

type Read = (view: DataView, at: number) => number;

const reader = (common: Common): Read =>
  Match.value({ encoding: common.encoding, width: Math.ceil(common.bits / 8) }).pipe(
    Match.when({ encoding: 'float', width: 8 }, (): Read => (v, at) => v.getFloat64(at)),
    Match.when({ encoding: 'float' }, (): Read => (v, at) => v.getFloat32(at)),
    Match.when({ width: 1 }, (): Read => (v, at) => v.getInt8(at) / 2 ** 7),
    Match.when(
      { width: 2 },
      ({ encoding }): Read =>
        (v, at) =>
          v.getInt16(at, encoding === 'int-le') / 2 ** 15,
    ),
    Match.when(
      { width: 3, encoding: 'int-le' },
      (): Read => (v, at) =>
        (v.getInt8(at + 2) * 65536 + v.getUint8(at + 1) * 256 + v.getUint8(at)) / 2 ** 23,
    ),
    Match.when(
      { width: 3 },
      (): Read => (v, at) =>
        (v.getInt8(at) * 65536 + v.getUint8(at + 1) * 256 + v.getUint8(at + 2)) / 2 ** 23,
    ),
    Match.orElse(
      ({ encoding }): Read =>
        (v, at) =>
          v.getInt32(at, encoding === 'int-le') / 2 ** 31,
    ),
  );

const samplesOf = (bytes: Uint8Array, view: DataView, common: Common, sound: Chunk): Pcm => {
  const width = Math.ceil(common.bits / 8);
  const start = sound.body + 8 + view.getUint32(sound.body);
  const room = Math.max(0, Math.min(sound.body + sound.size, bytes.length) - start);
  const frames = Math.min(common.frames, Math.floor(room / (width * common.channels)));
  const read = reader(common);
  const channels = Array.from({ length: common.channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++)
    for (const [c, plane] of channels.entries())
      plane[f] = read(view, start + (f * common.channels + c) * width);
  return { rate: common.rate, frames, channels };
};

export const readAiff = (bytes: Uint8Array): Result.Result<Pcm, string> => {
  if (!isAiff(bytes)) return Result.fail('not an AIFF file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = chunksOf(bytes, view);
  const named = (id: string) =>
    Result.fromOption(
      Arr.findFirst(chunks, (chunk) => chunk.id === id),
      () => `no ${id} chunk`,
    );
  const typeOf = (comm: Chunk) =>
    Option.getOrElse(
      Option.map(
        Option.liftPredicate(bytes, () => fourcc(bytes, 8) === 'AIFC'),
        () => fourcc(bytes, comm.body + 18),
      ),
      () => 'NONE',
    );
  return Result.flatMap(named('COMM'), (comm) =>
    Result.flatMap(commonOf(view, comm, typeOf(comm)), (common) =>
      Result.map(named('SSND'), (sound) => samplesOf(bytes, view, common, sound)),
    ),
  );
};
