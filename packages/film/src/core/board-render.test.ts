// A Board render's frame at a film second: the panel the animatic holds
// there and how it moves (the same answer on every call), the dissolve's
// weights across a cut, the review copy's burn-in, and the export page's
// query read back as the picture it asked for.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Match, Option, Result } from 'effect';
import { type BoardFile, BoardName, type Panel, emptyBoard } from './board.ts';
import { Segment } from './segment.ts';
import { Shot, type TimedBeat, shotsOf } from './animatic.ts';
import {
  type Framing,
  type Layer,
  Picture,
  boardClock,
  boardFrameAt,
  boardShots,
  burnIn,
  pictureOn,
  pictureParams,
} from './board-render.ts';
import { filmClock, timedBeat } from './film-timeline.ts';
import { layout } from './layout.ts';
import { estimate, hashText } from './narration.ts';
import { TICKS_PER_FRAME, ticksAt } from './time.ts';
import { unmeasured } from './voiced.ts';

/** The dissolve's length at a cut with long holds on both sides. */
const DISSOLVE_S = 0.5;

const marks = (start: number, at: Record<string, number>) => (name: string) =>
  Option.map(Option.fromUndefinedOr(at[name]), (t) => start + t);

const beats: ReadonlyArray<TimedBeat> = [
  { id: 'cold', start: 0, end: 10, markAt: marks(0, { room: 4 }) },
  { id: 'title', start: 10, end: 14, markAt: marks(10, {}) },
  { id: 'name', start: 14, end: 20, markAt: marks(14, { sets: 0.2 }) },
];

const panel = (beat: string, at: string, kept: number): Panel => ({
  id: `${beat}.${at}`,
  beat: BoardName.make(beat),
  at: BoardName.make(at),
  kept,
  tries: [1, 2, 3, 4, 5].map((n) => ({
    n,
    file: Segment.make(`${beat}.${at}.${n}.png`),
    sha256: 's',
    made: 'generate' as const,
    refs: [],
    at: 'x',
  })),
});

const board: BoardFile = {
  ...emptyBoard('f'),
  panels: [panel('cold', 'start', 2), panel('cold', 'room', 3), panel('name', 'sets', 5)],
};

const shots = shotsOf(beats, board);
const DURATION = 20;

/** The Board's rate in these cases. */
const FPS = 30;
/** One tick of the Board's clock, in seconds. */
const ONE_TICK = 1 / (FPS * TICKS_PER_FRAME);

/** Shots `s` of a film `duration` long at film second `T`. */
const frameOf = (s: ReadonlyArray<Shot>, duration: number, T: number) =>
  boardFrameAt(boardClock(s, [], duration, FPS), ticksAt(T, FPS));

const frameAt = (T: number) => Option.getOrThrow(frameOf(shots, DURATION, T));

/** How long a panel shown alone holds. */
const HOLD = 10;

/** Panel `p` held alone from `from`, as the frame `T` seconds in draws it. */
const alone = (p: Panel, from: number, T: number): Layer =>
  Option.getOrThrow(
    frameOf([Shot.Boarded({ beat: p.beat, panel: p, at: from, from })], from + HOLD, from + T),
  ).layers[0]!;

/** Forty picture panels by id. */
const ids = Array.from({ length: 40 }, (_, k) => panel('b', `m${k}`, 1));

/** Where a motion starts and ends, as the spec sets them: a push 6 % larger, a pan 4 % of the width, held 4.2 % larger. */
const startOf = (m: Layer['motion']): Framing =>
  Match.valueTags(m, {
    Still: () => ({ scale: 1, dx: 0 }),
    PushIn: () => ({ scale: 1, dx: 0 }),
    Pan: ({ dir }) => ({ scale: 1.042, dx: -dir * 0.02 }),
  });
const endOf = (m: Layer['motion']): Framing =>
  Match.valueTags(m, {
    Still: () => ({ scale: 1, dx: 0 }),
    PushIn: () => ({ scale: 1.06, dx: 0 }),
    Pan: ({ dir }) => ({ scale: 1.042, dx: dir * 0.02 }),
  });
const close = (got: Framing, want: Framing) => {
  expect(got.scale).toBeCloseTo(want.scale, 6);
  expect(got.dx).toBeCloseTo(want.dx, 6);
};

/** The panel id a layer shows, or `card` for a beat's storyboard card. */
const named = (shot: Shot) =>
  Shot.$match(shot, { Boarded: ({ panel: p }) => p.id, Unboarded: ({ beat }) => `${beat} card` });

describe('the frame at a film second', () => {
  test('holds the panel the animatic shows there, alone between dissolves', () => {
    expect(named(frameAt(2).shown)).toBe('cold.start');
    expect(frameAt(2).layers.map((l) => named(l.shot))).toEqual(['cold.start']);
    expect(named(frameAt(6).shown)).toBe('cold.room');
    expect(named(frameAt(12).shown)).toBe('title card');
    expect(named(frameAt(17).shown)).toBe('name.sets');
  });

  test('is pure: two calls give the same frame', () => {
    for (const T of [0, 3.9, 4, 9.8, 12, 14.1, 19.9]) expect(frameAt(T)).toEqual(frameAt(T));
  });

  test('moves a picture panel by its id alone, and holds a card still', () => {
    const p = panel('cold', 'room', 3);
    expect(alone(p, 4, 4).motion).toEqual(alone(p, 99, 99).motion);
    const card: Panel = { ...p, text: { _tag: 'Card', payoff: 'milk' } };
    expect(alone(card, 0, 5).motion).toMatchObject({ _tag: 'Still' });
    expect(frameAt(12).layers[0]!.motion).toMatchObject({ _tag: 'Still' });
    // Across many ids, each motion is picked: a push in and both pans.
    const picked = new Set(
      ids.map((p) =>
        Match.valueTags(alone(p, 0, 0).motion, {
          Still: () => 'still',
          PushIn: () => 'push',
          Pan: ({ dir }) => `pan ${dir}`,
        }),
      ),
    );
    expect(picked).toEqual(new Set(['push', 'pan 1', 'pan -1']));
  });

  test('moves at most 6 % larger or 4 % of the width over the span seen, and never past it', () => {
    for (const p of ids) {
      const motion = alone(p, 0, 0).motion;
      close(alone(p, 0, 0).framing, startOf(motion));
      close(alone(p, 0, HOLD).framing, endOf(motion));
      close(alone(p, 0, HOLD * 3).framing, endOf(motion));
    }
  });
});

describe('the dissolve at a cut', () => {
  test('is centred on the cut: the incoming shot at a quarter, a half and three quarters', () => {
    const half = DISSOLVE_S / 2;
    const at = (T: number) => frameAt(T).layers.map((l) => [named(l.shot), l.alpha]);
    expect(at(4 - half / 2)).toEqual([
      ['cold.start', 1],
      ['cold.room', 0.25],
    ]);
    expect(at(4)).toEqual([
      ['cold.start', 1],
      ['cold.room', 0.5],
    ]);
    expect(at(4 + half / 2)).toEqual([
      ['cold.start', 1],
      ['cold.room', 0.75],
    ]);
    expect(at(4 + half)).toEqual([['cold.room', 1]]);
    expect(at(4 - half - 0.01)).toEqual([['cold.start', 1]]);
  });

  test('is clamped to half of a short hold on either side', () => {
    // `name.sets` takes over 0.2 s into its beat, so the cut from the beat's
    // own start is held only 0.2 s: its dissolve is 0.1 s each side, not 0.25.
    const tight: BoardFile = { ...board, panels: [...board.panels, panel('name', 'start', 1)] };
    const s = shotsOf(beats, tight);
    const layers = (T: number) =>
      Option.getOrThrow(frameOf(s, DURATION, T)).layers.map((l) => [
        named(l.shot),
        Math.round(l.alpha * 1000) / 1000,
      ]);
    // From 13.9 to 14.1 into `name.start`, from 14.1 to 14.3 into `name.sets`.
    expect(layers(13.89)).toEqual([['title card', 1]]);
    expect(layers(14.05)).toEqual([
      ['title card', 1],
      ['name.start', 0.75],
    ]);
    expect(layers(14.15)).toEqual([
      ['name.start', 1],
      ['name.sets', 0.25],
    ]);
  });

  test('carries the motion through it: the outgoing shot ends as the incoming begins', () => {
    const half = DISSOLVE_S / 2;
    const out = frameAt(4 + half - ONE_TICK).layers[0]!;
    const inn = frameAt(4 - half + ONE_TICK).layers[1]!;
    close(out.framing, endOf(out.motion));
    close(inn.framing, startOf(inn.motion));
  });
});

describe("a Board render's shots", () => {
  test("are the studio Board lane's: the animatic over the film clock's beats, marks and takes", () => {
    const said = 'A baby {room}drinks milk.';
    const spoken = 'A baby drinks milk.';
    // A take slower than the estimate, so its marks fall where the estimate's do not.
    const take = {
      hash: hashText(spoken),
      file: 'cold.flac',
      duration: 3,
      words: unmeasured(
        estimate(spoken).map((w) => ({ ...w, start: w.start * 1.5, end: w.end * 1.5 })),
      ),
      source: 'elevenlabs' as const,
    };
    const placed = Result.getOrThrow(
      layout(
        [
          { id: 'cold', say: said, lead: 1.2 },
          { id: 'title' },
          { id: 'name', say: '{sets}Be just with God.' },
        ],
        { voice: 'v', scenes: { cold: take } },
        30,
      ),
    );
    const clock = Result.getOrThrow(
      filmClock(placed, 30, { acts: [], movements: [], drawn: () => false }),
    );
    const studio = shotsOf(clock.beats.map(timedBeat), board);
    expect(boardShots(placed, board)).toEqual(studio);
    // The take's mark, not its beat's start: the shots say where the take says `room`.
    expect(studio.map((s) => s.from)).toContain(
      Option.getOrThrow(Arr.findFirst(clock.beats[0]!.marks, (m) => m.name === 'room')).at,
    );
  });
});

describe('the burn-in', () => {
  test('names the time, the beat, and the panel with its try', () => {
    expect(burnIn(41.37, frameAt(17).shown, false)).toBe('0:41.3 · name · name.sets · try 5');
    expect(burnIn(12, frameAt(12).shown, false)).toBe('0:12.0 · title · card');
    expect(burnIn(17, frameAt(17).shown, true)).toBe('0:17.0 · name · card');
  });

  test('says minutes and tenths, the tenth cut down', () => {
    const time = (T: number) => burnIn(T, frameAt(2).shown, false).split(' · ')[0];
    expect(time(0)).toBe('0:00.0');
    expect(time(59.99)).toBe('0:59.9');
    expect(time(62.37)).toBe('1:02.3');
    expect(time(600.1)).toBe('10:00.1');
  });
});

describe('the export page query', () => {
  test('reads back the picture it was built for', () => {
    for (const picture of [
      Picture.Scenes(),
      Picture.Board({ review: false }),
      Picture.Board({ review: true }),
    ])
      expect(pictureOn(new URLSearchParams(pictureParams(picture).join('&')))).toEqual(picture);
  });
});
