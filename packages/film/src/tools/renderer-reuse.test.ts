// A film render reuses the segments it drew before: each beat's frames kept
// under the film's project folder by their key, so a render with every key
// kept draws nothing, and one with a beat changed draws that beat alone.
// Fake pages and media; the project folder in memory.

import { describe, expect, it } from 'effect-bun-test';
import {
  Boolean as Bool,
  Clock,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  Match,
  Option,
  Path,
  Schema,
} from 'effect';
import { PageError } from './errors.ts';
import { MAIN_VARIANT } from '../core/catalogue.ts';
import { type BoardFile, BoardFileJson, BoardName, type Panel, emptyBoard } from '../core/board.ts';
import { Picture } from '../core/board-render.ts';
import type { ExportInfo } from '../core/export-handle.ts';
import { Segment as FileName } from '../core/segment.ts';
import { Cut, RenderJob, Reuse } from './render-plan.ts';
import { Cores, Platform, Renderer } from './renderer.ts';
import { SoundRender } from './sound-render.ts';
import { emptyLedger, fakeRenderHost } from './browser/testing.ts';
import { testFilm } from './film-repo/testing.ts';
import { memoryFileSystem, text } from './host/testing.ts';

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
  const render = (job: RenderJob, draw: Draw = () => Effect.void) => {
    const ledger = emptyLedger();
    const lines: Array<string> = [];
    const pruned: Array<string> = [];
    // The render's reuse and prune lines kept, every other line dropped.
    const logged = Logger.layer([
      Logger.make(({ message }) => {
        const line = [message].flat().join(' ');
        if (line.startsWith('render.reuse')) lines.push(line);
        if (line.startsWith('render.cache')) pruned.push(line);
      }),
    ]);
    const layer = Renderer.layer.pipe(
      Layer.provide([
        fakeRenderHost(ledger, { info: stage.info, frame: draw }),
        memoryFileSystem(files, folders),
        Path.layer,
        SoundRender.layer,
      ]),
    );
    return Effect.gen(function* () {
      yield* (yield* Renderer).render(stage.film, job);
      const [join, share] = ledger.joins;
      return {
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
      Effect.provide([layer, logged]),
    );
  };
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
  return { render, boarded, holding, held };
};

const read = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** `live`, its wall time `days` days later: what a render marks and prunes by, its waits still real. */
const later = (live: Clock.Clock, days: number): Clock.Clock => {
  const shift = days * 86_400_000;
  return {
    currentTimeMillisUnsafe: () => live.currentTimeMillisUnsafe() + shift,
    currentTimeMillis: Effect.map(live.currentTimeMillis, (ms) => ms + shift),
    currentTimeNanosUnsafe: () => live.currentTimeNanosUnsafe() + BigInt(shift) * 1_000_000n,
    currentTimeNanos: Effect.map(live.currentTimeNanos, (ns) => ns + BigInt(shift) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: live.monotonicTimeNanos,
    sleep: (duration) => live.sleep(duration),
  };
};

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

  it.live(
    'mark each segment they reuse, and once done delete those no render used for a week',
    () =>
      Effect.gen(function* () {
        const { render } = project();
        const live = yield* Clock.Clock;
        /** A render that reads the time `days` days from now (its pages still wait in real time). */
        const on = (days: number, job: RenderJob) =>
          render(job).pipe(Effect.provideService(Clock.Clock, later(live, days)));
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

  it.live('keep what two renders of one segment at once draw, each file holding its frames', () =>
    Effect.gen(function* () {
      const { render, holding, held } = project(new Map(), longer);
      yield* render(video(keyed(new Map([...longerKeys, ['b', 'key-b0']]))));
      // One draws b alone, 25–35, and keeps it once the other has begun to
      // draw; the other, --fresh, draws b whole, 25–30 and 30–35, over it.
      const alone = yield* Deferred.make<void>();
      const begun = yield* Deferred.make<void>();
      const one = yield* Effect.forkChild(
        render(video(keyed(longerKeys)), (i) =>
          Effect.when(
            Effect.andThen(Deferred.complete(alone, Effect.void), Deferred.await(begun)),
            Effect.sync(() => i === 25),
          ),
        ),
      );
      yield* Deferred.await(alone);
      const other = yield* Effect.forkChild(
        render(video(keyed(longerKeys, true)), (i) =>
          Match.value(i).pipe(
            Match.when(0, () => Deferred.complete(begun, Effect.void)),
            Match.when(25, () => holding('mp4 25-35')),
            // Never done, so it never keeps b: the first's record alone names b's files.
            Match.when(59, () => Effect.never),
            Match.orElse(() => Effect.void),
          ),
        ),
      );
      yield* Fiber.join(one);
      // The other's 25–30 written (the first render's b, key-b0, holds one too).
      yield* holding('mp4 25-30', 2);
      yield* Fiber.interrupt(other);
      const next = yield* render(video(keyed(longerKeys)));
      const joined = held(next.master);
      expect(joined.held).toEqual(joined.placed);
    }),
  );
});
