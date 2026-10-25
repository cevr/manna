// A render's segments: its frames cut at its beats, each keyed by what its
// frames read, so the key changes when, and only when, a frame of the
// segment would.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { type BoardFile, BoardName, type Panel, emptyBoard } from '../core/board.ts';
import { boardShots } from '../core/board-render.ts';
import { layout } from '../core/layout.ts';
import { Segment as FileName } from '../core/segment.ts';
import { type RenderRead, type Segment, beatSegments } from './segments.ts';

/** Three beats, 5, 5 and 10 seconds: at 30 fps frames 0–149, 150–299 and 300–599. */
const placed = Result.getOrThrow(
  layout(
    [
      { id: 'a', min: 5 },
      { id: 'b', min: 5 },
      { id: 'c', min: 10 },
    ],
    { voice: '', scenes: {} },
  ),
);

const render: RenderRead = {
  width: 1920,
  height: 1080,
  fps: 30,
  scale: 1,
  encoder: 'hardware',
  share: true,
  captions: false,
  picture: ['board'],
  agent: 'HeadlessChrome/141',
  platform: 'darwin',
};

const scenes = new Map([
  ['a', 'key-a'],
  ['b', 'key-b'],
  ['c', 'key-c'],
]);

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

const board: BoardFile = { ...emptyBoard('f'), panels: [panel('a'), panel('b'), panel('c')] };

/** Each image's bytes as hashed from disk. */
const images = new Map([
  ['a.png', 'sha-a'],
  ['b.png', 'sha-b'],
  ['c.png', 'sha-c'],
]);

/** The whole 20 s film's segments, its Board drawn with `over` in place of each image's hash. */
const boardSegments = (
  over: Readonly<Record<string, string>> = {},
  more: Partial<RenderRead> = {},
): ReadonlyArray<Segment> =>
  beatSegments({
    placed,
    start: 0,
    end: 600,
    render: { ...render, ...more },
    scenes,
    board: Option.some({
      shots: boardShots(placed, board),
      duration: 20,
      images: new Map([...images, ...Object.entries(over)]),
    }),
  });

const keys = (segments: ReadonlyArray<Segment>) => segments.map((s) => Option.getOrThrow(s.key));

describe("a render's segments", () => {
  test('cut its frames at each beat, covering them in order', () => {
    expect(boardSegments().map(({ from, to }) => [from, to])).toEqual([
      [0, 150],
      [150, 300],
      [300, 600],
    ]);
    // A stretch cuts at the beats inside it only.
    const stretch = beatSegments({
      placed,
      start: 100,
      end: 400,
      render,
      scenes,
      board: Option.none(),
    });
    expect(stretch.map(({ from, to }) => [from, to])).toEqual([
      [100, 150],
      [150, 300],
      [300, 400],
    ]);
  });

  test('keep their keys while nothing their frames read changes', () => {
    expect(keys(boardSegments())).toEqual(keys(boardSegments()));
  });

  test("change a scene render's key only where the changed beat's frames are", () => {
    const of = (changed: ReadonlyMap<string, string>) =>
      keys(
        beatSegments({ placed, start: 0, end: 600, render, scenes: changed, board: Option.none() }),
      );
    const was = of(scenes);
    const now = of(new Map([...scenes, ['b', 'key-b2']]));
    expect([now[0] === was[0], now[1] === was[1], now[2] === was[2]]).toEqual([true, false, true]);
  });

  test("leave a segment's key alone when a panel it never shows changes", () => {
    // c's shot is seen from 9.75 s (its dissolve in): never in a's frames, 0 to 5 s.
    const was = keys(boardSegments());
    const now = keys(boardSegments({ 'c.png': 'sha-c2' }));
    expect(now[0]).toBe(was[0]);
    expect(now[2]).not.toBe(was[2]);
  });

  test("change a segment's key when its neighbour across a dissolve at its edge changes", () => {
    // b dissolves in over a's last quarter second, 4.75 to 5 s: a's frames draw it.
    const was = keys(boardSegments());
    const now = keys(boardSegments({ 'b.png': 'sha-b2' }));
    expect([now[0] === was[0], now[1] === was[1], now[2] === was[2]]).toEqual([
      false,
      false,
      false,
    ]);
    // c dissolves in over b's last quarter second, so b's segment draws it too.
    const later = keys(boardSegments({ 'c.png': 'sha-c2' }));
    expect(later[1]).not.toBe(was[1]);
  });

  test('change every key when the render is drawn or encoded otherwise', () => {
    const was = keys(boardSegments());
    for (const other of [
      { scale: 0.5 },
      { encoder: 'software' },
      { share: false },
      { picture: ['board', 'review'] },
      { agent: 'HeadlessChrome/142' },
    ]) {
      const now = keys(boardSegments({}, other));
      expect(now.map((k, i) => k === was[i])).toEqual([false, false, false]);
    }
  });

  test('have no key where a beat they draw has none, so they are drawn and never kept', () => {
    const segments = beatSegments({
      placed,
      start: 0,
      end: 600,
      render,
      scenes: new Map([['a', 'key-a']]),
      board: Option.none(),
    });
    expect(segments.map((s) => Option.isSome(s.key))).toEqual([true, false, false]);
  });
});
