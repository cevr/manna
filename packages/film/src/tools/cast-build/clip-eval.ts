// A clip as the clip eval reads it (`eval:clip:<clip>@<member>`): its mp4
// decoded in this process, each frame laid on the reader's canvas at the
// map its provenance keeps (`clip-map.ts` `canvasOf`) and written as
// `f%03d.png`, read.py's own frame ids, so the reader reads the canvases as a
// folder of PNGs; and the figure numbers measured on those canvases
// (`figureNumbersOf`).
//
// A frame is decoded by @mediabunny/server's FFmpeg (the coders the media
// service registers) and turned to RGB by libavfilter at
// `scale=flags=neighbor+accurate_rnd`, which is OpenCV's decode exactly; a
// plain `format=rgb24` rounds otherwise by up to 4. At clip B's map the 124
// canvases are read.py's, pixel for pixel (`clip-eval.slow.test.ts`). The
// media stack loads only when a clip is decoded, so a module that names this
// one loads none of it.

import { Array as Arr, Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import type { VideoSample } from 'mediabunny';
import type { Raster } from '../../core/raster.ts';
import { MediaFailed } from '../../core/refusals.ts';
import { Media } from '../media.ts';
import { encodePng } from '../png.ts';
import { figureOf } from './chain-steps.ts';
import { type ClipMap, type FigureMask, canvasOf, figureNumbersOf } from './clip-map.ts';
import { ClipProvenance } from './clips.ts';
import type { Clip } from './coverage.ts';

/** The reader's canvas, width and height in px: `reader/model.py`'s `CANVAS`. */
export const CANVAS: readonly [number, number] = [533, 678];

/** Bumped when a clip's canvases or figure numbers come out otherwise from the same mp4 and map: a clip read's cache key holds it. */
export const MAPPING = '1';

/** The filter a decoded frame is turned to RGB by: OpenCV's decode, value for value. */
const TO_RGB = 'scale=flags=neighbor+accurate_rnd,format=rgb24';

/** A clip's figure numbers as JSON, as a clip read's cache keeps them. */
export const ClipFigureJson = Schema.fromJsonString(
  Schema.Struct({
    heightRatio: Schema.Array(Schema.Finite),
    feetPx: Schema.Array(Schema.Finite),
    iouFirst: Schema.Array(Schema.Finite),
    iouLast: Schema.Array(Schema.Finite),
  }),
);

const ProvenanceJson = Schema.fromJsonString(ClipProvenance);

/** A clip's provenance read from its JSON text. */
export const provenanceIn = (text: string) => Schema.decodeEffect(ProvenanceJson)(text);

/** The provenance beside `mp4`: `<stem>.json`. */
export const provenanceOf = (mp4: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* provenanceIn(yield* fs.readFileString(`${mp4.replace(/\.mp4$/, '')}.json`));
  });

/** A clip's declared bands, each with the drawings it accepts (`<member>/<entry>`), none where the clip names none. */
export const declaredBands = (member: string, clip: Pick<Clip, 'bands' | 'expect'>) =>
  clip.bands.map(([from, to], i) => ({
    from,
    to,
    expect: (clip.expect[i] ?? []).map((entry) => `${member}/${entry}`),
  }));

/** A frame's RGB rows, each `stride` bytes of which the first `width` × 3 are its pixels, as an opaque raster. */
export const rasterOfRgb24 = (
  rgb: Uint8Array,
  width: number,
  height: number,
  stride: number,
): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = y * stride + x * 3;
      const to = (y * width + x) * 4;
      rgba.set(rgb.subarray(from, from + 3), to);
      rgba[to + 3] = 255;
    }
  return { width, height, rgba };
};

const loadMediabunny = () => import('mediabunny');
const loadMediabunnyServer = () => import('@mediabunny/server');
const loadNodeAv = () => import('node-av');

/** The media stack, loaded when a clip is first decoded. */
const mediaStack = Effect.all(
  [
    Effect.promise(loadMediabunny),
    Effect.promise(loadMediabunnyServer),
    Effect.promise(loadNodeAv),
  ],
  { concurrency: 'unbounded' },
);

/** Each frame of `file`, in order, as OpenCV decodes it. */
export const clipFrames = (file: string): Stream.Stream<Raster, MediaFailed, Media> =>
  Stream.unwrap(
    Effect.gen(function* () {
      // Built for its coders: @mediabunny/server's FFmpeg decodes the H.264.
      yield* Media;
      const [mediabunny, server, av] = yield* mediaStack;
      const failed = (cause: unknown) =>
        MediaFailed.make({ op: 'decode', file, reason: String(cause) });
      const attempt = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: failed });
      const input = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new mediabunny.Input({
              source: new mediabunny.FilePathSource(file),
              formats: mediabunny.ALL_FORMATS,
            }),
        ),
        (opened) => Effect.sync(() => opened.dispose()),
      );
      const track = yield* Effect.flatMap(
        attempt(() => input.getPrimaryVideoTrack()),
        (found) =>
          Effect.fromOption(Option.fromNullishOr(found)).pipe(
            Effect.mapError(() => failed('no picture in it')),
          ),
      );
      const filter = yield* Effect.acquireRelease(
        Effect.sync(() => av.FilterAPI.create(TO_RGB)),
        (made) => Effect.sync(() => made.close()),
      );
      /** `sample` as RGB, every frame NodeAV allotted for it freed. */
      const rasterOf = (sample: VideoSample) =>
        Effect.scoped(
          Effect.gen(function* () {
            const frame = yield* Effect.acquireRelease(
              Effect.sync(() => {
                const made = new av.Frame();
                made.alloc();
                return made;
              }),
              (made) => Effect.sync(() => made.free()),
            );
            yield* attempt(() => server.toAvFrame(sample, frame));
            const frames = yield* Effect.acquireRelease(
              attempt(() => filter.processAll(frame)),
              (made) => Effect.sync(() => made.forEach((each) => each.free())),
            );
            const rgb = yield* Effect.fromOption(Arr.head(frames)).pipe(
              Effect.mapError(() => failed('the filter gave no frame')),
            );
            const plane = yield* Effect.fromOption(
              Option.flatMap(Option.fromNullishOr(rgb.data), Arr.head),
            ).pipe(Effect.mapError(() => failed('the frame has no pixels')));
            return rasterOfRgb24(plane, rgb.width, rgb.height, rgb.linesize[0] ?? rgb.width * 3);
          }),
        );
      return Stream.fromAsyncIterable(new mediabunny.VideoSampleSink(track).samples(), failed).pipe(
        Stream.mapEffect((sample) =>
          Effect.ensuring(
            rasterOf(sample),
            Effect.sync(() => sample.close()),
          ),
        ),
      );
    }),
  );

/**
 * `frames` laid on a `size` canvas at `map`, each written to
 * `<dir>/f%03d.png` in order as it comes; the figure numbers of the
 * canvases written.
 */
export const writeCanvases = <E, R>(
  frames: Stream.Stream<Raster, E, R>,
  map: ClipMap,
  dir: string,
  size: readonly [number, number] = CANVAS,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(dir, { recursive: true });
    const masks = yield* frames.pipe(
      Stream.zipWithIndex,
      Stream.mapEffect(([frame, i]) =>
        Effect.gen(function* () {
          const canvas = canvasOf(frame, map, size);
          yield* fs.writeFile(
            path.join(dir, `f${String(i).padStart(3, '0')}.png`),
            encodePng(canvas),
          );
          const mask: FigureMask = {
            width: canvas.width,
            height: canvas.height,
            mask: figureOf(canvas),
          };
          return mask;
        }),
      ),
      Stream.runCollect,
    );
    return figureNumbersOf(masks);
  });
