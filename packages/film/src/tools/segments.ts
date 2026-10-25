// A film render's frames split at its beats into segments, each kept under
// the film's project folder (`segmentsFolder`) by a key over everything its
// frames read (`segmentKey`), so a render draws only the segments it has not
// drawn before and joins the rest from the folder, packets copied.
//
// A segment's key hashes:
//
// - the render's settings: the picture's size, its fps, the scale, the
//   encoder, whether the page makes the share copy, the captions, the
//   picture (scenes, Board, Board with its burn-in), the browser and the
//   platform;
// - its frames, first and past-last;
// - the key of each beat its frames fall in (`Stamps`, tools/stamp.ts): the
//   beat's sources, the film's frame and the engine (the player and the
//   export page, whose encoder settings are code), its layout and its take;
// - for a Board render, each shot its frames draw (`shotsSeen`): its beat,
//   its times, its motion and the span that times its motion and its
//   dissolves, and its panel as drawn: its card, or the try it shows with
//   the sha256 of that image as it is on disk.
//
// So a panel or a beat elsewhere leaves a segment's key alone, and a
// neighbour seen across a dissolve at its edge changes it.

import {
  Array as Arr,
  Effect,
  type FileSystem,
  Option,
  type Path,
  Predicate,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { PanelText, shownTry } from '../core/board.ts';
import { Shot } from '../core/animatic.ts';
import { type ShotSeen, shotsSeen } from '../core/board-render.ts';
import type { Placed } from '../core/layout.ts';
import { frameAtOrAfter } from '../core/time.ts';
import { writeWhole } from './content-store.ts';
import { sha256Hex } from './digest.ts';

/** What every frame of a render reads besides its beats: how it is drawn and encoded. */
export interface RenderRead {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly scale: number;
  readonly encoder: string;
  /** The page makes the share copy beside the master (`sharesInPage`). */
  readonly share: boolean;
  readonly captions: boolean;
  /** The export page's picture words (`pictureParams`). */
  readonly picture: ReadonlyArray<string>;
  /** The browser the page runs in (its user agent): its encoder makes the parameter sets. */
  readonly agent: string;
  readonly platform: string;
}

/** What a Board render reads of the film's Board: its shots, the film's length, and the sha256 of each image by file. */
export interface BoardRead {
  readonly shots: ReadonlyArray<Shot>;
  readonly duration: number;
  readonly images: ReadonlyMap<string, string>;
}

/** A stretch of a render's frames `[from, to)`, within one beat, drawn and kept whole. */
export interface Segment {
  readonly from: number;
  readonly to: number;
  /** Its key (`segmentKey`); none where a beat it falls in has no key, so it is drawn and never kept. */
  readonly key: Option.Option<string>;
}

/** A panel as a Board frame draws it: its card, or the try it shows and that image's sha256. */
const PanelRead = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  text: Schema.OptionFromOptionalKey(PanelText),
  shown: Schema.OptionFromOptionalKey(
    Schema.Struct({
      n: Schema.Int,
      file: Schema.String,
      sha256: Schema.OptionFromOptionalKey(Schema.String),
    }),
  ),
});

/** A shot as a Board frame reads it (`ShotSeen`). */
const ShotRead = Schema.Struct({
  beat: Schema.String,
  from: Schema.Finite,
  at: Schema.OptionFromOptionalKey(Schema.Finite),
  seen: Schema.Finite,
  gone: Schema.Finite,
  motion: Schema.Struct({ _tag: Schema.String, dir: Schema.optionalKey(Schema.Finite) }),
  panel: Schema.OptionFromOptionalKey(PanelRead),
});

/** What a segment's key is the hash of, as JSON. */
const SegmentKeyInput = Schema.fromJsonString(
  Schema.Struct({
    render: Schema.Struct({
      width: Schema.Int,
      height: Schema.Int,
      fps: Schema.Finite,
      scale: Schema.Finite,
      encoder: Schema.String,
      share: Schema.Boolean,
      captions: Schema.Boolean,
      picture: Schema.Array(Schema.String),
      agent: Schema.String,
      platform: Schema.String,
    }),
    from: Schema.Int,
    to: Schema.Int,
    scenes: Schema.Array(Schema.String),
    shots: Schema.Array(ShotRead),
  }),
);

/** `seen` as its key reads it: the shot's panel reduced to what its frames draw, its image's sha256 from `images`. */
const shotRead = (seen: ShotSeen, images: ReadonlyMap<string, string>) =>
  Shot.$match(seen.shot, {
    Unboarded: ({ beat, from }) => ({
      beat,
      from,
      at: Option.none<number>(),
      seen: seen.seen,
      gone: seen.gone,
      motion: seen.motion,
      panel: Option.none(),
    }),
    Boarded: ({ beat, from, at, panel }) => ({
      beat,
      from,
      at: Option.some(at),
      seen: seen.seen,
      gone: seen.gone,
      motion: seen.motion,
      panel: Option.some({
        id: panel.id,
        at: panel.at,
        text: Option.fromUndefinedOr(panel.text),
        shown: Option.map(
          Option.filter(shownTry(panel), () => Predicate.isUndefined(panel.text)),
          (t) => ({
            n: t.n,
            file: t.file,
            sha256: Option.fromUndefinedOr(images.get(t.file)),
          }),
        ),
      }),
    }),
  });

/**
 * The frames of beat `p` at `fps`: from the first at or after its start to
 * the first at or after its end, as the film's own frames are counted.
 */
const beatFrames = (p: Placed, fps: number) => ({
  from: frameAtOrAfter(p.start, fps),
  to: frameAtOrAfter(p.start + p.dur, fps),
});

/** What a render's segments are cut and keyed from. */
interface SegmentsInput {
  readonly placed: ReadonlyArray<Placed>;
  /** The render's frames, `[start, end)`. */
  readonly start: number;
  readonly end: number;
  readonly render: RenderRead;
  /** Each beat's key, by id (`SceneKeys.keys`). */
  readonly scenes: ReadonlyMap<string, string>;
  /** The Board a Board render draws; none for the scenes. */
  readonly board: Option.Option<BoardRead>;
}

/**
 * The key of frames `[from, to)`: the hash of the render's settings, the
 * frames, the keys of `beats` (the beats they fall in) and, for a Board
 * render, the shots they draw. None when a beat has no key.
 */
const segmentKey = (
  input: SegmentsInput,
  from: number,
  to: number,
  beats: ReadonlyArray<Placed>,
): Option.Option<string> => {
  const fps = input.render.fps;
  return Option.map(
    Option.all(beats.map((p) => Option.fromUndefinedOr(input.scenes.get(p.spec.id)))),
    (scenes) =>
      sha256Hex(
        Schema.encodeSync(SegmentKeyInput)({
          render: input.render,
          from,
          to,
          scenes,
          shots: Option.match(input.board, {
            onNone: () => [],
            onSome: (board) =>
              shotsSeen(board.shots, board.duration, from / fps, to / fps).map((seen) =>
                shotRead(seen, board.images),
              ),
          }),
        }),
      ),
  );
};

/**
 * The render's frames `[start, end)` split at its beats' first frames into
 * segments, in order, each keyed by what its frames read (`segmentKey`).
 */
export const beatSegments = (input: SegmentsInput): ReadonlyArray<Segment> => {
  const { start, end, placed } = input;
  const fps = input.render.fps;
  const edges = Arr.dedupe(
    [
      start,
      ...placed.map((p) => beatFrames(p, fps).from).filter((f) => f > start && f < end),
      end,
    ].toSorted((a, b) => a - b),
  );
  return Arr.zip(edges, edges.slice(1)).map(([from, to]) => ({
    from,
    to,
    key: segmentKey(
      input,
      from,
      to,
      placed.filter((p) => {
        const frames = beatFrames(p, fps);
        return frames.from < to && frames.to > from;
      }),
    ),
  }));
};

/** Where a film's segments are kept: `out/<film>/cache/segments`, a folder its catalogue never lists. */
export const segmentsFolder = (project: string): string => `${project}/cache/segments`;

/** A chunk of a kept segment: its frames, and its files' names in the segment's folder. */
const KeptChunk = Schema.Struct({
  from: Schema.Int,
  to: Schema.Int,
  master: Schema.String,
  share: Schema.OptionFromOptionalKey(Schema.String),
});
type KeptChunk = typeof KeptChunk.Type;

/** A kept segment's record, `<key>/segment.json`: its chunks in frame order. */
const KeptSegmentJson = Schema.fromJsonString(Schema.Struct({ chunks: Schema.Array(KeptChunk) }));

/** A chunk's files in a kept segment's folder: `<from>.mp4`, its share copy `<from>.share.mp4`. */
export const keptNames = (from: number) => ({
  master: `${from}.mp4`,
  share: `${from}.share.mp4`,
});

/** The folder segment `key` is kept in, under the film's `folder` (`segmentsFolder`). */
export const keptFolder = (folder: string, key: string): string => `${folder}/${key}`;

/**
 * Segment `key`'s chunks as kept under `folder`, their files by path; none
 * when it was never kept whole (no record), or a file it lists is gone.
 */
export const keptSegment = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
): Effect.Effect<Option.Option<ReadonlyArray<KeptChunk>>, PlatformError> =>
  Effect.gen(function* () {
    const dir = keptFolder(folder, key);
    const record = path.join(dir, 'segment.json');
    if (!(yield* fs.exists(record))) return Option.none();
    const read = Schema.decodeOption(KeptSegmentJson)(yield* fs.readFileString(record));
    if (Option.isNone(read)) return Option.none();
    const chunks = read.value.chunks.map((c) => ({
      ...c,
      master: path.join(dir, c.master),
      share: Option.map(c.share, (s) => path.join(dir, s)),
    }));
    const files = chunks.flatMap((c) => [c.master, ...Option.toArray(c.share)]);
    const there = yield* Effect.forEach(files, (file) => fs.exists(file));
    return Option.liftPredicate(chunks, () => there.every(Boolean));
  });

/**
 * Segment `key` recorded as kept under `folder`, its `chunks` (files named
 * by `keptNames`, already in its folder) in frame order. Written last and
 * whole, so a segment is found only once every chunk of it is there.
 */
export const keepSegment = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
  chunks: ReadonlyArray<{ readonly from: number; readonly to: number; readonly share: boolean }>,
): Effect.Effect<void, PlatformError> => {
  const record = Schema.encodeSync(KeptSegmentJson)({
    chunks: chunks.map((c) => ({
      from: c.from,
      to: c.to,
      master: keptNames(c.from).master,
      share: Option.map(Option.liftPredicate(c.share, Boolean), () => keptNames(c.from).share),
    })),
  });
  const file = path.join(keptFolder(folder, key), 'segment.json');
  return writeWhole(fs, file, (partial) => fs.writeFileString(partial, record));
};
