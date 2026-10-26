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
  captions: false,
  picture: ['board'],
  agent: 'HeadlessChrome/141',
  platform: 'darwin',
};

const beats = new Map([
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
    beats,
    filmTimed: () => true,
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
      beats,
      board: Option.none(),
      filmTimed: () => true,
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
        beatSegments({
          placed,
          start: 0,
          end: 600,
          render,
          beats: changed,
          board: Option.none(),
          filmTimed: () => true,
        }),
      );
    const was = of(beats);
    const now = of(new Map([...beats, ['b', 'key-b2']]));
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

  test("change a segment's key only where a card whose words change shows", () => {
    /** The film's segments with c's panel a verse card of `text`. */
    const carded = (text: string) => {
      const card: Panel = {
        id: 'c.start',
        beat: BoardName.make('c'),
        at: BoardName.make('start'),
        tries: [],
        text: { _tag: 'Verse', ref: 'Job 9:2', text, phrase: 'just with God' },
      };
      const cards: BoardFile = { ...board, panels: [panel('a'), panel('b'), card] };
      return keys(
        beatSegments({
          placed,
          start: 0,
          end: 600,
          render,
          beats,
          board: Option.some({ shots: boardShots(placed, cards), duration: 20, images }),
          filmTimed: () => true,
        }),
      );
    };
    const was = carded('How should man be just with God?');
    const now = carded('How then can man be just with God?');
    // c's card is seen from 9.75 s, its dissolve in over b's last quarter second.
    expect([now[0] === was[0], now[1] === was[1], now[2] === was[2]]).toEqual([true, false, false]);
  });

  test('change every key when the render is drawn or encoded otherwise', () => {
    const was = keys(boardSegments());
    for (const other of [
      { scale: 0.5 },
      { encoder: 'software' },
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
      beats: new Map([['a', 'key-a']]),
      board: Option.none(),
      filmTimed: () => true,
    });
    expect(segments.map((s) => Option.isSome(s.key))).toEqual([true, false, false]);
  });
});

/**
 * The film's whole Board with `a` lasting `seconds` (its key `aKey`), b and c
 * after it as before, each frame reading the film's seconds where `timed`.
 */
const laid = (seconds: number, timed: (i: number) => boolean, aKey = 'key-a') => {
  const film = Result.getOrThrow(
    layout(
      [
        { id: 'a', min: seconds },
        { id: 'b', min: 5 },
        { id: 'c', min: 10 },
      ],
      { voice: '', scenes: {} },
    ),
  );
  return beatSegments({
    placed: film,
    start: 0,
    end: Math.ceil((seconds + 15) * 30 - 1e-6),
    render,
    beats: new Map([...beats, ['a', aKey]]),
    board: Option.some({ shots: boardShots(film, board), duration: seconds + 15, images }),
    filmTimed: timed,
  });
};

/** Frames that read only their beats' and shots' times: a Board's panels. */
const panels = () => false;
/** Frames that read the film's seconds: every frame the film draws. */
const drawn = () => true;

describe('a segment moved by an earlier beat', () => {
  test('is found again when its frames read only their beats, moved by whole frames', () => {
    // a lasts half a second longer: 15 frames at 30 fps, so b and c start 15 frames later.
    const was = laid(5, panels);
    const now = laid(5.5, panels, 'key-a2');
    expect(now.map(({ from, to }) => [from, to])).toEqual([
      [0, 165],
      [165, 315],
      [315, 615],
    ]);
    // a changed; b's first quarter second dissolves in from a's shot, whose motion spans a's
    // whole hold; c reads only b's shot and its own, each where it was from c's first frame.
    expect(keys(now).map((k, i) => k === keys(was)[i])).toEqual([false, false, true]);
    expect(now.map((s) => s.pinned)).toEqual([false, false, false]);
  });

  test('keeps its place in its key when its frames read the film’s seconds', () => {
    const was = laid(5, drawn);
    const now = laid(5.5, drawn, 'key-a2');
    expect(keys(now).map((k, i) => k === keys(was)[i])).toEqual([false, false, false]);
    expect(now.map((s) => s.pinned)).toEqual([true, true, true]);
  });

  test('is drawn again when the move is part of a frame: its frames fall elsewhere in its shots', () => {
    const was = laid(5, panels);
    const now = laid(5.01, panels, 'key-a2');
    expect(keys(now)[2]).not.toBe(keys(was)[2]);
  });

  test('is cut where its frames start or stop reading the film’s seconds', () => {
    const segments = laid(5, (i) => i >= 140 && i < 160);
    expect(segments.map(({ from, to, pinned }) => [from, to, pinned])).toEqual([
      [0, 140, false],
      [140, 150, true],
      [150, 160, true],
      [160, 300, false],
      [300, 600, false],
    ]);
  });

  test('reads the beat of a shot it shows: a change to that beat alone draws it again', () => {
    const was = laid(5, panels);
    // b's shot dissolves into c's first quarter second: c's frames read b's beat (its line sets a card).
    const now = beatSegments({
      placed,
      start: 0,
      end: 600,
      render,
      beats: new Map([...beats, ['b', 'key-b2']]),
      board: Option.some({ shots: boardShots(placed, board), duration: 20, images }),
      filmTimed: panels,
    });
    expect(keys(now).map((k, i) => k === keys(was)[i])).toEqual([false, false, false]);
  });
});
