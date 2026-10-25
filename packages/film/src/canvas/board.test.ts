// A text panel on the board is set by the engine in the film's card style: a
// card held from the beat's start (the board's `start`, not a mark the line
// says) sets the line from its first word. A Board render draws a picture
// panel as its kept try, and every card (a card panel, a beat with no panel,
// a card the film's scenes declare) through the film's own card code; its
// review copy burns in where it is.

import { describe, expect, test } from 'bun:test';
import { Result, Schema } from 'effect';
import { type BoardImage, boardFilm, paintText } from './board.ts';
import type { CardStyle } from './card.ts';
import type { Film } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import { type BoardFile, BoardName, type Panel, emptyBoard } from '../core/board.ts';
import { Segment } from '../core/segment.ts';
import { type Placed, layout } from '../core/layout.ts';
import { estimate } from '../core/narration.ts';
import { voicedAt } from '../core/voiced.ts';

const STYLE: CardStyle = {
  ground: '#0e1010',
  type: { family: 'x', size: 60, color: '#f2e9d7' },
  payoffScale: 2.5,
  payoffColor: '#e6b347',
};

/** A film with only what a card reads of it: its size, its title, its card style. */
const film: Film = Schema.decodeSync(Schema.Any)({
  width: 1920,
  height: 1080,
  title: 'probe',
  look: { card: { style: STYLE } },
});

/** Beat `one` saying `line`, its words heard as an estimate times them, with the marks `marks`. */
const placed = (line: string, marks: ReadonlyArray<readonly [string, number]>): Placed => {
  const words = estimate(line).map((w) => ({ ...w, voiced: voicedAt(w.start + 0.15, w.end) }));
  return Schema.decodeSync(Schema.Any)({
    spec: { id: 'one' },
    voice: { words, marks: new Map(marks) },
    speechStart: 0,
    start: 0,
  });
};

describe('a card panel', () => {
  test("held from the beat's start, sets the line from its first word", () => {
    const r = recorder(1920, 1080);
    const set = withDom(() =>
      paintText(
        r.ctx,
        film,
        placed('Be just with God.', []),
        { _tag: 'Card', payoff: 'just' },
        'start',
        0,
        9,
      ),
    );
    expect(set).toEqual(Result.succeed(undefined));
  });
  test('held from a mark the line lacks, says so', () => {
    const r = recorder(1920, 1080);
    const set = withDom(() =>
      paintText(
        r.ctx,
        film,
        placed('Be just with God.', []),
        { _tag: 'Card', payoff: 'just' },
        'gone',
        0,
        9,
      ),
    );
    expect(Result.isFailure(set) && set.failure).toContain('{gone}');
  });
});

describe('a Board render', () => {
  /** Beats `one`, `two` and `three`, 5 s each from 0, saying their lines on an estimate. */
  const beats = Result.getOrThrow(
    layout(
      [
        { id: 'one', say: 'A baby drinks milk.', min: 5 },
        { id: 'two', say: 'Nobody minds.', min: 5 },
        { id: 'three', say: 'Be just with God.', min: 5 },
      ],
      { voice: '', scenes: {} },
    ),
  );
  const panel = (id: string, extra: Partial<Panel>): Panel => ({
    id: `${id}.start`,
    beat: BoardName.make(id),
    at: BoardName.make('start'),
    tries: [1, 2].map((n) => ({
      n,
      file: Segment.make(`${id}.start.${n}.png`),
      sha256: 's',
      made: 'generate' as const,
      refs: [],
      at: 'x',
    })),
    ...extra,
  });
  const board: BoardFile = {
    ...emptyBoard('probe'),
    panels: [
      panel('one', { kept: 2 }),
      panel('three', { tries: [], text: { _tag: 'Card', payoff: 'just' } }),
    ],
  };

  /** A film of beats `one` (a picture), `two` (no panel) and `three` (a card), its own draws logged; a card of its scenes holds over `cards`. */
  const filmOf = (cards: (T: number) => boolean) => {
    const drew: Array<number> = [];
    const f: Film = Schema.decodeSync(Schema.Any)({
      width: 1920,
      height: 1080,
      duration: 15,
      title: 'probe',
      look: { card: { style: STYLE } },
      placed: beats,
      render: (_ctx: CanvasRenderingContext2D, T: number) => drew.push(T),
      cardAt: cards,
    });
    return { film: f, drew };
  };

  /** The kept try of `one`, a stand-in image 1536 × 1024. */
  const tries = () => {
    const kept = document.createElement('canvas');
    kept.width = 1536;
    kept.height = 1024;
    return { kept, images: new Map<string, BoardImage>([['one.start.2.png', kept]]) };
  };

  test('draws a picture panel as its kept try, covering the frame, not the film', () => {
    const { film: f, drew } = filmOf(() => false);
    const r = recorder(1920, 1080);
    withDom(() => {
      const { kept, images } = tries();
      boardFilm(f, board, images, false).render(r.ctx, 2);
      expect(r.images.map((d) => d.image)).toEqual([kept as never]);
      // Covered: 1536 wide at 1.25 is the frame's 1920, at least, and it moves no more than the push.
      const [a] = r.images[0]!.m;
      expect(a).toBeGreaterThanOrEqual(1.25 - 1e-9);
      expect(a).toBeLessThanOrEqual(1.25 * 1.06 + 1e-9);
    });
    expect(drew).toEqual([]);
  });

  test('draws a beat with no panel through the film itself: its storyboard card', () => {
    const { film: f, drew } = filmOf(() => false);
    const r = recorder(1920, 1080);
    withDom(() => boardFilm(f, board, tries().images, false).render(r.ctx, 7));
    expect(drew).toEqual([7]);
    expect(r.images).toEqual([]);
  });

  test("sets a card panel in the film's card style, through the card code", () => {
    const { film: f, drew } = filmOf(() => false);
    const r = recorder(1920, 1080);
    withDom(() => boardFilm(f, board, tries().images, false).render(r.ctx, 12));
    expect(r.fills.map((fill) => fill.style)).toContain('#0e1010');
    expect(drew).toEqual([]);
  });

  test("draws a card the film's scenes declare over a picture panel, through the film", () => {
    const { film: f, drew } = filmOf((T) => T >= 1 && T < 3);
    const r = recorder(1920, 1080);
    withDom(() => boardFilm(f, board, tries().images, false).render(r.ctx, 2));
    expect(drew).toEqual([2]);
    expect(r.images).toEqual([]);
  });

  test('burns in the time, the beat and the panel with its try on the review copy alone', () => {
    const said = (review: boolean) => {
      const texts: Array<unknown> = [];
      const r = recorder(1920, 1080, {
        onCall: (key, args) => {
          if (key === 'fillText') texts.push(args[0]);
        },
      });
      const { film: f } = filmOf(() => false);
      withDom(() => boardFilm(f, board, tries().images, review).render(r.ctx, 2.06));
      return texts;
    };
    expect(said(true)).toEqual(['0:02.0 · one · one.start · try 2']);
    expect(said(false)).toEqual([]);
  });
});
