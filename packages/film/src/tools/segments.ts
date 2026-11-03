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
import { type ShotSeen, boardClock, shotsSeen } from '../core/board-render.ts';
import { type Placed, transitionDur } from '../core/layout.ts';
import { TICKS_PER_FRAME, frameAtOrAfter } from '../core/time.ts';
import { writeWhole } from './content-store.ts';
import { sha256Hex } from './digest.ts';

export interface RenderRead {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly scale: number;
  readonly encoder: string;
  readonly captions: boolean;
  readonly picture: ReadonlyArray<string>;
  readonly agent: string;
  readonly platform: string;
}

export interface BoardRead {
  readonly shots: ReadonlyArray<Shot>;
  readonly duration: number;
  readonly images: ReadonlyMap<string, string>;
}

export interface Segment {
  readonly from: number;
  readonly to: number;
  readonly key: Option.Option<string>;
  readonly pinned: boolean;
}

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

const ShotRead = Schema.Struct({
  beat: Schema.String,
  from: Schema.Int,
  at: Schema.OptionFromOptionalKey(Schema.Int),
  seen: Schema.Int,
  gone: Schema.Int,
  motion: Schema.Struct({ _tag: Schema.String, dir: Schema.optionalKey(Schema.Finite) }),
  panel: Schema.OptionFromOptionalKey(PanelRead),
});

const BeatAt = Schema.Struct({ key: Schema.String, start: Schema.Int });

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
    place: Schema.OptionFromOptionalKey(Schema.Int),
    frames: Schema.Int,
    beats: Schema.Array(BeatAt),
    shots: Schema.Array(ShotRead),
  }),
);

const fromFirst = (tick: number, from: number): number => tick - from * TICKS_PER_FRAME;

const shotRead = (seen: ShotSeen, images: ReadonlyMap<string, string>, from: number) =>
  Shot.$match(seen.shot, {
    Unboarded: ({ beat }) => ({
      beat,
      from: fromFirst(seen.shown, from),
      at: Option.none<number>(),
      seen: fromFirst(seen.seen, from),
      gone: fromFirst(seen.gone, from),
      motion: seen.motion,
      panel: Option.none(),
    }),
    Boarded: ({ beat, panel }) => ({
      beat,
      from: fromFirst(seen.shown, from),
      at: Option.some(fromFirst(seen.mark, from)),
      seen: fromFirst(seen.seen, from),
      gone: fromFirst(seen.gone, from),
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

const firstFrame = (p: Placed, fps: number): number => frameAtOrAfter(p.start, fps);

const beatFrames = (placed: ReadonlyArray<Placed>, p: Placed, fps: number) => ({
  from: firstFrame(p, fps),
  to: Option.match(Arr.get(placed, p.index + 1), {
    onNone: () => frameAtOrAfter(p.start + p.dur, fps),
    onSome: (next) => firstFrame(next, fps),
  }),
});

const entersOver = (p: Placed, fps: number, from: number, to: number): boolean => {
  const tr = transitionDur(p.spec.enter);
  return (
    p.index > 0 && tr > 0 && firstFrame(p, fps) < to && frameAtOrAfter(p.start + tr, fps) > from
  );
};

interface SegmentsInput {
  readonly placed: ReadonlyArray<Placed>;
  readonly start: number;
  readonly end: number;
  readonly render: RenderRead;
  readonly beats: ReadonlyMap<string, string>;
  readonly board: Option.Option<BoardRead>;
  readonly filmTimed: (i: number) => boolean;
}

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
      shotsSeen(
        boardClock(board.shots, input.placed, board.duration, fps),
        from * TICKS_PER_FRAME,
        to * TICKS_PER_FRAME,
      ).map((s) => ({
        seen: s,
        read: shotRead(s, board.images, from),
      })),
  });
  const shotBeats = new Set(seen.map((s) => s.seen.shot.beat));
  const placed = input.placed;
  const inside = placed.filter((p) => {
    const frames = beatFrames(placed, p, fps);
    return frames.from < to && frames.to > from;
  });
  const entered = new Set(
    inside
      .filter((p) => entersOver(p, fps, from, to))
      .flatMap((p) => Option.toArray(Arr.get(placed, p.index - 1)).map((q) => q.spec.id)),
  );
  const read = placed.filter(
    (p) => inside.includes(p) || shotBeats.has(p.spec.id) || entered.has(p.spec.id),
  );
  return Option.map(
    Option.all(
      read.map((p) =>
        Option.map(Option.fromUndefinedOr(input.beats.get(p.spec.id)), (key) => ({
          key,
          start: firstFrame(p, fps) - from,
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
      ...placed.map((p) => firstFrame(p, fps)).filter((f) => f > start && f < end),
      ...turns,
      end,
    ].toSorted((a, b) => a - b),
  );
  return Arr.zip(edges, edges.slice(1)).map(([from, to]) => {
    const timed = input.filmTimed(from);
    return { from, to, key: segmentKey(input, from, to, timed), pinned: timed };
  });
};

export const segmentsFolder = (project: string): string => `${project}/cache/segments`;

const KeptChunk = Schema.Struct({
  from: Schema.Int,
  to: Schema.Int,
  master: Schema.OptionFromOptionalKey(Schema.String),
  share: Schema.OptionFromOptionalKey(Schema.String),
});
type KeptChunk = typeof KeptChunk.Type;

const KeptSegmentJson = Schema.fromJsonString(
  Schema.Struct({
    chunks: Schema.Array(KeptChunk),
    used: Schema.OptionFromOptionalKey(Schema.Finite),
  }),
);

export const keptNames = (from: number, to: number) => ({
  master: `${from}-${to}.mp4`,
  share: `${from}-${to}.share.mp4`,
});

export const keptFolder = (folder: string, key: string): string => `${folder}/${key}`;

const recordOf = (path: Path.Path, folder: string, key: string): string =>
  path.join(keptFolder(folder, key), 'segment.json');

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

const holdsAll = (chunks: ReadonlyArray<KeptChunk>, copies: Copies): boolean =>
  chunks.every(
    (c) =>
      (!hasMaster(copies) || Option.isSome(c.master)) &&
      (!hasShare(copies) || Option.isSome(c.share)),
  );

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

export const isKept = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
  key: string,
): Effect.Effect<boolean, PlatformError> => fs.exists(recordOf(path, folder, key));
