import { rng } from '../../core/random.ts';
import type { Garment, Tunic } from '../parts/body.ts';
import type { Pt } from './parts.ts';

const STEP = 40;

export const roundedPolygon = (
  corners: ReadonlyArray<Pt>,
  r: number | ReadonlyArray<number>,
): Pt[] => {
  const n = corners.length;
  const none: ReadonlyArray<number> = [];
  const radii = none.concat(r);
  const radius = (i: number) => (radii.length === 1 ? radii[0] : radii[i % n]) ?? 0;
  const out: Pt[] = [];
  corners.forEach((c, i) => {
    const prev = corners[(i - 1 + n) % n] ?? c;
    const next = corners[(i + 1) % n] ?? c;
    const toward = (p: Pt, d: number): Pt => {
      const len = Math.hypot(p[0] - c[0], p[1] - c[1]);
      const k = Math.min(d, len / 3) / len;
      return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
    };
    const a = toward(prev, radius(i));
    const b = toward(next, radius(i));
    out.push(a, [(a[0] + b[0] + 2 * c[0]) / 4, (a[1] + b[1] + 2 * c[1]) / 4], b);
    const end = ((): Pt => {
      const after = corners[(i + 2) % n] ?? next;
      const len = Math.hypot(after[0] - next[0], after[1] - next[1]);
      const back = Math.hypot(c[0] - next[0], c[1] - next[1]);
      const k = Math.min(radius(i + 1), back / 3, len / 3) / back;
      return [next[0] + (c[0] - next[0]) * k, next[1] + (c[1] - next[1]) * k];
    })();
    const run = Math.hypot(end[0] - b[0], end[1] - b[1]);
    const steps = Math.floor(run / STEP);
    for (let s = 1; s < steps; s++)
      out.push([b[0] + ((end[0] - b[0]) * s) / steps, b[1] + ((end[1] - b[1]) * s) / steps]);
  });
  return out;
};

const tunicOutline = (t: Tunic): Pt[] =>
  roundedPolygon(
    [
      [-t.half.neck, t.neck],
      [t.half.neck, t.neck],
      [t.half.hem, t.hem],
      [-t.half.hem, t.hem],
    ],
    t.radius,
  ).map(([x, y]): Pt => {
    const k = (y - t.neck) / (t.hem - t.neck);
    return k > 0 && k < 1 ? [x + Math.sign(x) * t.bow * Math.sin(Math.PI * k), y] : [x, y];
  });

export const garmentOutline = (g: Garment): ReadonlyArray<Pt> => {
  switch (g._tag) {
    case 'Tunic':
      return tunicOutline(g);
    case 'CutRobe':
      return roundedPolygon(g.corners, g.radii);
    case 'TracedRobe':
      return g.outline;
  }
};

const SHOE: ReadonlyArray<Pt> = [
  [-0.9, 0],
  [-1, -0.06],
  [-1, -0.14],
  [-0.95, -0.28],
  [-0.84, -0.42],
  [-0.69, -0.56],
  [-0.5, -0.69],
  [-0.24, -0.83],
  [0.1, -0.94],
  [0.41, -0.97],
  [0.66, -0.86],
  [0.8, -0.67],
  [0.91, -0.5],
  [0.97, -0.35],
  [1, -0.14],
  [1, -0.06],
  [0.93, 0],
  [0, 0],
];

export const SHOE_POINTS = SHOE.length;

export const shoeOutline = (w: number, h: number, toe: -1 | 1): Pt[] => {
  const pts = SHOE.map(([x, y]): Pt => [-toe * x * (w / 2), y * h]);
  return toe < 0 ? pts : pts.reverse();
};

const FADE = 0.4;

export const shoeLight = (
  w: number,
  h: number,
  toe: -1 | 1,
  from: number,
  to: number,
  width: number,
): Pt[] => {
  const outline = SHOE.map(([x, y]): Pt => [-toe * x * (w / 2), y * h]);
  const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length;
  const cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
  const run = Array.from(
    { length: Math.abs(to - from) + 1 },
    (_, k) => from + Math.sign(to - from) * k,
  );
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  run.forEach((i, k) => {
    const p = outline[i] ?? [0, 0];
    const prev = outline[i - 1] ?? p;
    const next = outline[i + 1] ?? p;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const facing = -ty * (cx - p[0]) + tx * (cy - p[1]) < 0 ? -1 : 1;
    const [nx, ny] = [(-ty / len) * facing, (tx / len) * facing];
    const share = k / (run.length - 1);
    const reach = width * Math.min(1, (1 - share) / FADE);
    outer.push([p[0] - nx * 2, p[1] - ny * 2]);
    inner.push([p[0] + nx * reach, p[1] + ny * reach]);
  });
  return [...outer, ...inner.reverse()];
};

export const shifted = (pts: ReadonlyArray<Pt>, dx: number, dy: number): Pt[] =>
  pts.map(([x, y]): Pt => [x + dx, y + dy]);

export const blotOutline = (rx: number, ry: number, wander: number, seed: number): Pt[] => {
  const r = rng(seed);
  const n = 14;
  return Array.from({ length: n }, (_, i): Pt => {
    const a = (i / n) * 2 * Math.PI;
    const k = 1 + (r() - 0.5) * 2 * wander;
    return [Math.cos(a) * rx * k, Math.sin(a) * ry * k];
  });
};

export const inside = (p: Pt, poly: ReadonlyArray<Pt>) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? p;
    const [xj, yj] = poly[j] ?? p;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

interface Nearest {
  readonly at: Pt;
  readonly d: number;
  readonly n: Pt;
}

const nearestEdge = (p: Pt, poly: ReadonlyArray<Pt>, only?: ReadonlyArray<boolean>) => {
  let best: Nearest = { at: p, d: Infinity, n: [0, 0] };
  poly.forEach((a, i) => {
    if (only !== undefined && only[i] !== true) return;
    const b = poly[(i + 1) % poly.length] ?? a;
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const len2 = ex * ex + ey * ey;
    if (len2 === 0) return;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / len2));
    const at: Pt = [a[0] + ex * t, a[1] + ey * t];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (d >= best.d) return;
    const len = Math.sqrt(len2);
    const n: Pt = [-ey / len, ex / len];
    const into = inside([at[0] + n[0] * 0.5, at[1] + n[1] * 0.5], poly) ? 1 : -1;
    best = { at, d, n: [n[0] * into, n[1] * into] };
  });
  return best;
};

export const fromEdge = (p: Pt, poly: ReadonlyArray<Pt>) => nearestEdge(p, poly).d;

interface Walked {
  readonly p: Pt;
  readonly cut: boolean;
}

const resampled = (pts: ReadonlyArray<Pt>, step: number) =>
  pts.flatMap((a, i) => {
    const b = pts[(i + 1) % pts.length] ?? a;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    return Array.from({ length: n }, (_, k): Walked => ({
      p: [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n],
      cut: k === 0,
    }));
  });

const TUCK = { depth: 3.5, reach: 5, step: 3 } as const;

const tuckOne = ({ p, cut }: Walked, fronts: ReadonlyArray<ReadonlyArray<Pt>>): Pt[] => {
  let best: { readonly to: Pt; readonly w: number } | undefined;
  for (const front of fronts) {
    const e = nearestEdge(p, front);
    const under = inside(p, front) ? e.d : -e.d;
    if (under >= TUCK.depth) return cut ? [p] : [];
    if (under <= -TUCK.reach) continue;
    const t = Math.max(0, Math.min(1, (under + TUCK.reach) / (TUCK.reach / 2)));
    const w = t * t * (3 - 2 * t);
    if (best !== undefined && best.w >= w) continue;
    best = { to: [e.at[0] + e.n[0] * TUCK.depth, e.at[1] + e.n[1] * TUCK.depth], w };
  }
  if (best === undefined || best.w === 0) return cut ? [p] : [];
  const { to, w } = best;
  return [[+(p[0] + (to[0] - p[0]) * w).toFixed(2), +(p[1] + (to[1] - p[1]) * w).toFixed(2)]];
};

export const tucked = (back: ReadonlyArray<Pt>, fronts: ReadonlyArray<ReadonlyArray<Pt>>): Pt[] =>
  resampled(back, TUCK.step).flatMap((w) => tuckOne(w, fronts));

const SEAM = 1.5;

const seamsOf = (front: ReadonlyArray<Pt>, back: ReadonlyArray<Pt>) =>
  front.map((a, i) => {
    const b = front[(i + 1) % front.length] ?? a;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return inside(mid, back) && nearestEdge(mid, back).d > SEAM;
  });

export const tuckedRimmed = (
  back: ReadonlyArray<Pt>,
  fronts: ReadonlyArray<ReadonlyArray<Pt>>,
  deep: number,
): Pt[] => {
  const seams = fronts.map((front) => seamsOf(front, back));
  return resampled(back, TUCK.step).flatMap((walked): Pt[] => {
    const { p, cut } = walked;
    const keep = (): Pt[] => (cut ? [p] : []);
    const under = fronts.findIndex((front) => inside(p, front));
    const front = fronts[under];
    if (front === undefined) return tuckOne(walked, fronts);
    const e = nearestEdge(p, front, seams[under]);
    if (e.d >= deep) return keep();
    const to: Pt = [e.at[0] + e.n[0] * deep, e.at[1] + e.n[1] * deep];
    if (!inside(to, front) || nearestEdge(to, front).d < TUCK.depth) return keep();
    return [[+to[0].toFixed(2), +to[1].toFixed(2)]];
  });
};
