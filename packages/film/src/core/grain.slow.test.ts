import { describe, expect, test } from 'bun:test';
import { grainOf } from './grain.ts';
import type { Raster } from './raster.ts';

const SIDE = 40;

/** A seeded normal draw (Box-Muller over a small LCG), so the noise is the same each run. */
const normals = (seed: number) => {
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return (s + 0.5) / 2 ** 32;
  };
  return () => Math.sqrt(-2 * Math.log(next())) * Math.cos(2 * Math.PI * next());
};

/** A `SIDE` square whose G at (x, y) is `g(x, y)`, R and B flat. */
const square = (g: (x: number, y: number) => number): Raster => {
  const rgba = new Uint8Array(SIDE * SIDE * 4);
  for (let i = 0; i < SIDE * SIDE; i++)
    rgba.set(
      [200, Math.max(0, Math.min(255, Math.round(g(i % SIDE, Math.floor(i / SIDE))))), 150, 255],
      i * 4,
    );
  return { width: SIDE, height: SIDE, rgba };
};

const ALL = new Uint8Array(SIDE * SIDE).fill(1);

/** White noise of std σ less its 3 × 3 mean has std σ·√(8/9). */
const SIGMA = 4;
const EXPECTED = SIGMA * Math.sqrt(8 / 9);

describe('grainOf', () => {
  test('reads no grain on flat paint, both ways, over every whole window', () => {
    const g = grainOf(
      square(() => 140),
      ALL,
    );
    expect(g).toEqual({ robust: 0, plain: 0, n: (SIDE - 2) ** 2 });
  });

  test('reads noise of std 4 as its high pass, both ways, within 10%', () => {
    const draw = normals(7);
    const g = grainOf(
      square(() => 140 + SIGMA * draw()),
      ALL,
    );
    expect(Math.abs(g.robust - EXPECTED) / EXPECTED).toBeLessThan(0.1);
    expect(Math.abs(g.plain - EXPECTED) / EXPECTED).toBeLessThan(0.1);
  });

  test('reads the same noise across an edge between two paints: the robust std as the noise, the plain one inflated by its two edge columns', () => {
    const draw = normals(7);
    const g = grainOf(
      square((x) => ([170, 110][Number(x < SIDE / 2)] ?? 0) + SIGMA * draw()),
      ALL,
    );
    expect(Math.abs(g.robust - EXPECTED) / EXPECTED).toBeLessThan(0.15);
    expect(g.plain).toBeGreaterThan(1.4 * EXPECTED);
  });

  test('reads only the windows its mask holds whole', () => {
    const strip = Uint8Array.from(ALL, (_, i) => Number(Math.floor(i / SIDE) < 3));
    expect(
      grainOf(
        square(() => 140),
        strip,
      ).n,
    ).toBe(SIDE - 2);
  });
});
