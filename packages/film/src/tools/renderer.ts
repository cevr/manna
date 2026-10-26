// Render a film frame by frame in headless Chromium. Every frame is a pure
// function of time, so pages render any chunk in any order: a video splits
// into chunks on a queue that idle pages pull from, each page drawing and
// encoding its chunk to its own H.264 MP4, then the chunks join in order
// (copied, not re-encoded) with the audio cut from the lossless master and
// encoded to AAC. A video of the film, an act or a scene keeps each beat's
// chunks under the film's project folder by what its frames read
// (`segments.ts`) and draws only the beats it has not kept; once done, it
// deletes the film's segments no render has used for a week. The server, the
// browser and every page (a pool of `Pages`) live in one scope: a failure, or
// Ctrl-C, closes them all.

import { availableParallelism } from 'node:os';
import {
  Array as Arr,
  Boolean as Bool,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Ref,
  Result,
  Schema,
  Scope,
  Semaphore,
} from 'effect';
import { BoardFileJson, shownTry } from '../core/board.ts';
import type { PlatformError } from 'effect/PlatformError';
import { type Pcm, splice } from '../core/audio.ts';
import {
  type Encoder,
  EncoderChoice,
  encoderCandidates,
  encoderName,
  type Copies,
  copiesInPage,
  hasMaster,
  hasShare,
} from '../core/encoder.ts';
import { filmCaptions, shortCaptions, webVtt } from '../core/captions.ts';
import { Picture, boardShots, pictureParams } from '../core/board-render.ts';
import type { RenderSound } from '../core/catalogue.ts';
import type { ChunkTiming, ExportInfo } from '../core/export-handle.ts';
import type { ShortError } from '../core/errors.ts';
import { type Placed, everyTakeRecorded, filmEnd } from '../core/layout.ts';
import {
  type FilmPiece,
  type ResolvedShort,
  resolveShort,
  shortPage,
  shortPieces,
} from '../core/shorts.ts';
import { secondsAt } from '../core/time.ts';
import { type FramePage, type PageOpenError, makeBrowser } from './browser.ts';
import { type MediaFailed } from '../core/refusals.ts';
import {
  type AudioMissing,
  type AudioStale,
  type BrowserMissing,
  type ContactFailed,
  type EncodeFailed,
  EncoderMissing,
  type FrameFailed,
  type LookbookFailed,
  type PageCrashed,
  type PageError,
  PageRateDiffers,
  RangeEmpty,
  type CacheEscapes,
  type TooManyEncoders,
} from './errors.ts';
import { writeWhole } from './content-store.ts';
import {
  PRUNE_DAYS,
  forgetRender,
  holdCache,
  pruneHeld,
  recordRender,
  widenRecord,
} from './segment-cache.ts';
import { sha256OfFile } from './digest.ts';
import {
  type BoardRead,
  type RenderRead,
  type Segment,
  beatSegments,
  dropSegment,
  keepSegment,
  keptFolder,
  keptNames,
  reuseSegment,
  segmentsFolder,
} from './segments.ts';
import { type LoadedFilm, type PlaceError, masterFile, placeFilm } from './film-repo.ts';
import { filmChapters } from './look.ts';
import { Media, type MediaService } from './media.ts';
import { masterFinding, planKey, readMaster } from './mixer.ts';
import { type ExportPages, Pages } from './pages.ts';
import { PreviewServer } from './preview-server.ts';
import { SoundRender } from './sound-render.ts';
import {
  type AudioCut,
  type Chunk,
  Cut,
  JOIN_FADE,
  RenderJob,
  type RenderOutput,
  Reuse,
  type SegmentChunk,
  segmentChunks,
  captionsName,
  chaptersName,
  contactSheetName,
  descriptionName,
  cutPage,
  imagesOutput,
  lookbookName,
  contactTimes,
  frameAt,
  frameSpan,
  renderPaths,
  segmentName,
  shareName,
  encoderLimits,
  stillName,
  videoDescription,
  videoEncoders,
  videoWorkers,
} from './render-plan.ts';
import { soundCredits } from '../core/sfx.ts';

/**
 * The cores this machine has: a software encoder takes one each, so they
 * bound a software render's encoders (`encoderLimits`). Tests set it.
 */
export const Cores = Context.Reference<number>('@manna/film/tools/Cores', {
  defaultValue: () => availableParallelism(),
});

/**
 * The platform the render runs on (`process.platform`): it decides which
 * encoders a render may use (`encoderCandidates`). Tests set it.
 */
export const Platform = Context.Reference<string>('@manna/film/tools/Platform', {
  defaultValue: () => process.platform,
});

/**
 * The first of `candidates` `page` can encode the film with at `scale` into
 * each of `copies`; `EncoderMissing` when none can.
 */
const pageEncoder = (
  page: FramePage,
  scale: number,
  copies: Copies,
  candidates: ReadonlyArray<Encoder>,
) =>
  page.call('encoder', scale, copies, candidates).pipe(
    Effect.flatMap((choice) =>
      EncoderChoice.match(choice, {
        Hardware: (found) => Effect.succeed<Encoder>(found),
        Software: (found) => Effect.succeed<Encoder>(found),
        Missing: ({ reason }) => Effect.fail(EncoderMissing.make({ reason })),
      }),
    ),
  );

/** How the doctor's encoder check can fail. */
export type EncoderReadyError = PageOpenError | PageError | PageCrashed | EncoderMissing;

/**
 * The doctor's encoder line: the encoder the app's player (its first film,
 * at full size, with its share copy) chooses in headless Chromium among the
 * platform's, as a render's first page does, and the pages a render opens
 * on it by default.
 */
export const encoderReady: Effect.Effect<
  string,
  EncoderReadyError | BrowserMissing,
  PreviewServer | FileSystem.FileSystem | Path.Path
> = Effect.scoped(
  Effect.gen(function* () {
    const server = yield* PreviewServer;
    // Pages of its own, so the doctor's other lines print when Chrome is missing.
    const browser = yield* makeBrowser;
    const page = yield* browser.open(`${server.url}?export`);
    const candidates = encoderCandidates(Option.none());
    const encoder = yield* pageEncoder(page, 1, 'master+share', candidates);
    const cores = yield* Cores;
    const { workers, max } = encoderLimits(encoder, cores);
    return `${encoderName(encoder)} H.264, ${workers} pages by default, at most ${max} encoders at once (${cores} cores)`;
  }),
).pipe(Effect.withSpan('Renderer.encoderReady'));

type RenderError =
  | PageOpenError
  | PageError
  | PageCrashed
  | FrameFailed
  | LookbookFailed
  | ContactFailed
  | EncoderMissing
  | EncodeFailed
  | MediaFailed
  | AudioMissing
  | AudioStale
  | RangeEmpty
  | PageRateDiffers
  | TooManyEncoders
  | PlaceError
  | ShortError
  | CacheEscapes
  | Schema.SchemaError
  | PlatformError;

/**
 * Where a chunk's page time went, in ms: drawing its frames, encoding them
 * (the rest of the page's call) and carrying the bytes out of the page (the
 * call's wall time past the page's own), over its `frames`.
 */
interface ChunkTime {
  readonly frames: number;
  readonly draw: number;
  readonly encode: number;
  readonly transfer: number;
}

const noTime: ChunkTime = { frames: 0, draw: 0, encode: 0, transfer: 0 };

/** `chunk`'s time from the page's own account (`ChunkTiming`) and the call's `wall` ms. */
const chunkTime = (chunk: Chunk, timing: ChunkTiming, wall: number): ChunkTime => ({
  frames: chunk.to - chunk.from,
  draw: timing.draw,
  encode: timing.page - timing.draw,
  transfer: Math.max(0, wall - timing.page),
});

const addTime = (a: ChunkTime, b: ChunkTime): ChunkTime => ({
  frames: a.frames + b.frames,
  draw: a.draw + b.draw,
  encode: a.encode + b.encode,
  transfer: a.transfer + b.transfer,
});

/** A log line's ms a frame, drawing, encoding and in transfer: `draw_ms=… encode_ms=… transfer_ms=…`. */
const perFrame = (t: ChunkTime): string => {
  const each = (ms: number) => (ms / Math.max(1, t.frames)).toFixed(1);
  return `draw_ms=${each(t.draw)} encode_ms=${each(t.encode)} transfer_ms=${each(t.transfer)}`;
};

/** The film and short a render draws. */
interface Where {
  readonly placed: ReadonlyArray<Placed>;
  /** The short, resolved on the page's frames, when the render is one. */
  readonly short: Option.Option<ResolvedShort>;
}

interface RendererService {
  /**
   * Draw `job` into the film's project folder (`renderPaths`), or a video to
   * its `--out`, and say what it wrote.
   */
  readonly render: (film: LoadedFilm, job: RenderJob) => Effect.Effect<RenderOutput, RenderError>;
  /**
   * A run of many renders (`project render`'s scenes): videos that draw the
   * same page the same way are probed once and drawn on one pool of pages,
   * open until the caller's scope closes.
   */
  readonly session: Effect.Effect<RenderSession, never, Scope.Scope>;
}

/** Renders that share their probe and their pages (`RendererService.session`). */
interface RenderSession {
  readonly render: (film: LoadedFilm, job: RenderJob) => Effect.Effect<RenderOutput, RenderError>;
}

/**
 * What one page says of a video before its pool opens: what it draws, which
 * of its frames read the film's own seconds (`filmTimed`, from its first),
 * and the encoder every page uses.
 */
interface Probed {
  readonly info: ExportInfo;
  readonly short: Option.Option<ResolvedShort>;
  readonly scale: number;
  readonly encoder: Encoder;
  readonly filmTimed: ReadonlyArray<boolean>;
}

/**
 * How a video gets its probe and its pages: made for it alone (`render`), or
 * kept by a session under a key naming what they were made for.
 */
interface Drawing {
  readonly probe: <E>(key: string, make: Effect.Effect<Probed, E>) => Effect.Effect<Probed, E>;
  readonly pool: <E>(
    key: string,
    open: Effect.Effect<ExportPages, E, Scope.Scope>,
  ) => Effect.Effect<ExportPages, E, Scope.Scope>;
}

/** What a video's probe was made for: two videos alike in all of it share one. */
const probeKey = (
  page: string,
  job: Extract<RenderJob, { _tag: 'Video' }>,
  platform: string,
): string => {
  const asked = Option.match(job.encoder, { onNone: () => 'any', onSome: (e) => e._tag });
  const server = Option.getOrElse(job.server, () => 'preview');
  return `${page}|captions=${job.captions}|scale=${job.scale}|copies=${job.copies}|encoder=${asked}|server=${server}|picture=${pictureParams(job.picture).join('+')}|${platform}`;
};

/**
 * The beat keys a video's segments are kept by, and whether it draws them
 * all again (`--fresh`): a film's, an act's or a scene's on the film's own
 * page; none for a short (its own page and clock) or a wedge's look.
 */
const reuseOf = (job: Extract<RenderJob, { _tag: 'Video' }>) =>
  Reuse.$match(job.reuse, {
    Off: () => Option.none(),
    Keyed: ({ beats, fresh }) =>
      Option.liftPredicate(
        { beats, fresh },
        () => Cut.$is('Whole')(job.cut) && Option.isNone(job.server),
      ),
  });

/** Each video its own probe and its own pages, closed with it. */
const alone: Drawing = { probe: (_, make) => make, pool: (_, open) => open };

/** A recorded video whose sound is cut again: its files, and the pieces of the master it carries. */
export interface Remuxed {
  readonly clip: string;
  readonly share: Option.Option<string>;
  readonly pieces: ReadonlyArray<FilmPiece>;
}

/**
 * The film's master checked, before anything is drawn or cut, against the
 * film it must cover (`seconds`, to within one of its frames) and the plan the film
 * mixes to now, its placed code sounds measured through the sound renderer:
 * that plan's key (none when it does not build).
 */
const masterChecked = (
  fs: FileSystem.FileSystem,
  media: MediaService,
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  seconds: number,
) =>
  Effect.gen(function* () {
    const master = yield* readMaster(fs, media, film.paths);
    const tolerance = secondsAt(1, film.fps);
    const key = yield* planKey(film, placed).pipe(Effect.provideService(FileSystem.FileSystem, fs));
    const finding = masterFinding(masterFile(film.paths), master, { seconds, key }, tolerance);
    if (Option.isSome(finding)) return yield* finding.value;
    return key;
  });

/**
 * A page of `film` that draws at the rate the film declares, the one the
 * tools laid it at (`LoadedFilm.fps`): else `PageRateDiffers`, before a frame
 * is drawn, since its beats would start on frames the segment keys and the
 * mix do not place them on.
 */
const declaredRate = (film: LoadedFilm, page: number) =>
  Effect.when(
    Effect.fail(PageRateDiffers.make({ film: film.paths.name, page, declared: film.fps })),
    Effect.succeed(page !== film.fps),
  );

/** `pcm` cut at `pieces`, each join faded, and encoded to AAC once. */
const cutTrack = (media: MediaService, pcm: Pcm, pieces: ReadonlyArray<FilmPiece>) =>
  media.encodeAac(
    splice(
      pcm,
      pieces.map((piece) => ({
        from: Math.round(piece.start * pcm.rate),
        frames: Math.round(piece.duration * pcm.rate),
      })),
      Math.round(JOIN_FADE * pcm.rate),
    ),
  );

/** The master cut at `cut`'s pieces, each join faded, and encoded to AAC once. */
const trackCut = (media: MediaService, cut: AudioCut) =>
  media.decode(cut.file).pipe(Effect.flatMap((pcm) => cutTrack(media, pcm, cut.pieces)));

/**
 * A run's re-muxes of `film`'s recorded videos: each video's sound cut again
 * from the film's master now, at the pieces it recorded, its pictures (and
 * its share copy's) copied, no page opened, nothing drawn, so it needs no
 * browser; the sound the video now carries is the answer. The master is
 * checked here, as a render checks it, and decoded once for every video the
 * run re-muxes; a run that re-muxes none makes no remuxer.
 */
export const remuxer = Effect.fn('film.remuxer')(function* (film: LoadedFilm) {
  const fs = yield* FileSystem.FileSystem;
  const media = yield* Media;
  const placed = yield* placeFilm(film);
  const mix = yield* masterChecked(fs, media, film, placed, filmEnd(placed));
  const pcm = yield* media.decode(masterFile(film.paths));
  return Effect.fn('film.remux')(function* (video: Remuxed) {
    const track = yield* cutTrack(media, pcm, video.pieces);
    // The share copy takes the same track, as a render gives both.
    yield* Effect.forEach([video.clip, ...Option.toArray(video.share)], (file) =>
      media.remux(file, track),
    );
    yield* Effect.log(
      `render.remux frames_drawn=0 pieces=${video.pieces.length} mix=${Option.getOrElse(mix, () => 'none').slice(0, 12)} file=${video.clip} share=${Option.getOrElse(video.share, () => 'none')}`,
    );
    const sound: RenderSound = { mix, pieces: video.pieces };
    return sound;
  });
});

/** One video re-muxed in a run (`remuxer`). */
export type Remux = Effect.Success<ReturnType<typeof remuxer>>;

export class Renderer extends Context.Service<Renderer, RendererService>()(
  '@manna/film/tools/Renderer',
) {
  static readonly layer = Layer.effect(
    Renderer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const media = yield* Media;
      const pages = yield* Pages;
      const sounds = yield* SoundRender;

      // Every file a render leaves is written beside itself and renamed over
      // its place once whole, so a failed or interrupted render never leaves
      // a torn file where the last good one was (the clips: `Media`).
      const textWhole = (file: string, text: string) =>
        writeWhole(fs, file, (partial) => fs.writeFileString(partial, text));
      const bytesWhole = (file: string, bytes: Uint8Array) =>
        writeWhole(fs, file, (partial) => fs.writeFile(partial, bytes));

      const checkedMaster = (film: LoadedFilm, placed: ReadonlyArray<Placed>, seconds: number) =>
        masterChecked(fs, media, film, placed, seconds).pipe(
          Effect.provideService(SoundRender, sounds),
        );
      const trackOf = (cut: AudioCut) => trackCut(media, cut);

      /**
       * What a Board render reads of `film`'s Board, from the files its page
       * is served (`boardFile`): its shots on `placed`'s clock, and the
       * sha256 of each shown try's image as it is on disk. None for the scenes.
       */
      const boardOf = (
        film: LoadedFilm,
        picture: Picture,
        placed: ReadonlyArray<Placed>,
        duration: number,
      ) =>
        Picture.$match(picture, {
          Scenes: () => Effect.succeed(Option.none<BoardRead>()),
          Board: () =>
            Effect.gen(function* () {
              const text = yield* fs.readFileString(path.join(film.paths.dir, 'board.json'));
              const board = yield* Schema.decodeEffect(BoardFileJson)(text);
              const files = Arr.dedupe(
                board.panels.flatMap((p) =>
                  Option.toArray(
                    Option.map(
                      Option.filter(shownTry(p), () => Predicate.isUndefined(p.text)),
                      (t) => t.file,
                    ),
                  ),
                ),
              );
              const hashes = yield* Effect.forEach(
                files,
                (file) =>
                  Effect.map(
                    Effect.option(sha256OfFile(fs, path.join(film.paths.dir, 'board', file))),
                    (hash) => Option.map(hash, (sha) => [file, sha] as const),
                  ),
                { concurrency: 8 },
              );
              const read: BoardRead = {
                shots: boardShots(placed, board),
                duration,
                images: new Map(hashes.flatMap(Option.toArray)),
              };
              return Option.some(read);
            }),
        });

      /** The short on a page's clock: the same spans, on the same frames, it draws. */
      const shortOn = (placed: ReadonlyArray<Placed>, cut: Cut) =>
        Cut.$match(cut, {
          Whole: () => Effect.succeedNone,
          Short: ({ short }) => Effect.asSome(Effect.fromResult(resolveShort(placed, short))),
        });

      const video = Effect.fnUntraced(function* (
        film: LoadedFilm,
        job: Extract<RenderJob, { _tag: 'Video' }>,
        page: string,
        placed: ReadonlyArray<Placed>,
        clip: string,
        drawing: Drawing,
      ) {
        // One page first says what the render draws and which encoder every
        // page encodes with: the pages, and the encoders they may run, are
        // sized from that choice before the pool opens.
        const platform = yield* Platform;
        const made = probeKey(page, job, platform);
        const { info, short, scale, encoder, filmTimed } = yield* drawing.probe(
          made,
          Effect.scoped(
            Effect.gen(function* () {
              const first = yield* pages.open(page, {
                workers: 1,
                captions: job.captions,
                server: job.server,
                picture: job.picture,
              });
              yield* declaredRate(film, first.info.fps);
              const found = yield* shortOn(placed, job.cut);
              // A short's page is 9:16 at the film's density: it encodes down to 1080 × 1920.
              const k = Option.match(found, {
                onNone: () => job.scale,
                onSome: () => shortPage(first.info.width).scale * job.scale,
              });
              // Before a frame is drawn: a browser that cannot encode the film with
              // one of the encoders the render allows fails here.
              const candidates = encoderCandidates(job.encoder);
              const by = yield* first.use((one) => pageEncoder(one, k, job.copies, candidates));
              const timed = yield* first.use((one) => one.call('filmTimed', 0, first.info.frames));
              const probed: Probed = {
                info: first.info,
                short: found,
                scale: k,
                encoder: by,
                filmTimed: timed,
              };
              return probed;
            }),
          ),
        );
        const where: Where = { placed, short };
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({
            from: secondsAt(start, info.fps),
            to: secondsAt(end, info.fps),
          });
        const total = end - start;
        const target = Option.getOrElse(job.out, () => clip);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        const range = { from: secondsAt(start, info.fps), to: secondsAt(end, info.fps) };

        // The film declares its track only once every take is recorded (a
        // short's page declares none: it plays the film's under its spans).
        // Before a frame is drawn, its master must be there, cover the whole
        // film to within a frame and be mixed for the plan the film plays
        // now: a mix cut short would otherwise mux silence, and one made
        // before a score pick or a re-take the wrong sound.
        const recorded = Option.match(where.short, {
          onNone: () => Option.isSome(Option.fromNullishOr(info.audio)),
          onSome: () => everyTakeRecorded(where.placed),
        });
        const audio: Option.Option<AudioCut> = Option.map(
          Option.liftPredicate(recorded, Boolean),
          () => ({
            file: masterFile(film.paths),
            pieces: Option.match(where.short, {
              onNone: () => [{ start: range.from, duration: range.to - range.from }],
              onSome: (short) => shortPieces(short, range.from, range.to),
            }),
          }),
        );
        const seconds = Option.match(where.short, {
          onNone: () => info.duration,
          onSome: () => filmEnd(where.placed),
        });
        const sound = yield* Option.match(audio, {
          onNone: () => Effect.succeedNone,
          onSome: (cut) =>
            checkedMaster(film, where.placed, seconds).pipe(
              Effect.map((mix): RenderSound => ({ mix, pieces: cut.pieces })),
              Effect.asSome,
            ),
        });

        // Before the pool opens: pages past the encoders this encoder runs at once would hang
        // (hardware) or fight for the cores (software).
        const cores = yield* Cores;
        const workers = videoWorkers(job.workers, encoder, cores);
        const encoders = yield* Effect.fromResult(
          videoEncoders(workers, job.copies, encoder, cores),
        );
        yield* Effect.log(
          `render.encoder kind=${encoderName(encoder)} workers=${workers} encoders=${encoders} cores=${cores}`,
        );
        /** The pages the chunks are drawn on, opened only when there is a chunk to draw. */
        const openPool = drawing.pool(
          `${made}|workers=${workers}`,
          pages.open(page, {
            workers,
            captions: job.captions,
            server: job.server,
            picture: job.picture,
          }),
        );

        // The track, cut and encoded once beside the pages; both joins copy its packets.
        const aac = Option.match(audio, {
          onNone: () => Effect.succeedNone,
          onSome: (cut) => Effect.asSome(trackOf(cut)),
        });

        // A chunk of no kept segment (a short's, a wedge's) goes in a folder
        // of this render's own, made fresh by the system, so two renders at
        // once never share one. It lives in the render's scope: joined,
        // failed or interrupted, the render takes it with it.
        const work = yield* fs.makeTempDirectoryScoped({ prefix: 'film-segments-' });
        const segDir = path.join(work, 'segments');
        const shareDir = path.join(work, 'share');
        // The copies the page encodes, chunk by chunk: the hardware encoder makes the share copy there.
        const copies = copiesInPage(job.copies, encoder);

        // The frames split at the beats into segments, each kept by its key
        // under the film's project folder: a render draws only the segments
        // it finds no kept copy of. A short, or a wedge's look, draws all its
        // frames as one segment and keeps none.
        const keeping = reuseOf(job);
        const folder = segmentsFolder(film.paths.out);
        const whole: ReadonlyArray<Segment> = [
          { from: start, to: end, key: Option.none(), pinned: true },
        ];
        /** How every frame is drawn and encoded: what each segment's key holds beside its beats. */
        const read: RenderRead = {
          width: info.width,
          height: info.height,
          fps: info.fps,
          scale,
          encoder: encoderName(encoder),
          captions: job.captions,
          picture: pictureParams(job.picture),
          agent: Option.getOrElse(Option.fromUndefinedOr(info.agent), () => ''),
          platform,
        };
        const segments = yield* Option.match(keeping, {
          onNone: () => Effect.succeed(whole),
          onSome: ({ beats }) =>
            boardOf(film, job.picture, placed, info.duration).pipe(
              Effect.map((board) =>
                beatSegments({
                  placed,
                  start,
                  end,
                  beats,
                  board,
                  render: read,
                  // A frame the page did not answer for is taken to read the film's seconds: its key holds its place.
                  filmTimed: (i) => filmTimed[i] ?? true,
                }),
              ),
              // A Board it cannot read draws every frame: the page names what it cannot read.
              Effect.catch((error) =>
                Effect.as(Effect.logWarning(`render.reuse off reason="${error.message}"`), whole),
              ),
            ),
        });
        const fresh = Option.exists(keeping, (k) => k.fresh);
        /** The services the film's cache is read, held and pruned through. */
        const onDisk = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
        // A render that keeps segments holds the film's cache from before it
        // picks them until it is done, its prune included: no prune deletes
        // what it reads or draws, and another render of the film waits its turn.
        if (Option.isSome(keeping)) yield* onDisk(holdCache(film.paths.out));
        /** This render's mark: each segment it reuses or keeps is recorded as used at it. */
        const used = yield* Clock.currentTimeMillis;
        // --fresh finds no kept copy: it draws every segment again.
        const kept = yield* Effect.forEach(segments, (segment) =>
          Option.match(
            Option.filter(segment.key, () => !fresh),
            {
              onNone: () => Effect.succeedNone,
              onSome: (key) => reuseSegment(fs, path, folder, key, copies, used),
            },
          ),
        );
        /** The segments to draw, each with its place among all of them. */
        const missing = segments.flatMap((segment, at) =>
          Arr.filter([{ ...segment, at }], () => Option.isNone(kept[at] ?? Option.none())),
        );
        // A segment to draw has no record while it is drawn (one whose files
        // are gone, or a --fresh render's, loses its own), so a prune leaves
        // its folder alone; its mark, kept as it is drawn again, is the
        // later of the record's and this render's, so it never goes back.
        const marks = yield* Effect.forEach(missing, (segment) =>
          Option.match(segment.key, {
            onNone: () => Effect.succeed(used),
            onSome: (key) =>
              Effect.map(dropSegment(fs, path, folder, key), (was) =>
                Math.max(
                  used,
                  Option.getOrElse(was, () => used),
                ),
              ),
          }),
        );
        const chunks = segmentChunks(missing, workers);
        const toDraw = chunks.reduce((sum, chunk) => sum + chunk.to - chunk.from, 0);
        if (Option.isSome(keeping))
          yield* Effect.log(
            `render.reuse segments=${segments.length} unpinned=${segments.filter((s) => !s.pinned).length} drawn=${missing.length} frames_drawn=${toDraw} fresh=${fresh}`,
          );
        /** Where a chunk's files go: its segment's kept folder, named by its frames from the segment's first, else this render's own. */
        const filesOf = (chunk: SegmentChunk) =>
          Option.match(
            Option.flatMap(Option.fromUndefinedOr(missing[chunk.segment]), (s) =>
              Option.map(s.key, (key) => ({ key, from: s.from })),
            ),
            {
              onNone: () => ({
                master: path.join(segDir, segmentName(chunk)),
                share: path.join(shareDir, segmentName(chunk)),
              }),
              onSome: ({ key, from }) => {
                const names = keptNames(chunk.from - from, chunk.to - from);
                const dir = keptFolder(folder, key);
                return { master: path.join(dir, names.master), share: path.join(dir, names.share) };
              },
            },
          );
        const began = yield* Clock.currentTimeMillis;
        const done = yield* Ref.make(noTime);
        /** A chunk done: the render's progress, and where this chunk's time went a frame. */
        const progress = (chunk: Chunk, spent: ChunkTime) =>
          Effect.gen(function* () {
            const sum = yield* Ref.updateAndGet(done, (was) => addTime(was, spent));
            const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
            const rate = sum.frames / secs;
            yield* Effect.log(
              `render.progress frames=${sum.frames}/${toDraw} fps=${rate.toFixed(1)} eta=${((toDraw - sum.frames) / rate).toFixed(0)}s chunk=${chunk.index} ${perFrame(spent)}`,
            );
          });

        /** A copy the page made, written whole to `file` in its folder: the file; none for a copy it did not make. */
        const writeCopy = (bytes: Option.Option<Uint8Array>, file: string) =>
          Option.match(bytes, {
            onNone: () => Effect.succeedNone,
            onSome: (made) =>
              fs
                .makeDirectory(path.dirname(file), { recursive: true })
                .pipe(Effect.andThen(bytesWhole(file, made)), Effect.as(Option.some(file))),
          });

        /**
         * One chunk drawn and encoded on whichever page of `pool` is free, to
         * its own files (`filesOf`, each written whole); a crashed page is
         * dropped and the chunk retried once on a fresh one.
         */
        const encode = (pool: ExportPages) => (chunk: SegmentChunk) =>
          pool
            .use((one) =>
              Effect.gen(function* () {
                const sent = yield* Clock.currentTimeMillis;
                const encoded = yield* one.call(
                  'encode',
                  chunk.from,
                  chunk.to,
                  scale,
                  copies,
                  encoder,
                );
                const wall = (yield* Clock.currentTimeMillis) - sent;
                const files = filesOf(chunk);
                const master = yield* writeCopy(encoded.master, files.master);
                const share = yield* writeCopy(encoded.share, files.share);
                yield* progress(chunk, chunkTime(chunk, encoded.timing, wall));
                return { chunk, master, share };
              }),
            )
            .pipe(
              Effect.tapErrorTag('PageCrashed', (error) =>
                Effect.logWarning(`render.retry chunk=${chunk.index} reason="${error.reason}"`),
              ),
              Effect.retry({ times: 1, while: (error) => error._tag === 'PageCrashed' }),
            );

        /** Every chunk drawn on the pool, opened for them; none drawn, no page opened. */
        const drawAll = Arr.match(chunks, {
          onEmpty: () => Effect.succeed([]),
          onNonEmpty: (some) =>
            Effect.flatMap(openPool, (pool) =>
              Effect.forEach(some, encode(pool), { concurrency: workers }),
            ),
        });

        // One structured run: the first failure, a page's or the track's, stops the other.
        const [encoded, track] = yield* Effect.all([drawAll, aac], { concurrency: 'unbounded' });
        // Each segment drawn whole is kept: its record written once all its chunks are there, their
        // frames counted from its first so it joins wherever it sits next.
        yield* Effect.forEach(missing, (segment, k) =>
          Option.match(segment.key, {
            onNone: () => Effect.void,
            onSome: (key) =>
              keepSegment(
                fs,
                path,
                folder,
                key,
                encoded
                  .filter((e) => e.chunk.segment === k)
                  .map((e) => ({
                    from: e.chunk.from - segment.from,
                    to: e.chunk.to - segment.from,
                    master: Option.isSome(e.master),
                    share: Option.isSome(e.share),
                  })),
                marks[k] ?? used,
              ),
          }),
        );
        /** Every chunk of the render in frame order, kept or drawn: its files and its first frame in the film. */
        const all = segments.flatMap((segment, at) =>
          Option.match(kept[at] ?? Option.none(), {
            // A kept chunk's frames count from its segment's first: it plays where the segment now starts.
            onSome: (chunks) =>
              chunks.map((c) => ({
                from: segment.from + c.from,
                master: c.master,
                share: c.share,
              })),
            onNone: () =>
              encoded
                .filter((e) => missing[e.chunk.segment]?.at === at)
                .map((e) => ({ from: e.chunk.from, master: e.master, share: e.share })),
          }),
        );
        const atOf = (from: number) => secondsAt(from - start, info.fps);
        /** The master at `target`, when the render writes one. */
        const masterAt = Option.filter(Option.some(target), () => hasMaster(copies));
        /** The share copy beside it, when the render writes one (the hardware encoder's, made in the page). */
        const shared = Option.filter(Option.some(shareName(target)), () => hasShare(copies));
        /** The file the render's cache record is of: its master, else its share copy. */
        const lead = Bool.match(hasMaster(copies), {
          onTrue: () => target,
          onFalse: () => shareName(target),
        });
        /** The other file a render of `target` records: its share copy when it leads with its master, else its master. */
        const other = Bool.match(hasMaster(copies), {
          onTrue: () => shareName(target),
          onFalse: () => target,
        });
        /** The key of every segment the render used. */
        const keys = segments.flatMap((s) => Option.toArray(s.key));
        // Before it replaces its files (under the cache's lock when it keeps
        // segments), the render widens its lead file's record to name its
        // keys beside the keys the records of both its files name: stopped
        // or failed from here on, it leaves no segment of its own or of the
        // renders before it unnamed. A widen that fails fails the render
        // before any file is replaced.
        yield* onDisk(widenRecord(film.paths.out, lead, [other], used, keys));
        /** One copy's chunks, picked by `copy`, joined in order with the track into `out`. */
        const joined =
          (copy: (c: (typeof all)[number]) => Option.Option<string>) => (out: string) =>
            media.join({
              out,
              segments: all.flatMap((c) =>
                Option.toArray(Option.map(copy(c), (file) => ({ file, at: atOf(c.from) }))),
              ),
              frames: total,
              audio: track,
            });
        yield* Option.match(masterAt, {
          onNone: () => Effect.void,
          onSome: joined((c) => c.master),
        });
        yield* Option.match(shared, { onNone: () => Effect.void, onSome: joined((c) => c.share) });

        const captions = captionsName(target);
        const cues = Option.match(where.short, {
          onNone: () => filmCaptions(where.placed, range),
          onSome: (short) => shortCaptions(where.placed, short, range),
        });
        yield* textWhole(captions, webVtt(cues));
        // The whole film gets its video description; one that declares a look, its YouTube chapters too.
        const full = Option.isNone(where.short) && start === 0 && end === info.frames;
        const chapterLines = yield* Option.match(
          Option.liftPredicate(film, (declared) => full && Option.isSome(declared.look)),
          {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (declared) =>
              Result.match(filmChapters(declared, where.placed), {
                onFailure: (error) =>
                  Effect.as(
                    Effect.logWarning(`render.chapters skipped: ${error.message}`),
                    Arr.empty<string>(),
                  ),
                onSuccess: (lines) => Effect.succeed(lines),
              }),
          },
        );
        const chapters = yield* Option.match(
          Option.liftPredicate(chapterLines, Arr.isReadonlyArrayNonEmpty),
          {
            onNone: () => Effect.succeedNone,
            onSome: (lines) => {
              const file = chaptersName(target);
              return textWhole(file, `${lines.join('\n')}\n`).pipe(
                Effect.andThen(Effect.log(`render.chapters count=${lines.length} file=${file}`)),
                Effect.as(Option.some(file)),
              );
            },
          },
        );
        const credits = Option.match(film.sound, {
          onNone: () => [],
          onSome: (declared) => soundCredits(film.sounds.library, declared),
        });
        const description = yield* Option.match(
          Option.filter(videoDescription(chapterLines, credits), () => full),
          {
            onNone: () => Effect.succeedNone,
            onSome: (text) => {
              const file = descriptionName(target);
              return textWhole(file, text).pipe(
                Effect.andThen(
                  Effect.log(`render.description credits=${credits.length} file=${file}`),
                ),
                Effect.as(Option.some(file)),
              );
            },
          },
        );

        const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
        const spent = yield* Ref.get(done);
        yield* Effect.log(
          `render.done frames=${total} chunks=${chunks.length} audio=${Option.isSome(audio)} secs=${secs.toFixed(1)} fps=${(total / secs).toFixed(1)} ${perFrame(spent)} file=${Option.getOrElse(masterAt, () => 'none')} share=${Option.getOrElse(shared, () => 'none')} captions=${captions}`,
        );
        // Once done (still holding the cache when it keeps segments), the
        // render records the keys it used for its lead file (its master, else
        // its share copy), none when it keeps none, then removes the other
        // file's record. One that keeps segments then prunes the film's: each
        // no render used for PRUNE_DAYS and no record names goes. A record or
        // a prune that fails leaves the render done, its widened record
        // standing.
        yield* onDisk(
          Effect.andThen(
            recordRender(film.paths.out, lead, used, keys),
            forgetRender(film.paths.out, other),
          ),
        ).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`render.cache.record failed file=${lead} reason="${error.message}"`),
          ),
        );
        if (Option.isSome(keeping)) {
          const now = yield* Clock.currentTimeMillis;
          yield* onDisk(
            pruneHeld(film.paths.out, { now, days: PRUNE_DAYS, keep: new Set(keys) }, false),
          ).pipe(
            Effect.flatMap((pruned) =>
              Effect.log(
                `render.cache.pruned count=${pruned.removed.length} freed=${pruned.freed}`,
              ),
            ),
            Effect.catch((error) =>
              Effect.logWarning(`render.cache.prune failed reason="${error.message}"`),
            ),
          );
        }
        const written: RenderOutput = {
          kind: 'video',
          clip: masterAt,
          share: shared,
          captions: Option.some(captions),
          chapters,
          description,
          images: [],
          sound,
          // A stretch of a video goes to --out, never the catalogue (`jobOf`).
          span: Option.none(),
        };
        return written;
      }, Effect.scoped);

      const stills = Effect.fnUntraced(function* (
        job: Extract<RenderJob, { _tag: 'Stills' }>,
        pool: ExportPages,
        dir: string,
      ) {
        const stillDir = path.join(dir, 'stills');
        yield* fs.makeDirectory(stillDir, { recursive: true });
        const files = yield* Effect.forEach(
          job.times,
          (t) =>
            Effect.gen(function* () {
              const file = path.join(stillDir, stillName(t));
              yield* bytesWhole(
                file,
                yield* pool.call('frame', frameAt(pool.info, t), 'image/png'),
              );
              yield* Effect.log(`render.still t=${t} file=${file}`);
              return file;
            }),
          { concurrency: job.workers },
        );
        return imagesOutput('stills', files.toSorted());
      });

      const contact = Effect.fnUntraced(function* (
        job: Extract<RenderJob, { _tag: 'Contact' }>,
        pool: ExportPages,
        dir: string,
      ) {
        const { info } = pool;
        // Clipped to the film as a video's range is, so no frame repeats at either end.
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({
            from: secondsAt(start, info.fps),
            to: secondsAt(end, info.fps),
          });
        const times = contactTimes(secondsAt(start, info.fps), secondsAt(end, info.fps), job.every);
        const sheet = path.join(dir, contactSheetName);
        yield* bytesWhole(
          sheet,
          yield* pool.call(
            'contact',
            times.map((t) => frameAt(info, t)),
          ),
        );
        yield* Effect.log(
          `render.contact frames=${times.length} every=${job.every}s file=${sheet}`,
        );
        const ranged = Option.isSome(job.from) || Option.isSome(job.to);
        return imagesOutput(
          'contact',
          [sheet],
          Option.liftPredicate(
            { from: secondsAt(start, info.fps), to: secondsAt(end, info.fps) },
            () => ranged,
          ),
        );
      });

      const lookbook = Effect.fnUntraced(function* (pool: ExportPages, dir: string) {
        const file = path.join(dir, lookbookName);
        yield* bytesWhole(file, yield* pool.call('lookbook', 'image/jpeg'));
        yield* Effect.log(`render.lookbook file=${file}`);
        return imagesOutput('lookbook', [file]);
      });

      /** `job` rendered, its video's probe and pages got through `drawing`. */
      const renderWith = (drawing: Drawing) =>
        Effect.fn('Renderer.render')(function* (film: LoadedFilm, job: RenderJob) {
          const cut = RenderJob.$match(job, {
            Video: (v) => v.cut,
            Stills: (st) => st.cut,
            Contact: (c) => c.cut,
            LookBook: () => Cut.Whole(),
          });
          const placed = yield* placeFilm(film);
          const page = cutPage(film.paths.name, cut);
          const where = renderPaths(film.paths.out, job.address, job.variant);
          const dir = where.dir;

          /** A job drawn on `workers` pages that encode nothing, handed the pool. */
          const drawn = <E>(
            workers: number,
            run: (pool: ExportPages) => Effect.Effect<RenderOutput, E>,
          ) =>
            Effect.scoped(
              Effect.gen(function* () {
                yield* fs.makeDirectory(dir, { recursive: true });
                const pool = yield* pages.open(page, {
                  workers,
                  captions: job.captions,
                  server: job.server,
                  picture: job.picture,
                });
                yield* declaredRate(film, pool.info.fps);
                // A short's spans must resolve on the page's frames, as a video's do.
                yield* shortOn(placed, cut);
                return yield* run(pool);
              }),
            );

          return yield* RenderJob.$match(job, {
            // A video writes its file (`--out`, else its clip) and what goes beside it; its segments are its own.
            Video: (v) => video(film, v, page, placed, where.clip, drawing),
            Stills: (s) =>
              drawn(Math.min(s.workers, s.times.length), (pool) => stills(s, pool, dir)),
            // One page composes the whole sheet.
            Contact: (c) => drawn(1, (pool) => contact(c, pool, dir)),
            LookBook: () => drawn(1, (pool) => lookbook(pool, dir)),
          });
        });

      const render = renderWith(alone);

      /**
       * Renders that keep each probe and pool they open, by what it was made
       * for, until the caller's scope closes: one at a time makes or finds one.
       */
      const session = Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const lock = yield* Semaphore.make(1);
        const probes = new Map<string, Probed>();
        const pools = new Map<string, ExportPages>();
        const kept = <A, E>(held: Map<string, A>, key: string, make: Effect.Effect<A, E>) =>
          lock.withPermits(1)(
            Option.match(Option.fromUndefinedOr(held.get(key)), {
              onSome: Effect.succeed,
              onNone: () => Effect.tap(make, (made) => Effect.sync(() => held.set(key, made))),
            }),
          );
        const drawing: Drawing = {
          probe: (key, make) => kept(probes, key, make),
          pool: (key, open) => kept(pools, key, Scope.provide(scope)(open)),
        };
        const run: RenderSession = { render: renderWith(drawing) };
        return run;
      });

      return Renderer.of({ render, session });
    }),
  ).pipe(Layer.provide(Pages.layer));
}
