import { describe, expect, test } from 'bun:test';
import type { Camera } from './camera.ts';
import { FIBRE_SIZE, planeFibre } from './fibre.ts';
import { isPattern, recorder, withDom } from './fixtures/stand-in.ts';

const W = 1920;
const H = 1080;

const wrap = (n: number, period: number) => ((n % period) + period) % period;

const driftAt = (view: Camera, p: number) => {
  const r = recorder(W, H);
  withDom(() => planeFibre(r.ctx, view, W, H));
  const fill = r.fills[0];
  const period = fill !== undefined && isPattern(fill.style) ? fill.style.tile.width : 0;
  expect(period).toBeGreaterThan(0);
  const zoom = view.zoom ?? 1;
  const screen = W / 2 + zoom * (p - view.x);
  const laid = wrap(screen - (fill?.m[4] ?? 0), period);
  const own = (wrap(p, FIBRE_SIZE) / FIBRE_SIZE) * period;
  const off = Math.abs(laid - own);
  return Math.min(off, period - off);
};

const edges = (view: Camera): readonly [number, number] => {
  const zoom = view.zoom ?? 1;
  return [view.x - W / 2 / zoom, view.x + W / 2 / zoom];
};

describe('planeFibre', () => {
  for (const zoom of [1, 1.03, 1.37, 2.46])
    for (const x of [960, 2400, -1700])
      test(`holds the grain at the frame's edge with the plane at zoom ${zoom}, looking at x ${x}`, () => {
        const view: Camera = { x, y: 540, zoom };
        for (const p of edges(view)) expect(driftAt(view, p)).toBeLessThanOrEqual(2);
      });
});
