// The media service in memory for the tool tests (`media.ts`, `footage-media.ts`):
// a file's length and sound made up from its bytes, every write recorded.
// None of the media stack loads.

import { Effect, FileSystem, Layer, Option } from 'effect';
import { type Pcm, silence } from '../../core/audio.ts';
import { MIX_RATE } from '../../core/mix.ts';
import { MediaFailed } from '../../core/refusals.ts';
import { Media, type MediaService } from '../media.ts';
import type { FootageCopy, FootageProbe } from '../../core/footage.ts';
import { FootageMedia } from '../footage-media.ts';
import { text } from '../host/testing.ts';

/** A take's length as the fake media measures it: a tenth of a second per byte. */
export const fakeLength = (bytes: Uint8Array) => bytes.length / 10;

/**
 * A person's recording as the fake media loads it: half a second of room
 * noise, 0.4 s of tone for each word of what the file says (its bytes are the
 * words, as a staging take's are), then half a second of room noise.
 */
const fakeRecording = (said: string, rate: number): Pcm => {
  const words = said.split(/\s+/).filter((w) => w.length > 0).length;
  const frames = Math.round((1 + words * 0.4) * rate);
  const plane = Float32Array.from({ length: frames }, (_, i) => {
    const t = i / rate;
    const voiced = Number(t >= 0.5 && t < 0.5 + words * 0.4);
    return voiced * 0.1 * Math.sin((2 * Math.PI * 220 * i) / rate) + ((i % 7) - 3) * 1e-5;
  });
  return { rate, frames, channels: [plane] };
};

/**
 * The rest of a fake media that neither loads a recording nor serves a
 * review: loading fails, encoding writes nothing, and the review's stills,
 * phone copies and `.m4a` mixes, a re-mux and a sound's card and sheet, do
 * nothing.
 */
export const noRecording = {
  load: (file: string) =>
    Effect.fail(MediaFailed.make({ op: 'decode', file, reason: 'no recordings here' })),
  encodeFlac: () => Effect.succeed(new Uint8Array()),
  writeAac: () => Effect.void,
  still: () => Effect.void,
  phoneCopy: () => Effect.void,
  remux: () => Effect.void,
  card: () => Effect.void,
  writePng: () => Effect.void,
} satisfies Pick<
  MediaService,
  'load' | 'encodeFlac' | 'writeAac' | 'still' | 'phoneCopy' | 'remux' | 'card' | 'writePng'
>;

/**
 * Media as the review uses it, on disk: every video lasts `seconds` at `fps`
 * frames a second (none: a rate it cannot read), and a
 * still or a phone copy is the video copied whole. Each call lands in `calls`
 * (`timing <file>`, `still <video> <at> <width>`, `phone <video>`), so a
 * test counts what was made; a video that is not there fails as the real media does.
 */
export const reviewMedia = (
  calls: Array<string>,
  seconds = 12.5,
  fps: Option.Option<number> = Option.none(),
) =>
  Layer.effect(
    Media,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const copy = (op: MediaFailed['op'], video: string, out: string) =>
        fs
          .copyFile(video, out)
          .pipe(
            Effect.mapError((error) =>
              MediaFailed.make({ op, file: video, reason: error.message }),
            ),
          );
      const unused = Effect.die('not used by the review');
      return Media.of({
        ...noRecording,
        timing: (file) =>
          Effect.sync(() => void calls.push(`timing ${file}`)).pipe(Effect.as({ seconds, fps })),
        still: (video, at, width, out) =>
          Effect.sync(() => void calls.push(`still ${video} ${at} ${width}`)).pipe(
            Effect.andThen(copy('decode', video, out)),
          ),
        phoneCopy: (video, out) =>
          Effect.sync(() => void calls.push(`phone ${video}`)).pipe(
            Effect.andThen(copy('encode', video, out)),
          ),
        decode: () => unused,
        writeWav: () => unused,
        encodeAac: () => unused,
        join: () => unused,
      });
    }),
  );

/** What `fakeMedia.encodeFlac` writes: its frames and rate, so the fake measures it. */
const fakeFlac = (pcm: Pcm) => text(`flac ${pcm.frames}/${pcm.rate}`);

/** A fake FLAC's length from its bytes; any other file's is `fakeLength`. */
const fakeDuration = (bytes: Uint8Array) =>
  Option.match(Option.fromNullishOr(new TextDecoder().decode(bytes).match(/^flac (\d+)\/(\d+)$/)), {
    onNone: () => fakeLength(bytes),
    onSome: (said) => Number(said[1]) / Number(said[2]),
  });

/**
 * Media over `files`: a file measures `fakeLength` of its bytes (2.5 s when it
 * is not there) and decodes to `decoded` (a second of mono silence at the
 * mix's rate unless given), a WAV written lands as `wav <frames>`, and a
 * joined film as `mp4 <frames>`, a re-muxed one as `remuxed <video>`. A recording loads as `fakeRecording` of its
 * bytes, and a take encodes to `flac <frames>/<rate>`, which measures its own
 * length. A review's mix lands as `aac <frames>`, a still as `still of
 * <video> at <t> (<width>)`, a phone copy as `phone of <video>`, a sound's
 * card as `card <width>x<height> <frames>` and its sheet as `png
 * <width>x<height>`.
 */
export const fakeMedia = (
  files: Map<string, Uint8Array> = new Map(),
  decoded: Pcm = silence(MIX_RATE, MIX_RATE, 1),
) =>
  Layer.succeed(
    Media,
    Media.of({
      timing: (file) =>
        Effect.succeed({
          seconds: Option.match(Option.fromNullishOr(files.get(file)), {
            onNone: () => 2.5,
            onSome: fakeDuration,
          }),
          fps: Option.none(),
        }),
      decode: () => Effect.succeed(decoded),
      writeWav: (file, pcm) => Effect.sync(() => void files.set(file, text(`wav ${pcm.frames}`))),
      encodeAac: () => Effect.succeed({ packets: [], meta: {} }),
      join: (film) => Effect.sync(() => void files.set(film.out, text(`mp4 ${film.frames}`))),
      remux: (video) => Effect.sync(() => void files.set(video, text(`remuxed ${video}`))),
      load: (file, rate) =>
        Option.match(Option.fromNullishOr(files.get(file)), {
          onNone: () =>
            Effect.fail(MediaFailed.make({ op: 'decode', file, reason: 'no such file' })),
          onSome: (bytes) =>
            Effect.succeed(fakeRecording(new TextDecoder().decode(bytes).trim(), rate)),
        }),
      encodeFlac: (pcm) => Effect.succeed(fakeFlac(pcm)),
      writeAac: (file, pcm) => Effect.sync(() => void files.set(file, text(`aac ${pcm.frames}`))),
      still: (video, at, width, out) =>
        Effect.sync(() => void files.set(out, text(`still of ${video} at ${at} (${width})`))),
      phoneCopy: (video, out) => Effect.sync(() => void files.set(out, text(`phone of ${video}`))),
      card: (image, pcm, out) =>
        Effect.sync(
          () => void files.set(out, text(`card ${image.width}x${image.height} ${pcm.frames}`)),
        ),
      writePng: (file, image) =>
        Effect.sync(() => void files.set(file, text(`png ${image.width}x${image.height}`))),
    }),
  );

/**
 * The footage library's media over `files`: an original is probed by what
 * its bytes say (`probeOf`), a copy lands as `<copy> of <original>` and is
 * counted in `made`, and a take's voice is `fakeRecording` of its words.
 */
export const fakeFootageMedia = (
  files: Map<string, Uint8Array>,
  probeOf: (said: string) => { readonly probe: FootageProbe; readonly hdr: boolean },
  made: Array<FootageCopy>,
) =>
  Layer.succeed(
    FootageMedia,
    FootageMedia.of({
      probe: (file) =>
        Option.match(Option.fromNullishOr(files.get(file)), {
          onNone: () => Effect.fail(MediaFailed.make({ op: 'read', file, reason: 'no such file' })),
          onSome: (bytes) => Effect.succeed(probeOf(new TextDecoder().decode(bytes))),
        }),
      copy: (file, _picture, copy, out) =>
        Effect.sync(() => {
          made.push(copy);
          files.set(out, text(`${copy} of ${file}`));
        }),
      voice: (file, _picture, rate) =>
        Effect.succeed(fakeRecording(new TextDecoder().decode(files.get(file)).trim(), rate)),
    }),
  );
