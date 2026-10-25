// The media service: what a media file is asked (how long it plays, its sound
// as PCM, a still), and what is written from PCM, a raster or a render's
// segments (WAV, AAC, FLAC, PNG, a joined film, its share and phone copies).
// Its live layer (`media-bun.ts`, which says how each is done) loads with
// the media stack it needs (mediabunny, its coders, NodeAV) only when
// `Media.layer` is built, so a module that names the service, or a test that
// doubles it, loads none of it.

import { Context, Effect, Layer, Match, type Option, Predicate } from 'effect';
import type { EncodedPacket } from 'mediabunny';
import type { Pcm } from '../core/audio.ts';
import type { Raster } from '../core/raster.ts';
import type { MediaFailed } from '../core/refusals.ts';

/** How long a media file plays, in seconds, and its frames a second (none for a file with no video). */
export interface Timing {
  readonly seconds: number;
  readonly fps: Option.Option<number>;
}

export interface MediaService {
  /**
   * A recording (WAV, FLAC, AIFF, M4A, MP3, Ogg), mixed down to one channel and
   * resampled to `rate`, as 32-bit float.
   */
  readonly load: (file: string, rate: number) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` as a 24-bit FLAC master: a person's take, lossless. */
  readonly encodeFlac: (pcm: Pcm) => Effect.Effect<Uint8Array, MediaFailed>;
  /**
   * How long `file` plays, in seconds (an MP3 or FLAC as decoded, its
   * encoder padding trimmed; anything else by its container), and its
   * frames a second as its own packets say (`rateOf`: a whole or 1000/1001
   * rate within its timestamps' precision, else as measured), none for a file with no
   * video: one read of the file.
   */
  readonly timing: (file: string) => Effect.Effect<Timing, MediaFailed>;
  /** `file`'s first audio track (MP3, FLAC, WAV, AIFF, M4A, Ogg) decoded to planar PCM at its own rate, from its first frame. */
  readonly decode: (file: string) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` written to `file` as a 16-bit WAV. */
  readonly writeWav: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  /** `pcm` encoded to AAC packets, from its first frame, for `join` to copy. */
  readonly encodeAac: (pcm: Pcm) => Effect.Effect<AacTrack, MediaFailed>;
  /** `pcm` written to `file` as an AAC track in an MP4 (an `.m4a`, fast start): what a phone plays. */
  readonly writeAac: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  /**
   * The film as one MP4 at `out`: each segment's H.264 packets copied, not
   * re-encoded, at its place, and the track's AAC packets, if any, beside
   * them. Every segment must be encoded alike. The file is written beside
   * `out` and renamed over it once whole.
   */
  readonly join: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
  /**
   * `video` with its sound replaced by `audio`: its H.264 packets copied, not
   * re-encoded, and the track's AAC packets beside them. The file is written
   * beside `video` and renamed over it once whole.
   */
  readonly remux: (video: string, audio: AacTrack) => Effect.Effect<void, MediaFailed>;
  /**
   * The share copy of the film at `master`, written to `out`: its video
   * encoded again by x264 at CRF `SHARE_CRF` (`media-bun.ts`, `x264.ts`),
   * its track copied. `out` appears only once whole.
   */
  readonly shareCopy: (master: string, out: string) => Effect.Effect<void, MediaFailed>;
  /**
   * A JPEG of the frame `video` shows at `at` seconds, `width` pixels wide,
   * written to `out` whatever its name.
   */
  readonly still: (
    video: string,
    at: number,
    width: number,
    out: string,
  ) => Effect.Effect<void, MediaFailed>;
  /**
   * The copy of `video` a phone streams, written to `out` (an MP4 whatever
   * its name, the index at its head): 720 lines high at most (a shorter
   * video keeps its size, made even), H.264 at CRF 23 averaging `PHONE_RATE`
   * at most (`media-bun.ts` `phoneRateFor`), a key frame every second at
   * its own frame rate (`PHONE_ENCODE`), its track copied. The review makes one of
   * every render too big or too dense to play as made, and names it by
   * `PHONE_COPY`.
   */
  readonly phoneCopy: (video: string, out: string) => Effect.Effect<void, MediaFailed>;
  /**
   * `image` held for as long as `pcm` plays, over it, written to `out` as an
   * MP4 a phone streams (the index at its head): its picture H.264 at the
   * phone copy's settings (`PHONE_ENCODE`), a key frame each second, its
   * sound AAC. A sound's clip for an ask (`sfx ab`): an ask plays a set's
   * video in place.
   */
  readonly card: (image: Raster, pcm: Pcm, out: string) => Effect.Effect<void, MediaFailed>;
  /** `image` written to `file` as a PNG (`png.ts`): a sound's sheet (`sfx render --sheet`, `sfx ab`). */
  readonly writePng: (file: string, image: Raster) => Effect.Effect<void, MediaFailed>;
}
/**
 * A phone copy (a bitrate quality), everything it is made with: the review
 * names a copy by all of it (`PHONE_COPY`), so a copy made any
 * other way is never served. At most `height` lines high (a shorter video
 * keeps its size, `Media.phoneCopy`), made in the review's own process in
 * the background on `threads` threads, so the review answers while it
 * encodes: CRF 23 at preset medium, no tune, capped at the rate the
 * conversion asks over `bufferSeconds` of buffer (where the cap binds, x264
 * spreads the bits over every frame: each keeps its own picture, softer);
 * `Media.phoneCopy` asks under `rate` by as much as the buffer could add, so
 * even a short copy averages `rate` at most. A key frame comes every
 * `keyEvery` seconds at the video's own frame rate (its first frame's
 * length), so a seek decodes a second of frames at most: the review's player
 * puts a video that drifts from its clock back on it by a seek
 * (`lab/ask/sync.ts`), which must land before the clock has moved on
 * again. `recipe` counts the changes to how the copy is made in code (the
 * size rule, the rate and key-frame sums): a change to any of them bumps it.
 */
export const PHONE_ENCODE = {
  recipe: 1,
  height: 720,
  rate: 8_000_000,
  bufferSeconds: 2,
  keyEvery: 1,
  threads: 2,
  x264: { preset: 'medium', level: '4.1', crf: 23 },
} as const;

/**
 * The most bits a second a phone is taken to play smoothly: the review
 * serves a video over it as its phone copy (`review.ts`), and a copy
 * averages it at most. Seen on the looks study (2026-10-11): its 2D renders
 * at 7.1 and 7.8 Mbps played as made, its 3D ones at 14 and 21 Mbps
 * choppily (packages/film/README.md, "Phone copies").
 */
export const PHONE_RATE = PHONE_ENCODE.rate;

/** Settings by name: a value, or more settings. */
interface Settings {
  readonly [key: string]: string | number | Settings;
}

/** Every entry of `settings`, nested ones by their key, in order: what a cache name is made from. */
const entriesOf = (settings: Settings): ReadonlyArray<string> =>
  Object.entries(settings).flatMap(([key, value]) =>
    Match.value(value).pipe(
      Match.when(Predicate.isString, (plain) => [key, plain]),
      Match.when(Predicate.isNumber, (plain) => [key, String(plain)]),
      Match.orElse((nested) => [key, ...entriesOf(nested)]),
    ),
  );

/**
 * Everything a phone copy is made with (`PHONE_ENCODE`, every entry): the
 * review names its copies by it beside their source (`review.ts`), so a
 * copy made any other way is never served.
 */
export const PHONE_COPY = entriesOf(PHONE_ENCODE);

/** A run of H.264 video in its own MP4, played from `at` seconds into the film. */
export interface Segment {
  readonly file: string;
  readonly at: number;
}

/** What `join` writes. */
export interface JoinedFilm {
  readonly out: string;
  /** In order, each starting where the one before it ends. */
  readonly segments: ReadonlyArray<Segment>;
  /** Frames across every segment: the index at the head of the file is sized by it. */
  readonly frames: number;
  /** The track under the film, from its first frame. */
  readonly audio: Option.Option<AacTrack>;
}

/** A track encoded once to AAC, so every film joined with it copies the same packets. */
export interface AacTrack {
  /** In decode order; the first carries the priming, stamped before zero. */
  readonly packets: ReadonlyArray<EncodedPacket>;
  /** The encoder's metadata for the first packet: its decoder config. */
  readonly meta: EncodedAudioChunkMetadata;
}

export class Media extends Context.Service<Media, MediaService>()('@manna/film/tools/Media') {
  /** The live media, its module loaded when the layer is built. */
  static readonly layer = Layer.unwrap(
    Effect.promise(() => import('./media-bun.ts')).pipe(Effect.map((live) => live.layer)),
  );
}
