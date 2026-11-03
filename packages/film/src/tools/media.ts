import { Context, Effect, Layer, Match, type Option, Predicate } from 'effect';
import type { EncodedPacket } from 'mediabunny';
import type { Pcm } from '../core/audio.ts';
import type { Raster } from '../core/raster.ts';
import type { MediaFailed } from '../core/refusals.ts';

export interface Timing {
  readonly seconds: number;
  readonly fps: Option.Option<number>;
}

export interface MediaService {
  readonly load: (file: string, rate: number) => Effect.Effect<Pcm, MediaFailed>;
  readonly encodeFlac: (pcm: Pcm) => Effect.Effect<Uint8Array, MediaFailed>;
  readonly timing: (file: string) => Effect.Effect<Timing, MediaFailed>;
  readonly decode: (file: string) => Effect.Effect<Pcm, MediaFailed>;
  readonly writeWav: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  readonly encodeAac: (pcm: Pcm) => Effect.Effect<AacTrack, MediaFailed>;
  readonly writeAac: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  readonly join: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
  readonly remux: (video: string, audio: AacTrack) => Effect.Effect<void, MediaFailed>;
  readonly still: (
    video: string,
    at: number,
    width: number,
    out: string,
  ) => Effect.Effect<void, MediaFailed>;
  readonly phoneCopy: (video: string, out: string) => Effect.Effect<void, MediaFailed>;
  readonly card: (image: Raster, pcm: Pcm, out: string) => Effect.Effect<void, MediaFailed>;
  readonly writePng: (file: string, image: Raster) => Effect.Effect<void, MediaFailed>;
}
export const PHONE_ENCODE = {
  recipe: 1,
  height: 720,
  rate: 8_000_000,
  bufferSeconds: 2,
  keyEvery: 1,
  threads: 2,
  x264: { preset: 'medium', level: '4.1', crf: 23 },
} as const;

export const PHONE_RATE = PHONE_ENCODE.rate;

interface Settings {
  readonly [key: string]: string | number | Settings;
}

const entriesOf = (settings: Settings): ReadonlyArray<string> =>
  Object.entries(settings).flatMap(([key, value]) =>
    Match.value(value).pipe(
      Match.when(Predicate.isString, (plain) => [key, plain]),
      Match.when(Predicate.isNumber, (plain) => [key, String(plain)]),
      Match.orElse((nested) => [key, ...entriesOf(nested)]),
    ),
  );

export const PHONE_COPY = entriesOf(PHONE_ENCODE);

export interface Segment {
  readonly file: string;
  readonly at: number;
}

export interface JoinedFilm {
  readonly out: string;
  readonly segments: ReadonlyArray<Segment>;
  readonly frames: number;
  readonly audio: Option.Option<AacTrack>;
}

export interface AacTrack {
  readonly packets: ReadonlyArray<EncodedPacket>;
  readonly meta: EncodedAudioChunkMetadata;
}

export class Media extends Context.Service<Media, MediaService>()('@manna/film/tools/Media') {
  static readonly layer = Layer.unwrap(
    Effect.promise(() => import('./media-bun.ts')).pipe(Effect.map((live) => live.layer)),
  );
}
