// A painted plate drawn as a plane (`f.painting`, `drawPainting`): the image
// lands under the current transform, then translate(at) and scale(scale);
// the probe's quad comes from that same matrix, whether the image is drawn
// (a page) or not (Bun); an edge shows only strictly inside the frame; and a
// name the drawing does not declare fails to compile.

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { createFilm, drawing } from './film.ts';
import { type PaintingSpec, drawPainting, paintingQuad, shownEdges } from './painting.ts';
import { type PaintingMark, type Probe, probeOf, probing } from './probe.ts';
import { applyAffine, recorder, withDom } from './fixtures/stand-in.ts';

const SPEC: PaintingSpec = {
  key: 'test/plate',
  png: 'plate.png',
  size: [400, 200],
  at: [30, -20],
  scale: 1.5,
};

/** A probe whose sink collects paintings. */
const probeFor = (marks: PaintingMark[]): Probe => ({
  sink: { texts: [], inks: [], paintings: marks },
  scene: 'plate',
  dx: 0,
  alpha: 1,
});

describe('a painted plate', () => {
  it('draws its image under the transform, then translate(at) and scale(scale), and probes that quad', () => {
    const marks: PaintingMark[] = [];
    const rec = recorder(1920, 1080);
    const image = withDom(() => document.createElement('canvas'));
    const ctx = rec.ctx;
    ctx.translate(100, 50);
    ctx.rotate(0.25);
    ctx.scale(1.2, 1.2);
    probing(ctx, probeFor(marks), () =>
      drawPainting(ctx, SPEC, { image: Option.some(image) }, probeOf(ctx)),
    );
    const [drawn] = rec.images;
    // The image's own (0, 0) and (w, h) land where at + scale · (u, v) lands under the entry transform.
    const entry = rec.now();
    const expectAt = (u: number, v: number) => applyAffine(entry, [30 + 1.5 * u, -20 + 1.5 * v]);
    expect(drawn).toBeDefined();
    for (const [u, v] of [
      [0, 0],
      [400, 0],
      [400, 200],
      [0, 200],
    ] as const) {
      const got = applyAffine(drawn?.m ?? entry, [u, v]);
      expect(got[0]).toBeCloseTo(expectAt(u, v)[0], 9);
      expect(got[1]).toBeCloseTo(expectAt(u, v)[1], 9);
    }
    // The state is put back, and the probe's quad is the drawn rectangle's corners.
    expect(rec.now()).toEqual(entry);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.key).toBe('test/plate');
    marks[0]?.quad.forEach((corner, i) => {
      const [u, v] = (
        [
          [0, 0],
          [400, 0],
          [400, 200],
          [0, 200],
        ] as const
      )[i] ?? [0, 0];
      expect(corner[0]).toBeCloseTo(expectAt(u, v)[0], 9);
      expect(corner[1]).toBeCloseTo(expectAt(u, v)[1], 9);
    });
  });

  it('with no image draws nothing and still probes the same quad', () => {
    const marks: PaintingMark[] = [];
    const rec = recorder(1920, 1080);
    rec.ctx.translate(-12, 7);
    probing(rec.ctx, probeFor(marks), () =>
      drawPainting(rec.ctx, SPEC, { image: Option.none() }, probeOf(rec.ctx)),
    );
    expect(rec.images).toEqual([]);
    expect(marks[0]?.quad).toEqual(paintingQuad(rec.ctx.getTransform(), SPEC));
    expect(marks[0]?.quad[0]).toEqual([30 - 12, -20 + 7]);
  });

  it('shows an edge only strictly inside the frame', () => {
    const frame = (x: number, y: number, w: number, h: number) =>
      paintingQuad(
        { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        { key: 'q', png: 'q.png', size: [w, h], at: [x, y] },
      );
    // Covering the frame with edges exactly on its border: none shows.
    expect(shownEdges(frame(0, 0, 1920, 1080), 1920, 1080)).toEqual([]);
    // Wider on every side: none shows.
    expect(shownEdges(frame(-50, -50, 2020, 1180), 1920, 1080)).toEqual([]);
    // Moved 24 px right: its left edge shows.
    expect(shownEdges(frame(24, -50, 2020, 1180), 1920, 1080)).toEqual(['left']);
    // Small and inside: all four show.
    expect(shownEdges(frame(100, 100, 50, 50), 1920, 1080)).toEqual([
      'top',
      'right',
      'bottom',
      'left',
    ]);
  });

  it('takes only the paintings its drawing declares', () => {
    const sky = drawing({
      timeline: {},
      paintings: { sky: SPEC },
      draw: (f) => {
        f.painting('sky');
        // @ts-expect-error: `nope` is no painting this drawing declares.
        f.painting('nope');
      },
    });
    const bare = drawing({
      timeline: {},
      draw: (f) => {
        // @ts-expect-error: a drawing that declares no paintings paints none.
        f.painting('sky');
      },
    });
    const film = createFilm({
      fps: 30,
      title: 'plates',
      paper: { base: '#ffffff', tone: '#000000', seed: 1 },
      shade: '#000000',
      scenes: [
        { id: 'a', min: 4, ...sky },
        { id: 'b', min: 4, ...sky },
        { id: 'c', min: 4, ...bare },
      ],
    });
    // Declared once across the scenes that share it.
    expect(film.paintings.declared).toEqual([SPEC]);
  });
});
