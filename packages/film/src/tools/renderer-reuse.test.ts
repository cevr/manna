// A film render reuses the segments it drew before: each beat's frames kept
// under the film's project folder by their key, so a render with every key
// kept draws nothing, and one with a beat changed draws that beat alone.
// Fake pages and media; the project folder in memory.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Logger, Option, Path, Schema } from 'effect';
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
    workers: Option.some(2),
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

/** Renders into one project folder, kept in memory across them: what each drew and joined. */
const project = (files = new Map<string, Uint8Array>()) => {
  const folders = new Set<string>();
  const render = (job: RenderJob) => {
    const ledger = emptyLedger();
    const lines: Array<string> = [];
    // The render's reuse line kept, every other line dropped.
    const logged = Logger.layer([
      Logger.make(({ message }) => {
        const line = [message].flat().join(' ');
        if (line.startsWith('render.reuse')) lines.push(line);
      }),
    ]);
    const layer = Renderer.layer.pipe(
      Layer.provide([
        fakeRenderHost(ledger, { info }),
        memoryFileSystem(files, folders),
        Path.layer,
        SoundRender.layer,
      ]),
    );
    return Effect.gen(function* () {
      yield* (yield* Renderer).render(film, job);
      const [join, share] = ledger.joins;
      return {
        reuse: lines,
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
  return { render, boarded };
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
});
