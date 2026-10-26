// A film render reuses the segments it drew before: each beat's frames kept
// under the film's project folder by their key, so a render with every key
// kept draws nothing, and one with a beat changed draws that beat alone.
// Each marks what it reuses; renders of the film take turns at its cache,
// and once done each prunes it; a prune by hand waits for none of them.
// Fake pages and media; the project folder in memory; a stopped clock.

import { describe, expect, it } from 'effect-bun-test';
import {
  Boolean as Bool,
  Cause,
  Clock,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Logger,
  Option,
  Path,
  Schema,
} from 'effect';
import { systemError } from 'effect/PlatformError';
import { CacheBusy, CacheOutputUnrecorded, PageError } from './errors.ts';
import { CatalogueJson, MAIN_VARIANT, type Render, emptyCatalogue } from '../core/catalogue.ts';
import { type BoardFile, BoardFileJson, BoardName, type Panel, emptyBoard } from '../core/board.ts';
import { Picture } from '../core/board-render.ts';
import type { ExportInfo } from '../core/export-handle.ts';
import { Segment as FileName } from '../core/segment.ts';
import { Cut, RenderJob, Reuse } from './render-plan.ts';
import { Cores, Platform, Renderer } from './renderer.ts';
import { SoundRender } from './sound-render.ts';
import { emptyLedger, fakeRenderHost } from './browser/testing.ts';
import { testFilm } from './film-repo/testing.ts';
import { memoryFileSystem, memoryManifestLock, text } from './host/testing.ts';
import { ManifestLock } from './manifest-lock.ts';
import { pruneIdle, readCache, recordRender } from './segment-cache.ts';

/** Three beats, 5, 5 and 10 seconds, at 2 fps: frames 0–9, 10–19 and 20–39. */
const film = testFilm(
  [
    { id: 'a', min: 5 },
    { id: 'b', min: 5 },
    { id: 'c', min: 10 },
  ],
  { voice: '', scenes: {} },
);
const info: ExportInfo = { width: 1920, height: 1080, fps: 2, duration: 20, frames: 40 };
const frames = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k);

const keys = new Map([
  ['a', 'key-a'],
  ['b', 'key-b'],
  ['c', 'key-c'],
]);

const video = (reuse: Reuse, picture: Picture = Picture.Scenes()) =>
  RenderJob.Video({
    address: { _tag: 'Film' },
    variant: MAIN_VARIANT,
    captions: false,
    workers: Option.some(4),
    from: Option.none(),
    to: Option.none(),
    scale: 1,
    out: Option.none(),
    share: true,
    encoder: Option.none(),
    server: Option.none(),
    picture,
    cut: Cut.Whole(),
    reuse,
  });

const keyed = (scenes: ReadonlyMap<string, string> = keys, fresh = false) =>
  Reuse.Keyed({ scenes, fresh });

/**
 * Five beats at 2 fps: frames 0–11, 12–24, b's 25–34, 35–47 and 48–59.
 * Drawn whole, b's frames are two chunks, 25–30 and 30–35 (a chunk is 30
 * frames at least, then cut at the beats); drawn alone, one.
 */
const longer = {
  film: testFilm(
    [
      { id: 'a', min: 6 },
      { id: 'a2', min: 6.5 },
      { id: 'b', min: 5 },
      { id: 'c', min: 6.5 },
      { id: 'c2', min: 6 },
    ],
    { voice: '', scenes: {} },
  ),
  info: { width: 1920, height: 1080, fps: 2, duration: 30, frames: 60 },
};
const longerKeys = new Map([...keys, ['a2', 'key-a2'], ['c2', 'key-c2']]);

/** How a fake page draws frame `i` (`FakeRenderHost.frame`). */
type Draw = (i: number) => Effect.Effect<void, PageError>;

/** Renders into one project folder, kept in memory across them: what each drew and joined. */
const project = (files = new Map<string, Uint8Array>(), stage = { film, info }) => {
  const folders = new Set<string>();
  /** The host's cache locks: every render of the project, and a prune by hand, take the same. */
  const lock = memoryManifestLock();
  /** Every render's cache lines, as they are logged. */
  const cacheLines: Array<string> = [];
  /** Whether a write of a render's record (`cache/renders/`) is refused, as a full disk refuses it. */
  const refusing = { records: false };
  const disk = Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) => ({
      ...fs,
      writeFileString: (file: string, data: string) =>
        Effect.andThen(
          Effect.when(
            Effect.fail(
              systemError({
                _tag: 'PermissionDenied',
                module: 'FileSystem',
                method: 'writeFileString',
                pathOrDescriptor: file,
              }),
            ),
            Effect.sync(() => refusing.records && file.includes('/cache/renders/')),
          ),
          fs.writeFileString(file, data),
        ),
    })),
  ).pipe(Layer.provide(memoryFileSystem(files, folders)));
  const render = (job: RenderJob, draw: Draw = () => Effect.void) => {
    const ledger = emptyLedger();
    const lines: Array<string> = [];
    const pruned: Array<string> = [];
    // The render's reuse and prune lines kept, every other line dropped.
    const logged = Logger.layer([
      Logger.make(({ message }) => {
        const line = [message].flat().join(' ');
        if (line.startsWith('render.reuse')) lines.push(line);
        if (line.startsWith('render.cache.pruned')) pruned.push(line);
        if (line.startsWith('render.cache')) cacheLines.push(line);
      }),
    ]);
    const layer = Renderer.layer.pipe(
      Layer.provide([
        fakeRenderHost(ledger, { info: stage.info, frame: draw }),
        disk,
        Path.layer,
        SoundRender.layer,
      ]),
    );
    return Effect.gen(function* () {
      yield* (yield* Renderer).render(stage.film, job);
      const [join, share] = ledger.joins;
      return {
        target: Option.getOrThrow(Option.fromUndefinedOr(join)).out,
        reuse: lines,
        pruned,
        drawn: ledger.frames.toSorted((x, y) => x - y),
        pages: ledger.pages.opened,
        master: Option.getOrThrow(Option.fromUndefinedOr(join)).segments,
        share: Option.getOrThrow(Option.fromUndefinedOr(share)).segments,
      };
    }).pipe(
      Effect.provideService(Platform, 'darwin'),
      Effect.provideService(Cores, 16),
      Effect.provideService(ManifestLock, lock),
      Effect.provide([layer, logged]),
    );
  };
  /** `film cache --prune` on the project, by `rule`, at `now`, taking the cache as a render does. */
  const pruneByHand = (now: number, days: number) =>
    pruneIdle(film.paths.out, { now, days, keep: new Set() }, false).pipe(
      Effect.provideService(ManifestLock, lock),
      Effect.provide([memoryFileSystem(files, folders), Path.layer]),
    );
  /** Over the project folder: the cache as `film cache` reads it, a render recorded by hand, the catalogue written. */
  const onFiles = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    effect.pipe(Effect.provide([memoryFileSystem(files, folders), Path.layer]));
  /** The film's catalogue holding a video at each of `clips`, as a render's caller records it. */
  const catalogued = (clips: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const renders = clips.map((clip): Render => ({
        address: { _tag: 'Film' },
        variant: MAIN_VARIANT,
        kind: 'video',
        settings: { scale: 1, captions: false },
        stamp: { commit: Option.none(), key: 'k' },
        span: Option.none(),
        files: {
          clip: Option.some(clip.slice(`${film.paths.out}/`.length)),
          share: Option.none(),
          captions: Option.none(),
          chapters: Option.none(),
          description: Option.none(),
          images: [],
        },
        sound: Option.none(),
        at: 0,
      }));
      const catalogue = { ...emptyCatalogue('test'), renders };
      files.set(
        `${film.paths.out}/catalogue.json`,
        text(yield* Schema.encodeEffect(CatalogueJson)(catalogue)),
      );
    });
  /** The film's Board written where its page reads it, and each of its images. */
  const boarded = (record: BoardFile, images: Readonly<Record<string, string>>) =>
    Effect.gen(function* () {
      files.set('/films/test/board.json', text(yield* Schema.encodeEffect(BoardFileJson)(record)));
      for (const [file, bytes] of Object.entries(images))
        files.set(`/films/test/board/${file}`, text(bytes));
    });
  /** Once `n` chunk files of the folder hold `content` (a fake chunk's `mp4 <from>-<to>`). */
  const holding = (content: string, n = 1): Effect.Effect<void> =>
    Effect.suspend(() =>
      Bool.match(
        [...files].filter(([file, bytes]) => file.endsWith('.mp4') && read(bytes) === content)
          .length >= n,
        {
          onTrue: () => Effect.void,
          onFalse: () => Effect.andThen(Effect.sleep('1 millis'), holding(content, n)),
        },
      ),
    );
  /** What each file of `joined` holds, beside the frames its place says it holds. */
  const held = (joined: ReadonlyArray<{ readonly file: string; readonly at: number }>) => ({
    held: joined.map((s) => read(files.get(s.file) ?? new Uint8Array())),
    placed: joined.map(
      (s, k) =>
        `mp4 ${s.at * stage.info.fps}-${(joined[k + 1]?.at ?? stage.info.duration) * stage.info.fps}`,
    ),
  });
  return {
    render,
    boarded,
    holding,
    held,
    pruneByHand,
    cacheLines,
    refusing,
    onFiles,
    catalogued,
  };
};

const read = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const DAY = 86_400_000;

/**
 * A clock stopped at day `days`: what a render marks and prunes by. A wait
 * on it (a fake page's frame, a render waiting its turn at the cache) only
 * yields, so no test waits in real time.
 */
const onDay = (days: number): Clock.Clock => {
  const ms = days * DAY;
  const ns = BigInt(ms) * 1_000_000n;
  return {
    currentTimeMillisUnsafe: () => ms,
    currentTimeMillis: Effect.succeed(ms),
    currentTimeNanosUnsafe: () => ns,
    currentTimeNanos: Effect.succeed(ns),
    monotonicTimeNanosUnsafe: () => ns,
    monotonicTimeNanos: Effect.succeed(ns),
    sleep: () => Effect.yieldNow,
  };
};

/** Once `ready` holds, yielding between looks. */
const until = (ready: () => boolean): Effect.Effect<void> =>
  Effect.suspend(() =>
    Bool.match(ready(), {
      onTrue: () => Effect.void,
      onFalse: () => Effect.andThen(Effect.yieldNow, until(ready)),
    }),
  );

/** Beat `beat`'s one picture panel, held from its start, showing try 1. */
const panel = (beat: string): Panel => ({
  id: `${beat}.start`,
  beat: BoardName.make(beat),
  at: BoardName.make('start'),
  kept: 1,
  tries: [
    {
      n: 1,
      file: FileName.make(`${beat}.png`),
      sha256: 's',
      made: 'generate' as const,
      refs: [],
      at: 'x',
    },
  ],
});

const board: BoardFile = { ...emptyBoard('test'), panels: [panel('a'), panel('b'), panel('c')] };

describe.concurrent("a film render's segments", () => {
  it.live('are drawn once: with every key kept, the next render draws nothing and joins them', () =>
    Effect.gen(function* () {
      const { render } = project();
      const first = yield* render(video(keyed()));
      expect(first.drawn).toEqual(frames(0, 40));
      const again = yield* render(video(keyed()));
      expect(again.drawn).toEqual([]);
      expect(again.reuse).toEqual(['render.reuse segments=3 drawn=0 frames_drawn=0 fresh=false']);
      // Only the page that chose the encoder: no page opened to draw.
      expect(again.pages).toBe(1);
      expect(again.master).toEqual(first.master);
      expect(again.share).toEqual(first.share);
      // Each beat's chunks start where they play, in order, the share copy's beside them.
      expect(again.master.at(0)?.at).toBe(0);
      expect(again.master.map((s) => s.at)).toEqual(again.share.map((s) => s.at));
    }),
  );

  it.live("draw only a changed beat's segment, and join it among the kept ones", () =>
    Effect.gen(function* () {
      const { render } = project();
      const first = yield* render(video(keyed()));
      const changed = yield* render(video(keyed(new Map([...keys, ['b', 'key-b2']]))));
      expect(changed.drawn).toEqual(frames(10, 20));
      expect(changed.reuse).toEqual([
        'render.reuse segments=3 drawn=1 frames_drawn=10 fresh=false',
      ]);
      const beat = (from: number, to: number) => (segments: typeof first.master) =>
        segments.filter((s) => s.at >= from && s.at < to);
      // a's and c's kept chunks, b's new ones between them.
      expect(beat(0, 5)(changed.master)).toEqual(beat(0, 5)(first.master));
      expect(beat(10, 20)(changed.master)).toEqual(beat(10, 20)(first.master));
      expect(beat(5, 10)(changed.master)).not.toEqual(beat(5, 10)(first.master));
    }),
  );

  it.live('draw every segment again with --fresh', () =>
    Effect.gen(function* () {
      const { render } = project();
      yield* render(video(keyed()));
      const fresh = yield* render(video(keyed(keys, true)));
      expect(fresh.drawn).toEqual(frames(0, 40));
    }),
  );

  it.live('keep nothing when the render reuses none', () =>
    Effect.gen(function* () {
      const { render } = project();
      yield* render(video(Reuse.Off()));
      const again = yield* render(video(Reuse.Off()));
      expect(again.drawn).toEqual(frames(0, 40));
      expect(again.reuse).toEqual([]);
    }),
  );

  it.effect(
    'mark each segment they reuse, and once done delete those no render used for a week',
    () =>
      Effect.gen(function* () {
        const { render } = project();
        /** A render on day `days`. */
        const on = (days: number, job: RenderJob) =>
          render(job).pipe(Effect.provideService(Clock.Clock, onDay(days)));
        yield* on(0, video(keyed()));
        // Six days on, c changes: a's and b's segments are reused, so used now.
        const sixth = yield* on(6, video(keyed(new Map([...keys, ['c', 'key-c2']]))));
        expect(sixth.pruned).toEqual(['render.cache.pruned count=0 freed=0']);
        // Ten days on, every beat changes: the first c, unused for ten days,
        // goes; a and b (used four days ago) and c2 stay.
        const tenth = yield* on(
          10,
          video(
            keyed(
              new Map([
                ['a', 'key-a3'],
                ['b', 'key-b3'],
                ['c', 'key-c3'],
              ]),
            ),
          ),
        );
        expect(tenth.pruned).toHaveLength(1);
        expect(tenth.pruned[0]).toMatch(/^render\.cache\.pruned count=1 freed=[1-9]\d*$/);
        const back = yield* on(10, video(keyed()));
        expect(back.drawn).toEqual(frames(20, 40));
      }),
  );

  it.effect(
    'take turns: a second render of the film waits until the first is done, then reuses all it kept',
    () =>
      Effect.gen(function* () {
        const { render, cacheLines } = project();
        const reached = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const on = (job: RenderJob, draw?: Draw) =>
          render(job, draw).pipe(Effect.provideService(Clock.Clock, onDay(0)));
        // The first stops in b's frames, its a drawn and its b and c not yet kept.
        const one = yield* Effect.forkChild(
          on(video(keyed()), (i) =>
            Effect.when(
              Effect.andThen(Deferred.complete(reached, Effect.void), Deferred.await(release)),
              Effect.sync(() => i === 15),
            ),
          ),
        );
        yield* Deferred.await(reached);
        const two = yield* Effect.forkChild(on(video(keyed())));
        yield* Effect.raceFirst(
          until(() => cacheLines.some((line) => line.startsWith('render.cache.waiting'))),
          Effect.asVoid(Fiber.await(two)),
        );
        yield* Deferred.complete(release, Effect.void);
        yield* Fiber.join(one);
        const second = yield* Fiber.join(two);
        expect(cacheLines.filter((line) => line.startsWith('render.cache.waiting'))).toHaveLength(
          1,
        );
        expect(second.drawn).toEqual([]);
        expect(second.reuse).toEqual([
          'render.reuse segments=3 drawn=0 frames_drawn=0 fresh=false',
        ]);
      }),
  );

  it.effect(
    'are never pruned by hand while a render holds them: the prune is refused, the render joins what it reused',
    () =>
      Effect.gen(function* () {
        const { render, pruneByHand, held } = project();
        const reached = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        yield* render(video(keyed(new Map([...keys, ['b', 'key-b0']])))).pipe(
          Effect.provideService(Clock.Clock, onDay(0)),
        );
        // Thirty days on, b changes: a's and c's segments, a month old, are
        // reused, and the render stops while it draws b.
        const later = yield* Effect.forkChild(
          render(video(keyed()), (i) =>
            Effect.when(
              Effect.andThen(Deferred.complete(reached, Effect.void), Deferred.await(release)),
              Effect.sync(() => i === 15),
            ),
          ).pipe(Effect.provideService(Clock.Clock, onDay(30))),
        );
        yield* Deferred.await(reached);
        const busy = yield* Effect.exit(pruneByHand(30 * DAY, 0));
        expect(
          Exit.match(busy, { onSuccess: () => 'pruned', onFailure: Cause.squash }),
        ).toBeInstanceOf(CacheBusy);
        yield* Deferred.complete(release, Effect.void);
        const done = yield* Fiber.join(later);
        expect(done.drawn).toEqual(frames(10, 20));
        const joined = held(done.master);
        expect(joined.held).toEqual(joined.placed);
        // Done, it prunes the first b, a month unused and in no record.
        expect(done.pruned).toHaveLength(1);
        expect(done.pruned[0]).toMatch(/^render\.cache\.pruned count=1 /);
        // What is left is exactly what it used.
        const pruned = yield* pruneByHand(30 * DAY, 0);
        expect(pruned.removed).toEqual([]);
        expect(pruned.found.segments).toHaveLength(3);
      }),
  );

  it.effect(
    'whose record fails to write leave the render done, and a prune with 0 days refuses, naming its file, while another output is recorded',
    () =>
      Effect.gen(function* () {
        const { render, pruneByHand, cacheLines, refusing, onFiles, catalogued } = project();
        const on = (job: RenderJob) =>
          render(job).pipe(Effect.provideService(Clock.Clock, onDay(0)));
        const scene = `${film.paths.out}/scenes/a/main.mp4`;
        const first = yield* on(video(keyed()));
        yield* onFiles(recordRender(film.paths.out, scene, 0, ['key-a']));
        yield* catalogued([first.target, scene]);
        // b changes, and its render's record cannot be written.
        refusing.records = true;
        const changed = new Map([...keys, ['b', 'key-b2']]);
        const second = yield* on(video(keyed(changed)));
        refusing.records = false;
        expect(second.drawn).toEqual(frames(10, 20));
        expect(cacheLines.some((line) => line.startsWith('render.cache.record failed'))).toBe(true);
        const refused = yield* Effect.exit(pruneByHand(0, 0));
        expect(Exit.match(refused, { onSuccess: () => 'pruned', onFailure: Cause.squash })).toEqual(
          CacheOutputUnrecorded.make({ output: first.target }),
        );
        // Nothing went: the second render's b is reused.
        expect((yield* on(video(keyed(changed)))).drawn).toEqual([]);
      }),
  );

  it.effect('drawn again with --fresh never move their mark back', () =>
    Effect.gen(function* () {
      const { render, onFiles } = project();
      yield* render(video(keyed())).pipe(Effect.provideService(Clock.Clock, onDay(10)));
      // A clock behind the first render's: the fresh render's own mark is earlier.
      yield* render(video(keyed(keys, true))).pipe(Effect.provideService(Clock.Clock, onDay(9)));
      const found = yield* onFiles(readCache(film.paths.out));
      expect(found.segments.map((s) => s.used)).toEqual([10 * DAY, 10 * DAY, 10 * DAY]);
    }),
  );

  it.live('of the Board: a changed image draws only the segments that show it', () =>
    Effect.gen(function* () {
      const { render, boarded } = project();
      yield* boarded(board, { 'a.png': 'a', 'b.png': 'b', 'c.png': 'c' });
      const job = video(keyed(), Picture.Board({ review: true }));
      yield* render(job);
      expect((yield* render(job)).drawn).toEqual([]);
      // c's image is seen from 9.75 s, its dissolve in over b's last quarter second.
      yield* boarded(board, { 'c.png': 'c, one pixel changed' });
      expect((yield* render(job)).drawn).toEqual(frames(10, 40));
    }),
  );

  it.live('draw again what a --fresh render cut off after a chunk drew over', () =>
    Effect.gen(function* () {
      const { render, holding, held } = project(new Map(), longer);
      yield* render(video(keyed(new Map([...longerKeys, ['b', 'key-b0']]))));
      // b drawn alone and kept: one chunk, 25–35.
      yield* render(video(keyed(longerKeys)));
      // b drawn whole: its first chunk, 25–30, written (the first render's
      // b, key-b0, holds one too), then the render cut off.
      const cut = yield* Effect.exit(
        render(video(keyed(longerKeys, true)), (i) =>
          Effect.when(
            Effect.andThen(holding('mp4 25-30', 2), Effect.fail(PageError.make({ reason: 'cut' }))),
            Effect.sync(() => i === 59),
          ),
        ),
      );
      expect(Exit.isFailure(cut)).toBe(true);
      const next = yield* render(video(keyed(longerKeys)));
      expect(next.drawn).toEqual(frames(0, 60));
      const joined = held(next.master);
      expect(joined.held).toEqual(joined.placed);
    }),
  );
});
