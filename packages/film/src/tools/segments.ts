// A film render's frames split into segments at its beats, and where its
// frames start or stop reading the film's own seconds (`filmTimed`), each
// kept under the film's project folder (`segmentsFolder`) by a key over
// everything its frames read (`segmentKey`), so a render draws only the
// segments it has not drawn before and joins the rest from the folder,
// packets copied, each at its place in the render.
//
// A segment's key hashes:
//
// - the render's settings: the picture's size, its fps, the scale, the
//   encoder, the captions, the picture (scenes, Board, Board with its
//   burn-in), the browser and the platform; not the copies it encodes
//   (`Copies`): each copy is encoded alike whatever is encoded beside it, so
//   a segment's record says which it holds, and a render reuses one that
//   holds every copy it writes;
// - how many frames it has, and its first frame in the film where its
//   frames read the film's seconds: every frame the film draws does (its
//   boil tick wobbles its lines and moves its grain), and a review copy's
//   burn-in says them. A segment of frames that read only their beats' and
//   shots' times (a Board's panels) has no place in its key, so it is found
//   again after an earlier beat changes its length by whole frames;
// - each beat its frames read (the beat they fall in, and a Board shot's
//   beat) by its key wherever it sits (`SceneKeys.beats`, tools/stamp.ts:
//   its sources, the film's frame and the engine, the player and the export
//   page whose encoder settings are code, its layout and its take, and the
//   beat a transition into it draws), and where it starts;
// - for a Board render, each shot its frames draw (`shotsSeen`): its beat,
//   its times, its motion and the span that times its motion and its
//   dissolves, and its panel as drawn: its card, or the try it shows with
//   the sha256 of that image as it is on disk.
//
// Every time is keyed from the segment's first frame, in millionths of a
// frame (`atFrames`): the float noise of a sum of seconds lies far under
// it, and a frame drawn a millionth of a frame off draws the same.
//
// So a panel or a beat elsewhere leaves a segment's key alone, and a
// neighbour seen across a dissolve at its edge changes it.
//
// A kept segment's chunks are named and recorded by their frames from its
// first (`keptNames`), so the same chunks join wherever the segment now
// starts: each chunk's packets are stamped from its own first frame, and
// the join places them (`Media.join`).
//
// Each render marks the segments it reuses or keeps as used at its start
// (`used` in the record, never moved back); the cache as a whole, its lock,
// the renders' records and the prune, is `segment-cache.ts`.

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
import { type Copies, hasMaster, hasShare } from '../core/encoder.ts';
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

/**
 * A stretch of a render's frames `[from, to)`, within one beat, all reading
 * the film's own seconds or none of them, drawn and kept whole.
 */
export interface Segment {
  readonly from: number;
  readonly to: number;
  /** Its key (`segmentKey`); none where a beat it reads has no key, so it is drawn and never kept. */
  readonly key: Option.Option<string>;
  /** Whether its frames read the film's own seconds (`filmTimed`), so its key holds its place. */
  readonly pinned: boolean;
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

/**
 * A shot as a Board frame reads it (`ShotSeen`), its times in millionths of
 * a frame from the segment's first frame (`atFrames`).
 */
const ShotRead = Schema.Struct({
  beat: Schema.String,
  from: Schema.Int,
  at: Schema.OptionFromOptionalKey(Schema.Int),
  seen: Schema.Int,
  gone: Schema.Int,
  motion: Schema.Struct({ _tag: Schema.String, dir: Schema.optionalKey(Schema.Finite) }),
  panel: Schema.OptionFromOptionalKey(PanelRead),
});

/** A beat a segment's frames read: its key wherever it sits, and its start from the segment's first frame (`atFrames`). */
const BeatAt = Schema.Struct({ key: Schema.String, start: Schema.Int });

/** What a segment's key is the hash of, as JSON. */
const SegmentKeyInput = Schema.fromJsonString(
  Schema.Struct({
    render: Schema.Struct({
      width: Schema.Int,
      height: Schema.Int,
      fps: Schema.Finite,
      scale: Schema.Finite,
      encoder: Schema.String,
      captions: Schema.Boolean,
      picture: Schema.Array(Schema.String),
      agent: Schema.String,
      platform: Schema.String,
    }),
    /** Its first frame in the film, where its frames read the film's seconds; none where they read only their beats'. */
    place: Schema.OptionFromOptionalKey(Schema.Int),
    frames: Schema.Int,
    beats: Schema.Array(BeatAt),
    shots: Schema.Array(ShotRead),
  }),
);

/** How finely a segment's key tells times apart: a millionth of a frame, the frame grid's own nudge (`core/time.ts`). */
const PARTS = 1e6;

/** Film second `t` as a segment's key reads it: in millionths of a frame at `fps` from its first frame, `from`. */
const atFrames = (t: number, fps: number, from: number): number =>
  Math.round((t * fps - from) * PARTS);

/** `seen` as its key reads it: its times from frame `from` at `fps`, its panel reduced to what its frames draw, its image's sha256 from `images`. */
const shotRead = (seen: ShotSeen, images: ReadonlyMap<string, string>, fps: number, from: number) =>
  Shot.$match(seen.shot, {
    Unboarded: ({ beat, from: shown }) => ({
      beat,
      from: atFrames(shown, fps, from),
      at: Option.none<number>(),
      seen: atFrames(seen.seen, fps, from),
      gone: atFrames(seen.gone, fps, from),
      motion: seen.motion,
      panel: Option.none(),
    }),
    Boarded: ({ beat, from: shown, at, panel }) => ({
      beat,
      from: atFrames(shown, fps, from),
      at: Option.some(atFrames(at, fps, from)),
      seen: atFrames(seen.seen, fps, from),
      gone: atFrames(seen.gone, fps, from),
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
  /** Each beat's key wherever it sits, by id (`SceneKeys.beats`). */
  readonly beats: ReadonlyMap<string, string>;
  /** The Board a Board render draws; none for the scenes. */
  readonly board: Option.Option<BoardRead>;
  /** Whether frame `i` of the film reads the film's own seconds (`Film.filmTimed`, as the page answers it). */
  readonly filmTimed: (i: number) => boolean;
}

/**
 * The key of frames `[from, to)`: the hash of the render's settings, how
 * many frames there are, their first frame where they read the film's
 * seconds (`pinned`), each beat they read (`beats`, the one they fall in,
 * and for a Board render each shot's) by its key wherever it sits and its
 * start, and for a Board render the shots they draw: every time from
 * `from`. None when a beat they read has no key.
 */
const segmentKey = (
  input: SegmentsInput,
  from: number,
  to: number,
  pinned: boolean,
): Option.Option<string> => {
  const fps = input.render.fps;
  const seen = Option.match(input.board, {
    onNone: () => [],
    onSome: (board) =>
      shotsSeen(board.shots, board.duration, from / fps, to / fps).map((s) => ({
        seen: s,
        read: shotRead(s, board.images, fps, from),
      })),
  });
  const shotBeats = new Set(seen.map((s) => s.seen.shot.beat));
  const read = input.placed.filter((p) => {
    const frames = beatFrames(p, fps);
    return (frames.from < to && frames.to > from) || shotBeats.has(p.spec.id);
  });
  return Option.map(
    Option.all(
      read.map((p) =>
        Option.map(Option.fromUndefinedOr(input.beats.get(p.spec.id)), (key) => ({
          key,
          start: atFrames(p.start, fps, from),
        })),
      ),
    ),
    (beats) =>
      sha256Hex(
        Schema.encodeSync(SegmentKeyInput)({
          render: input.render,
          place: Option.liftPredicate(from, () => pinned),
          frames: to - from,
          beats,
          shots: seen.map((s) => s.read),
        }),
      ),
  );
};

/**
 * The render's frames `[start, end)` split into segments, in order, at its
 * beats' first frames and wherever its frames start or stop reading the
 * film's seconds, each keyed by what its frames read (`segmentKey`).
 */
export const beatSegments = (input: SegmentsInput): ReadonlyArray<Segment> => {
  const { start, end, placed } = input;
  const fps = input.render.fps;
  const turns = Array.from(
    { length: Math.max(0, end - start - 1) },
    (_, k) => start + 1 + k,
  ).filter((i) => input.filmTimed(i) !== input.filmTimed(i - 1));
  const edges = Arr.dedupe(
    [
      start,
      ...placed.map((p) => beatFrames(p, fps).from).filter((f) => f > start && f < end),
      ...turns,
      end,
    ].toSorted((a, b) => a - b),
  );
  return Arr.zip(edges, edges.slice(1)).map(([from, to]) => {
    const timed = input.filmTimed(from);
    return { from, to, key: segmentKey(input, from, to, timed), pinned: timed };
  });
};

/** Where a film's segments are kept: `out/<film>/cache/segments`, a folder its catalogue never lists. */
export const segmentsFolder = (project: string): string => `${project}/cache/segments`;

/** A chunk of a kept segment: its frames counted from the segment's first, and the names of the copies it holds in the segment's folder. */
const KeptChunk = Schema.Struct({
  from: Schema.Int,
  to: Schema.Int,
  master: Schema.OptionFromOptionalKey(Schema.String),
  share: Schema.OptionFromOptionalKey(Schema.String),
});
type KeptChunk = typeof KeptChunk.Type;

/**
 * A kept segment's record, `<key>/segment.json`: its chunks in frame order,
 * and `used`, when a render last drew or reused it (ms since the epoch). A
 * record written before renders marked it has no `used`: its file's mtime
 * stands in (`lastUsed`).
 */
const KeptSegmentJson = Schema.fromJsonString(
  Schema.Struct({
    chunks: Schema.Array(KeptChunk),
    used: Schema.OptionFromOptionalKey(Schema.Finite),
  }),
);

/**
 * A chunk's files in a kept segment's folder, named by its frames counted
 * from the segment's first, wherever the segment sits in the film:
 * `<from>-<to>.mp4`, its share copy `<from>-<to>.share.mp4`. Two renders
 * that cut a segment into other chunks write other files, so a file holds
 * the frames its name says whichever render wrote it last, and a record
 * never names a file another render drew other frames into.
 */
export const keptNames = (from: number, to: number) => ({
  master: `${from}-${to}.mp4`,
  share: `${from}-${to}.share.mp4`,
});

/** The folder segment `key` is kept in, under the film's `folder` (`segmentsFolder`). */
export const keptFolder = (folder: string, key: string): string => `${folder}/${key}`;

/** Segment `key`'s record under `folder`, `<key>/segment.json`. */
const recordOf = (path: Path.Path, folder: string, key: string): string =>
  path.join(keptFolder(folder, key), 'segment.json');

/** Segment `key`'s record under `folder`, its chunks named as kept, written whole with `used` as its last use. */
const writeRecord = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
  chunks: ReadonlyArray<KeptChunk>,
  used: number,
): Effect.Effect<void, PlatformError> => {
  const record = Schema.encodeSync(KeptSegmentJson)({ chunks, used: Option.some(used) });
  const file = recordOf(path, folder, key);
  return writeWhole(fs, file, (partial) => fs.writeFileString(partial, record));
};

/** Whether every chunk of a segment holds each of `copies`. */
const holdsAll = (chunks: ReadonlyArray<KeptChunk>, copies: Copies): boolean =>
  chunks.every(
    (c) =>
      (!hasMaster(copies) || Option.isSome(c.master)) &&
      (!hasShare(copies) || Option.isSome(c.share)),
  );

/**
 * Segment `key`'s chunks as kept under `folder` (their frames counted from
 * its first), their files by path, its
 * record marked used at `used`, or at the mark it holds when that is later
 * (a mark never goes back); none when it was never kept whole (no record),
 * a chunk of it lacks one of `copies` (the copies the render writes), or a
 * file it lists is gone. The render calls it holding the film's cache
 * (`holdCache`), so no prune runs between the mark and the join.
 */
export const reuseSegment = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
  copies: Copies,
  used: number,
): Effect.Effect<Option.Option<ReadonlyArray<KeptChunk>>, PlatformError> =>
  Effect.gen(function* () {
    const dir = keptFolder(folder, key);
    const record = recordOf(path, folder, key);
    if (!(yield* fs.exists(record))) return Option.none();
    const read = Schema.decodeOption(KeptSegmentJson)(yield* fs.readFileString(record));
    if (Option.isNone(read)) return Option.none();
    if (!holdsAll(read.value.chunks, copies)) return Option.none();
    const chunks = read.value.chunks.map((c) => ({
      ...c,
      master: Option.map(c.master, (m) => path.join(dir, m)),
      share: Option.map(c.share, (s) => path.join(dir, s)),
    }));
    const files = chunks.flatMap((c) => [...Option.toArray(c.master), ...Option.toArray(c.share)]);
    const there = yield* Effect.forEach(files, (file) => fs.exists(file));
    if (!there.every(Boolean)) return Option.none();
    const later = Math.max(
      used,
      Option.getOrElse(read.value.used, () => used),
    );
    yield* writeRecord(fs, path, folder, key, read.value.chunks, later);
    return Option.some(chunks);
  });

/**
 * Segment `key` recorded as kept under `folder`, its `chunks` (their frames
 * counted from its first, their files named by `keptNames`, already in its
 * folder: its master and its share copy where each says it holds one) in
 * frame order, used at `used`. Written last and whole, so a segment is
 * found only once every chunk of it is there.
 */
export const keepSegment = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
  chunks: ReadonlyArray<{
    readonly from: number;
    readonly to: number;
    readonly master: boolean;
    readonly share: boolean;
  }>,
  used: number,
): Effect.Effect<void, PlatformError> =>
  writeRecord(
    fs,
    path,
    folder,
    key,
    chunks.map((c) => {
      const names = keptNames(c.from, c.to);
      return {
        from: c.from,
        to: c.to,
        master: Option.map(Option.liftPredicate(c.master, Boolean), () => names.master),
        share: Option.map(Option.liftPredicate(c.share, Boolean), () => names.share),
      };
    }),
    used,
  );

/**
 * Segment `key` no longer kept under `folder`: its record gone, so no render
 * finds it until one draws it whole again. A render drops the record of each
 * segment it draws before it draws it (a `--fresh` render, of every one), so
 * one cut off leaves none of what it was told not to trust, and a folder a
 * render is drawing into has no record: a prune never takes it. Answers the
 * last use the record held (`used`), so the render that draws the segment
 * again keeps it when it is later than its own; none when there was no
 * record, or none that reads.
 */
export const dropSegment = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
): Effect.Effect<Option.Option<number>, PlatformError> =>
  Effect.gen(function* () {
    const record = recordOf(path, folder, key);
    const text = yield* Effect.option(fs.readFileString(record));
    yield* fs.remove(record, { force: true });
    return Option.flatMap(
      Option.flatMap(text, Schema.decodeOption(KeptSegmentJson)),
      (read) => read.used,
    );
  });

/**
 * When segment `key`'s record under `folder` says a render last used it: its
 * `used`; for a record with none, or one that does not read, its file's
 * mtime, else never (0).
 */
export const lastUsed = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
): Effect.Effect<number, PlatformError> =>
  Effect.gen(function* () {
    const record = recordOf(path, folder, key);
    const read = Schema.decodeOption(KeptSegmentJson)(yield* fs.readFileString(record));
    const marked = Option.flatMap(read, (r) => r.used);
    if (Option.isSome(marked)) return marked.value;
    const info = yield* fs.stat(record);
    return Option.getOrElse(
      Option.map(info.mtime, (at) => at.getTime()),
      () => 0,
    );
  });

/** Whether segment `key` under `folder` has its record: kept whole, not a folder a render is drawing. */
export const isKept = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
): Effect.Effect<boolean, PlatformError> => fs.exists(recordOf(path, folder, key));
