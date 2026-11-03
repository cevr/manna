import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import type { Film } from './film.ts';
import { recorder } from './fixtures/stand-in.ts';
import { scenesReview } from './review.ts';
import { layout, sceneAt } from '../core/layout.ts';

describe("a scenes render's review copy", () => {
  /** Beats `one` (a line with a mark) and `two`, 5 s each from 0, on an estimate. */
  const beats = Result.getOrThrow(
    layout(
      [
        { id: 'one', say: 'A baby {cup}drinks milk.', min: 5 },
        { id: 'two', say: 'Nobody minds.', min: 5 },
      ],
      { voice: '', scenes: {} },
      30,
    ),
  );
  /** A film of `beats` that logs each call in order (its own draw, then the burn-in's text); a card holds over `cards`. */
  const filmOf = (cards: (T: number) => boolean) => {
    const calls: Array<string> = [];
    const f: Film = Schema.decodeSync(Schema.Any)({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 10,
      title: 'probe',
      placed: beats,
      sceneAt: (T: number) => Option.getOrThrow(sceneAt(beats, T)),
      render: (_ctx: CanvasRenderingContext2D, T: number) => calls.push(`drew ${T}`),
      cardAt: cards,
    });
    return { film: f, calls };
  };
  const said = (cards: (T: number) => boolean, T: number) => {
    const { film, calls } = filmOf(cards);
    const r = recorder(1920, 1080, {
      onCall: (key, args) => {
        if (key === 'fillText') calls.push(String(args[0]));
      },
    });
    scenesReview(film).render(r.ctx, T);
    return calls;
  };

  test('draws the film, then burns in the time, the beat and the last mark said over it', () => {
    expect(said(() => false, 0.2)).toEqual(['drew 0.2', '0:00.2 · one · start']);
    expect(said(() => false, 4.5)).toEqual(['drew 4.5', '0:04.5 · one · cup']);
    expect(said(() => false, 6)).toEqual(['drew 6', '0:06.0 · two · start']);
  });

  test('names a card its scenes set there', () => {
    expect(said((T) => T > 5, 6)).toEqual(['drew 6', '0:06.0 · two · card']);
  });

  test("reads the film's seconds on every frame, as its burn-in says them", () => {
    const { film } = filmOf(() => false);
    const reviewed = scenesReview({ ...film, filmTimed: () => false });
    expect([0, 3, 7.5].map((T) => reviewed.filmTimed?.(T))).toEqual([true, true, true]);
  });
});
