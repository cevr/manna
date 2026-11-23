import { describe, expect, test } from 'bun:test';
import { Array as Arr } from 'effect';
import { type Film, type RenderOptions, createFilm } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import { stroke } from './ink.ts';
import type { ProbeSink } from './probe.ts';
import { createShort } from './short.ts';

const W = 320;
const H = 180;

/** A film of one held scene: a stroke that boils and never moves. */
const held = (): Film =>
  withDom(() =>
    createFilm({
      fps: 30,
      title: 'steady',
      width: W,
      height: H,
      paper: { base: '#ffffff', tone: '#000000', seed: 1 },
      shade: '#000000',
      scenes: [
        {
          id: 'held',
          min: 4,
          drift: 0,
          draw: (f) =>
            stroke(
              f.ctx,
              [
                [40, 40],
                [160, 90],
                [280, 60],
              ],
              { color: '#000', width: 6 },
              { boil: f.boil, seed: 7 },
            ),
        },
      ],
    }),
  );

/** The stroke's probed points at each of the open's half second of frames, drawn with `opts`. */
const strokes = (film: Film, opts: RenderOptions) =>
  Arr.makeBy(8, (k) => {
    const sink: ProbeSink = { texts: [], inks: [] };
    withDom(() =>
      film.render(recorder(film.width, film.height).ctx, (2 * k) / 30, { ...opts, probe: sink }),
    );
    return sink.inks.flatMap((m) => m.points.flat()).join(' ');
  });

describe('a steady draw (`RenderOptions.boil`)', () => {
  test('a held stroke boils frame to frame, and draws the same on one tick', () => {
    const film = held();
    const boiling = strokes(film, {});
    expect(new Set(boiling).size).toBeGreaterThan(1);
    const steady = strokes(film, { boil: 0 });
    expect(new Set(steady).size).toBe(1);
  });

  test("a short's band draws steady when its page does", () => {
    const short = createShort(held(), {
      id: 'cut',
      title: 'Cut',
      spans: [{ scene: 'held', from: { at: 'start' }, to: { at: 'end' } }],
    });
    const steady = strokes(short, { boil: 0, captions: false });
    expect(steady[0]?.length).toBeGreaterThan(0);
    expect(new Set(steady).size).toBe(1);
  });
});
