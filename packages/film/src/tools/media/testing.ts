import { Effect, FileSystem, Layer, Option } from 'effect';
import { type Pcm, silence } from '../../core/audio.ts';
import { MIX_RATE } from '../../core/mix.ts';
import { MediaFailed } from '../../core/refusals.ts';
import { Media, type MediaService } from '../media.ts';
import type { FootageCopy, FootageProbe } from '../../core/footage.ts';
import { FootageMedia } from '../footage-media.ts';
import { text } from '../host/testing.ts';

export const fakeLength = (bytes: Uint8Array) => bytes.length / 10;

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

const fakeFlac = (pcm: Pcm) => text(`flac ${pcm.frames}/${pcm.rate}`);

const fakeDuration = (bytes: Uint8Array) =>
  Option.match(Option.fromNullishOr(new TextDecoder().decode(bytes).match(/^flac (\d+)\/(\d+)$/)), {
    onNone: () => fakeLength(bytes),
    onSome: (said) => Number(said[1]) / Number(said[2]),
  });

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
