import { describe, expect, test } from 'bun:test';
import { Match, Option, Result, Schema } from 'effect';
import { type BoardImage, boardFilm } from './board.ts';
import type { CardStyle } from './card.ts';
import type { Film } from './film.ts';
import { applyAffine, recorder, withDom } from './fixtures/stand-in.ts';
import { Shot } from '../core/animatic.ts';
import { boardClock, boardFrameAt } from '../core/board-render.ts';
import { type BoardFile, BoardName, type Panel, emptyBoard } from '../core/board.ts';
import { Segment } from '../core/segment.ts';
import { layout } from '../core/layout.ts';

const STYLE: CardStyle = {
  ground: '#0e1010',
  type: { family: 'x', size: 60, color: '#f2e9d7' },
  payoffScale: 2.5,
  payoffColor: '#e6b347',
};

describe('a Board render', () => {
  const beats = Result.getOrThrow(
    layout(
      [
        { id: 'one', say: 'A baby drinks milk.', min: 5 },
        { id: 'two', say: 'Nobody minds.', min: 5 },
        { id: 'three', say: 'Be just with God.', min: 5 },
      ],
      { voice: '', scenes: {} },
      30,
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

  const filmOf = (cards: (T: number) => boolean) => {
    const drew: Array<number> = [];
    const f: Film = Schema.decodeSync(Schema.Any)({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 15,
      title: 'probe',
      look: { card: { style: STYLE } },
      placed: beats,
      render: (_ctx: CanvasRenderingContext2D, T: number) => drew.push(T),
      cardAt: cards,
    });
    return { film: f, drew };
  };

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

  test('fails the frame on a card held from a mark its line lacks, naming the mark', () => {
    const { film: f } = filmOf(() => false);
    const gone: BoardFile = {
      ...board,
      panels: board.panels.map((p) => {
        if (p.beat !== 'three') return p;
        return { ...p, id: 'three.gone', at: BoardName.make('gone') };
      }),
    };
    const r = recorder(1920, 1080);
    expect(() =>
      withDom(() => boardFilm(f, gone, tries().images, false).render(r.ctx, 12)),
    ).toThrow('{gone}');
  });

  test("draws a card the film's scenes declare over a picture panel, through the film", () => {
    const { film: f, drew } = filmOf((T) => T >= 1 && T < 3);
    const r = recorder(1920, 1080);
    withDom(() => boardFilm(f, board, tries().images, false).render(r.ctx, 2));
    expect(drew).toEqual([2]);
    expect(r.images).toEqual([]);
  });

  test('covers the whole frame at either end of a push and a pan, a pan with a pixel to spare', () => {
    const one = Result.getOrThrow(
      layout([{ id: 'one', say: 'A baby drinks milk.', min: 5 }], { voice: '', scenes: {} }, 30),
    );
    const f: Film = Schema.decodeSync(Schema.Any)({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 5,
      title: 'probe',
      look: { card: { style: STYLE } },
      placed: one,
      render: () => {},
    });
    const motionOf = (p: Panel) =>
      Option.getOrThrow(
        boardFrameAt(
          boardClock([Shot.Boarded({ beat: p.beat, panel: p, at: 0, from: 0 })], [], 5, 30),
          0,
        ),
      ).layers[0]!.motion;
    const candidates = Array.from({ length: 40 }, (_, k) => ({
      ...panel('one', { kept: 2 }),
      id: `one.m${k}`,
    }));
    const first = (tag: string, dir?: number) =>
      candidates.find((p) => {
        const m = motionOf(p);
        return m._tag === tag && (dir === undefined || ('dir' in m && m.dir === dir));
      })!;
    const rectAt = (p: Panel, T: number) => {
      const calls: Array<ReadonlyArray<unknown>> = [];
      const r = recorder(1920, 1080, {
        onCall: (key, args) => {
          if (key === 'drawImage') calls.push(args);
        },
      });
      withDom(() => {
        const { images } = tries();
        boardFilm(f, { ...board, panels: [p] }, images, false).render(r.ctx, T);
      });
      expect(calls).toHaveLength(1);
      const [image, ...at] = calls[0]! as [{ width: number; height: number }, ...Array<number>];
      const [x, y, dw, dh] = Match.value(at.length).pipe(
        Match.when(2, () => [at[0]!, at[1]!, image.width, image.height]),
        Match.when(4, () => at),
        Match.orElse(() => at.slice(4)),
      );
      const m = r.images[0]!.m;
      const [left, top] = applyAffine(m, [x!, y!]);
      const [right, bottom] = applyAffine(m, [x! + dw!, y! + dh!]);
      return { left, top, right, bottom };
    };
    const covers = (rect: ReturnType<typeof rectAt>, spare: number) => {
      expect(rect.left).toBeLessThanOrEqual(-spare + 1e-6);
      expect(rect.right).toBeGreaterThanOrEqual(1920 + spare - 1e-6);
      expect(rect.top).toBeLessThanOrEqual(1e-6);
      expect(rect.bottom).toBeGreaterThanOrEqual(1080 - 1e-6);
    };
    const push = first('PushIn');
    covers(rectAt(push, 0), 0);
    covers(rectAt(push, 5), 0);
    for (const dir of [1, -1]) {
      const pan = first('Pan', dir);
      const [start, end] = [rectAt(pan, 0), rectAt(pan, 5)];
      covers(start, 1);
      covers(end, 1);
      expect(end.left - start.left).toBeCloseTo(dir * 0.04 * 1920, 6);
    }
  });

  test('lays the incoming shot over the outgoing one inside a cut, at the share of the dissolve passed', () => {
    const { film: f } = filmOf(() => false);
    const both: BoardFile = {
      ...emptyBoard('probe'),
      panels: [panel('one', { kept: 2 }), panel('two', { kept: 1 })],
    };
    const r = recorder(1920, 1080);
    const { kept, second } = withDom(() => {
      const { kept, images } = tries();
      const second = document.createElement('canvas');
      second.width = 1536;
      second.height = 1024;
      const all = new Map([...images, ['two.start.1.png', second]]);
      boardFilm(f, both, all, false).render(r.ctx, 5.1);
      return { kept, second };
    });
    expect(r.images).toHaveLength(2);
    const [under, over] = r.images;
    expect(under!.image).toBe(kept as never);
    expect(under!.alpha).toBe(1);
    expect(over!.image).not.toBe(kept as never);
    expect(over!.image).not.toBe(second as never);
    expect(over!.alpha).toBeCloseTo(0.7, 9);
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
