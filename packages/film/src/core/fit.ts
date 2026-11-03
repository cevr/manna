type Pt = readonly [number, number];

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
};

type Cubic = readonly [Pt, Pt, Pt, Pt];

const at = (c: Cubic, t: number): Pt => {
  const s = 1 - t;
  return [
    s * s * s * c[0][0] + 3 * s * s * t * c[1][0] + 3 * s * t * t * c[2][0] + t * t * t * c[3][0],
    s * s * s * c[0][1] + 3 * s * s * t * c[1][1] + 3 * s * t * t * c[2][1] + t * t * t * c[3][1],
  ];
};

const slopes = (c: Cubic, t: number): readonly [Pt, Pt] => {
  const s = 1 - t;
  const d1: Pt = add(
    add(mul(sub(c[1], c[0]), 3 * s * s), mul(sub(c[2], c[1]), 6 * s * t)),
    mul(sub(c[3], c[2]), 3 * t * t),
  );
  const d2: Pt = add(
    mul(add(sub(c[2], mul(c[1], 2)), c[0]), 6 * s),
    mul(add(sub(c[3], mul(c[2], 2)), c[1]), 6 * t),
  );
  return [d1, d2];
};

const chordShares = (pts: ReadonlyArray<Pt>): number[] => {
  const u = [0];
  for (let i = 1; i < pts.length; i++)
    u.push((u[i - 1] ?? 0) + len(sub(pts[i] ?? [0, 0], pts[i - 1] ?? [0, 0])));
  const total = u[u.length - 1] ?? 1;
  return u.map((v) => (total === 0 ? 0 : v / total));
};

const cubicOf = (pts: ReadonlyArray<Pt>, u: ReadonlyArray<number>, t1: Pt, t2: Pt): Cubic => {
  const p0 = pts[0] ?? [0, 0];
  const p3 = pts[pts.length - 1] ?? [0, 0];
  let [c00, c01, c11, x0, x1] = [0, 0, 0, 0, 0];
  pts.forEach((p, i) => {
    const t = u[i] ?? 0;
    const s = 1 - t;
    const a1 = mul(t1, 3 * s * s * t);
    const a2 = mul(t2, 3 * s * t * t);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(p, add(mul(p0, s * s * s + 3 * s * s * t), mul(p3, 3 * s * t * t + t * t * t)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  });
  const det = c00 * c11 - c01 * c01;
  const chord = len(sub(p3, p0));
  let [alpha1, alpha2] =
    det === 0 ? [0, 0] : [(x0 * c11 - x1 * c01) / det, (c00 * x1 - c01 * x0) / det];
  if (!(alpha1 > 0 && alpha2 > 0)) [alpha1, alpha2] = [chord / 3, chord / 3];
  return [p0, add(p0, mul(t1, alpha1)), add(p3, mul(t2, alpha2)), p3];
};

const worst = (c: Cubic, pts: ReadonlyArray<Pt>, u: ReadonlyArray<number>) => {
  let [far, i] = [0, Math.floor(pts.length / 2)];
  pts.forEach((p, k) => {
    const d = len(sub(at(c, u[k] ?? 0), p));
    if (d > far) [far, i] = [d, k];
  });
  return { far, i };
};

const reshared = (c: Cubic, pts: ReadonlyArray<Pt>, u: ReadonlyArray<number>): number[] =>
  pts.map((p, k) => {
    const t = u[k] ?? 0;
    const [d1, d2] = slopes(c, t);
    const off = sub(at(c, t), p);
    const den = dot(d1, d1) + dot(off, d2);
    return den === 0 ? t : Math.min(1, Math.max(0, t - dot(off, d1) / den));
  });

const RESHARES = 4;

const fitRun = (pts: ReadonlyArray<Pt>, t1: Pt, t2: Pt, tol: number): Cubic[] => {
  const p0 = pts[0] ?? [0, 0];
  const p3 = pts[pts.length - 1] ?? [0, 0];
  if (pts.length <= 2) {
    const d = len(sub(p3, p0)) / 3;
    return [[p0, add(p0, mul(t1, d)), add(p3, mul(t2, d)), p3]];
  }
  let u = chordShares(pts);
  let c = cubicOf(pts, u, t1, t2);
  let w = worst(c, pts, u);
  for (let k = 0; k < RESHARES && w.far > tol && w.far < tol * 4; k++) {
    u = reshared(c, pts, u);
    c = cubicOf(pts, u, t1, t2);
    w = worst(c, pts, u);
  }
  if (w.far <= tol) return [c];
  const split = Math.min(pts.length - 2, Math.max(1, w.i));
  const centre = unit(sub(pts[split - 1] ?? p0, pts[split + 1] ?? p3));
  return [
    ...fitRun(pts.slice(0, split + 1), t1, centre, tol),
    ...fitRun(pts.slice(split), mul(centre, -1), t2, tol),
  ];
};

const leaving = (
  pts: ReadonlyArray<Pt>,
  i: number,
  dir: 1 | -1,
  reach: number,
  closed: boolean,
) => {
  const n = pts.length;
  const p = pts[i] ?? [0, 0];
  let q = p;
  for (let k = 1; k < n; k++) {
    const j = closed ? (i + dir * k + n * 4) % n : i + dir * k;
    if (j < 0 || j >= n) break;
    q = pts[j] ?? p;
    if (len(sub(q, p)) >= reach) break;
  }
  return unit(sub(q, p));
};

interface FitOpts {
  readonly tolerance: number;
  readonly reach: number;
  readonly corner: number;
}

export const SHEET_FIT: FitOpts = { tolerance: 1, reach: 6, corner: (50 * Math.PI) / 180 };

const cornersOf = (pts: ReadonlyArray<Pt>, opts: FitOpts): number[] => {
  const n = pts.length;
  const turn = pts.map((_, i) => {
    const a = leaving(pts, i, -1, opts.reach, true);
    const b = leaving(pts, i, 1, opts.reach, true);
    return Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  });
  const out: number[] = [];
  turn.forEach((t, i) => {
    if (t < opts.corner) return;
    for (let k = 1; k <= opts.reach; k++) {
      const before = turn[(i - k + n) % n] ?? 0;
      const after = turn[(i + k) % n] ?? 0;
      if (before > t || after >= t) return;
    }
    out.push(i);
  });
  return out;
};

const chainOf = (cubics: ReadonlyArray<Cubic>): Pt[] => cubics.flatMap((c) => [c[0], c[1], c[2]]);

const evenly = (line: ReadonlyArray<Pt>): Pt[] => {
  const out: Pt[] = [];
  line.forEach((a, i) => {
    const b = line[(i + 1) % line.length] ?? a;
    const k = Math.max(1, Math.round(len(sub(b, a))));
    for (let j = 0; j < k; j++) out.push(add(a, mul(sub(b, a), j / k)));
  });
  return out;
};

export const fitClosed = (line: ReadonlyArray<Pt>, opts: FitOpts): Pt[] => {
  const pts = evenly(line);
  const n = pts.length;
  if (n < 4) return chainOf([]);
  const corners = cornersOf(pts, opts);
  if (corners.length === 0) {
    const t = unit(sub(pts[1] ?? [0, 0], pts[n - 1] ?? [0, 0]));
    return chainOf(fitRun([...pts, pts[0] ?? [0, 0]], t, mul(t, -1), opts.tolerance));
  }
  const cubics = corners.flatMap((c, k) => {
    const next = corners[(k + 1) % corners.length] ?? c;
    const span = next > c ? next - c : next + n - c;
    const run = Array.from({ length: span + 1 }, (_, j): Pt => pts[(c + j) % n] ?? [0, 0]);
    const t1 = leaving(run, 0, 1, opts.reach, false);
    const t2 = leaving(run, run.length - 1, -1, opts.reach, false);
    return fitRun(run, t1, t2, opts.tolerance);
  });
  return chainOf(cubics);
};

const cubicsOf = (chain: ReadonlyArray<Pt>): Cubic[] => {
  const n = Math.floor(chain.length / 3);
  return Array.from({ length: n }, (_, j) => [
    chain[3 * j] ?? [0, 0],
    chain[3 * j + 1] ?? [0, 0],
    chain[3 * j + 2] ?? [0, 0],
    chain[(3 * j + 3) % (3 * n)] ?? [0, 0],
  ]);
};

export const anchorsOf = (chain: ReadonlyArray<Pt>): Pt[] => chain.filter((_, i) => i % 3 === 0);

export const flattened = (chain: ReadonlyArray<Pt>, step: number): Pt[] =>
  cubicsOf(chain).flatMap((c) => {
    const rough = len(sub(c[1], c[0])) + len(sub(c[2], c[1])) + len(sub(c[3], c[2]));
    const k = Math.max(1, Math.ceil(rough / step));
    return Array.from({ length: k }, (_, i) => at(c, i / k));
  });

export const anchorTurns = (chain: ReadonlyArray<Pt>): number[] => {
  const cubics = cubicsOf(chain);
  const n = cubics.length;
  return cubics.map((c, j) => {
    const prev = cubics[(j - 1 + n) % n] ?? c;
    const inward = unit(sub(prev[2], prev[3]));
    const arrive = len(inward) === 0 ? unit(sub(prev[1], prev[3])) : inward;
    const outward = unit(sub(c[1], c[0]));
    const leave = len(outward) === 0 ? unit(sub(c[2], c[0])) : outward;
    return Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(arrive, leave))));
  });
};

export const chainThrough = (pts: ReadonlyArray<Pt>): Pt[] => {
  const n = pts.length;
  return pts.flatMap((p, i) => {
    const prev = pts[(i - 1 + n) % n] ?? p;
    const next = pts[(i + 1) % n] ?? p;
    const after = pts[(i + 2) % n] ?? p;
    return [p, add(p, mul(sub(next, prev), 1 / 6)), sub(next, mul(sub(after, p), 1 / 6))];
  });
};
