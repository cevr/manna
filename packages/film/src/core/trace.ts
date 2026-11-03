import { Result, Schema } from 'effect';
import { SHEET_FIT, anchorTurns, anchorsOf, fitClosed } from './fit.ts';
import { type LabelTable, labelRegions, touchingIn } from './label.ts';
import type { Raster } from './raster.ts';

export type TracePt = readonly [number, number];

type TraceBox = readonly [number, number, number, number];

type TraceAs = 'outline' | 'tones' | 'circle' | 'curls' | 'marks' | 'none';

export interface TracePart {
  readonly seeds?: ReadonlyArray<TracePt>;
  readonly label?: string;
  readonly classes?: ReadonlyArray<string>;
  readonly silhouette?: boolean;
  readonly reach?: 'core' | 'figure';
  readonly within?: string;
  readonly inside?: string;
  readonly colour?: { readonly near: string; readonly far: ReadonlyArray<string> };
  readonly clip?: ReadonlyArray<TracePt>;
  readonly plus?: ReadonlyArray<string>;
  readonly minus?: ReadonlyArray<string>;
  readonly grow?: number;
  readonly into?: 'dark' | 'ink';
  readonly as?: TraceAs;
  readonly min?: number;
  readonly smooth?: number;
  readonly open?: number;
  readonly close?: number;
  readonly shrink?: number;
  readonly sharp?: ReadonlyArray<TracePt>;
  readonly edge?: 'middle' | 'outer';
  readonly curl?: { readonly min: number; readonly max: number };
  readonly path?: 'points' | 'cubic';
  readonly doc?: string;
}

interface TraceMarkSeeds {
  readonly eyes: readonly [TracePt] | readonly [TracePt, TracePt];
  readonly brows: readonly [TracePt] | readonly [TracePt, TracePt];
  readonly mouth: TracePt | { readonly ends: readonly [TracePt, TracePt]; readonly line: number };
}

interface TraceView {
  readonly box: TraceBox;
  readonly classes: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly parts: Readonly<Record<string, TracePart>>;
  readonly labels?: LabelTable;
  readonly marks?: TraceMarkSeeds;
  readonly head?: string;
  readonly feet?: ReadonlyArray<string>;
  readonly path?: 'points' | 'cubic';
  readonly line?: 'ink' | 'brown';
}

export interface TraceSheetView extends TraceView {
  readonly out: string;
  readonly about: string;
}

export interface TraceSheet {
  readonly member: string;
  readonly sheet: string;
  readonly kind: string;
  readonly views: Readonly<Record<string, TraceSheetView>>;
}

export interface Traced {
  readonly outlines: Readonly<Record<string, ReadonlyArray<TracePt>>>;
  readonly tones: Readonly<Record<string, ReadonlyArray<ReadonlyArray<TracePt>>>>;
  readonly circles: Readonly<Record<string, { readonly at: TracePt; readonly r: number }>>;
  readonly curls: Readonly<
    Record<string, ReadonlyArray<{ readonly at: TracePt; readonly r: number }>>
  >;
  readonly marks?: TracedMarks;
  readonly head?: { readonly at: TracePt; readonly top: number; readonly height: number };
  readonly feet?: TracePt;
  readonly regions: ReadonlyArray<TraceRegion>;
  readonly labelled: Readonly<Record<string, TraceRegion>>;
}

interface TracedMarks {
  readonly eyes: readonly [TracePt, TracePt];
  readonly eye: readonly [number, number];
  readonly brows: readonly [readonly [TracePt, TracePt], readonly [TracePt, TracePt]];
  readonly brow: number;
  readonly mouth: readonly [TracePt, TracePt];
  readonly mouthLine: number;
}

interface TraceRegion {
  readonly id: number;
  readonly class: string;
  readonly at: TracePt;
  readonly box: TraceBox;
  readonly size: number;
  readonly colour: string;
}

const INK_LUMA = 40;

const GROUND_LUMA = 110;

const LINE_MAX = 10;

const LINE_MIN = 6;

const LINE_LUMA = 60;

const EDGE_AA = 2;

const GROW = 4;

const OPEN = 1;

const TURN_MAX = (150 * Math.PI) / 180;

const CUBIC_SMOOTH = 2;

const STEP = 9;

const SMOOTH = 3;

const TONE_MIN = 60;

const REGION_MIN = 12;

const SEED_REACH = 6;

const lumaAt = (r: Raster, i: number) =>
  0.299 * (r.rgba[i * 4] ?? 0) +
  0.587 * (r.rgba[i * 4 + 1] ?? 0) +
  0.114 * (r.rgba[i * 4 + 2] ?? 0);

const channels = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const hexOf = (c: readonly [number, number, number]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

interface Grid {
  readonly r: Raster;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
}

const sheetIndex = (g: Grid, k: number) =>
  (g.y0 + Math.floor(k / g.w)) * g.r.width + g.x0 + (k % g.w);

const neighbours4 = (g: Grid, k: number, out: Int32Array): number => {
  const x = k % g.w;
  const y = (k - x) / g.w;
  let n = 0;
  if (x > 0) out[n++] = k - 1;
  if (x < g.w - 1) out[n++] = k + 1;
  if (y > 0) out[n++] = k - g.w;
  if (y < g.h - 1) out[n++] = k + g.w;
  return n;
};

const flood = (
  g: Grid,
  from: ReadonlyArray<number>,
  through: (k: number) => boolean,
): Uint8Array => {
  const seen = new Uint8Array(g.w * g.h);
  const stack = from.filter((k) => through(k));
  for (const k of stack) seen[k] = 1;
  const near = new Int32Array(4);
  while (stack.length > 0) {
    const k = stack.pop() ?? 0;
    const count = neighbours4(g, k, near);
    for (let i = 0; i < count; i++) {
      const n = near[i] ?? 0;
      if (seen[n] === 0 && through(n)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return seen;
};

const edgePixels = (g: Grid): number[] => {
  const out: number[] = [];
  for (let x = 0; x < g.w; x++) out.push(x, (g.h - 1) * g.w + x);
  for (let y = 0; y < g.h; y++) out.push(y * g.w, y * g.w + g.w - 1);
  return out;
};

const filled = (g: Grid, mask: Uint8Array): Uint8Array => {
  const outside = flood(g, edgePixels(g), (k) => mask[k] === 0);
  return outside.map((o) => (o === 1 ? 0 : 1));
};

const around = (g: Grid, k: number, reach: number, visit: (n: number) => void) => {
  const [x, y] = [k % g.w, Math.floor(k / g.w)];
  const [x0, x1] = [Math.max(0, x - reach), Math.min(g.w - 1, x + reach)];
  const [y0, y1] = [Math.max(0, y - reach), Math.min(g.h - 1, y + reach)];
  for (let ny = y0; ny <= y1; ny++) for (let nx = x0; nx <= x1; nx++) visit(ny * g.w + nx);
};

const grown = (g: Grid, mask: Uint8Array, by: number, into: (k: number) => boolean): Uint8Array => {
  const out = mask.slice();
  let front: number[] = [];
  for (let k = 0; k < out.length; k++) if (out[k] === 1) front.push(k);
  for (let step = 0; step < by && front.length > 0; step++) {
    const taken: number[] = [];
    for (const k of front) {
      const x = k % g.w;
      const y = (k - x) / g.w;
      const x1 = Math.min(g.w - 1, x + 1);
      const y1 = Math.min(g.h - 1, y + 1);
      for (let ny = Math.max(0, y - 1); ny <= y1; ny++)
        for (let nx = Math.max(0, x - 1); nx <= x1; nx++) {
          const n = ny * g.w + nx;
          if (out[n] === 0 && into(n)) {
            out[n] = 1;
            taken.push(n);
          }
        }
    }
    front = taken;
  }
  return out;
};

const insidePolygon = (p: TracePt, poly: ReadonlyArray<TracePt>): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
};

interface Labelled {
  readonly label: Int32Array;
  readonly regions: ReadonlyArray<TraceRegion>;
}

const MAJORITY = 2;

const classesOf = (
  g: Grid,
  classes: Readonly<Record<string, ReadonlyArray<string>>>,
  interior: (k: number) => boolean,
): Int8Array => {
  const samples = Object.values(classes).flatMap((colours, c) =>
    colours.map((hex) => ({ c: c + 1, rgb: channels(hex) })),
  );
  const raw = new Int8Array(g.w * g.h);
  for (let k = 0; k < raw.length; k++) if (interior(k)) raw[k] = nearestClass(g, k, samples);
  const count = new Int32Array(samples.length + 2);
  const out = new Int8Array(raw.length);
  const tally = (n: number) => {
    const c = raw[n] ?? 0;
    if (c !== 0) count[c] = (count[c] ?? 0) + 1;
  };
  for (let k = 0; k < raw.length; k++) {
    if (raw[k] === 0) continue;
    count.fill(0);
    around(g, k, MAJORITY, tally);
    let best = raw[k] ?? 0;
    for (let c = 1; c < count.length; c++) if ((count[c] ?? 0) > (count[best] ?? 0)) best = c;
    out[k] = best;
  }
  return out;
};

const nearestClass = (
  g: Grid,
  k: number,
  samples: ReadonlyArray<{ readonly c: number; readonly rgb: readonly [number, number, number] }>,
): number => {
  const i = sheetIndex(g, k) * 4;
  const [r, gr, b] = [g.r.rgba[i] ?? 0, g.r.rgba[i + 1] ?? 0, g.r.rgba[i + 2] ?? 0];
  let best = 0;
  let bestD = Infinity;
  for (const s of samples) {
    const d = (r - s.rgb[0]) ** 2 + (gr - s.rgb[1]) ** 2 + (b - s.rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.c;
    }
  }
  return best;
};

const regionsOf = (g: Grid, kinds: Int8Array, classIds: ReadonlyArray<string>): Labelled => {
  const label = new Int32Array(g.w * g.h);
  const regions: TraceRegion[] = [];
  let next = 1;
  const near = new Int32Array(4);
  for (let k = 0; k < label.length; k++) {
    if (label[k] !== 0 || kinds[k] === 0) continue;
    const id = next++;
    const kind = kinds[k];
    const stack = [k];
    const members: number[] = [];
    label[k] = id;
    while (stack.length > 0) {
      const p = stack.pop() ?? 0;
      members.push(p);
      const count = neighbours4(g, p, near);
      for (let i = 0; i < count; i++) {
        const n = near[i] ?? 0;
        if (label[n] === 0 && kinds[n] === kind) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    const xs = members.map((p) => p % g.w);
    const ys = members.map((p) => Math.floor(p / g.w));
    const median = (pick: number) => {
      const vs = members
        .map((p) => g.r.rgba[sheetIndex(g, p) * 4 + pick] ?? 0)
        .sort((a, b) => a - b);
      return vs[Math.floor(vs.length / 2)] ?? 0;
    };
    regions.push({
      id,
      class: classIds[(kind ?? 0) - 1] ?? '',
      at: [
        g.x0 + Math.round(xs.reduce((a, b) => a + b, 0) / xs.length),
        g.y0 + Math.round(ys.reduce((a, b) => a + b, 0) / ys.length),
      ],
      box: [
        g.x0 + Math.min(...xs),
        g.y0 + Math.min(...ys),
        g.x0 + Math.max(...xs) + 1,
        g.y0 + Math.max(...ys) + 1,
      ],
      size: members.length,
      colour: hexOf([median(0), median(1), median(2)]),
    });
  }
  return { label, regions };
};

const TOUCH = LINE_MAX + EDGE_AA;

const touchingOf = (g: Grid, label: Int32Array, regions: ReadonlyArray<TraceRegion>) =>
  touchingIn({ label, w: g.w, h: g.h, origin: [g.x0, g.y0] }, regions, TOUCH);

const pixelAt = (g: Grid, [x, y]: TracePt): number | undefined => {
  const [px, py] = [Math.round(x) - g.x0, Math.round(y) - g.y0];
  return px < 0 || py < 0 || px >= g.w || py >= g.h ? undefined : py * g.w + px;
};

const regionAt = (g: Grid, label: Int32Array, p: TracePt): number | undefined => {
  for (let reach = 0; reach <= SEED_REACH; reach++)
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== reach) continue;
        const k = pixelAt(g, [p[0] + dx, p[1] + dy]);
        const id = k === undefined ? 0 : (label[k] ?? 0);
        if (id !== 0) return id;
      }
  return undefined;
};

const piecesOf = (g: Grid, mask: Uint8Array): number[][] => {
  const seen = new Uint8Array(mask.length);
  const pieces: number[][] = [];
  for (let k = 0; k < mask.length; k++) {
    if (mask[k] === 0 || seen[k] === 1) continue;
    const stack = [k];
    const piece: number[] = [];
    seen[k] = 1;
    const join = (n: number) => {
      if (mask[n] === 1 && seen[n] === 0) {
        seen[n] = 1;
        stack.push(n);
      }
    };
    while (stack.length > 0) {
      const p = stack.pop() ?? 0;
      piece.push(p);
      around(g, p, 1, join);
    }
    pieces.push(piece);
  }
  return pieces.sort((a, b) => b.length - a.length);
};

const maskOf = (g: Grid, pixels: ReadonlyArray<number>): Uint8Array => {
  const m = new Uint8Array(g.w * g.h);
  for (const k of pixels) m[k] = 1;
  return m;
};

const DIRS: ReadonlyArray<TracePt> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const edgeOf = (g: Grid, mask: Uint8Array): TracePt[] => {
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < g.w && y < g.h && mask[y * g.w + x] === 1;
  let start = -1;
  for (let k = 0; k < mask.length && start < 0; k++) if (mask[k] === 1) start = k;
  if (start < 0) return [];
  const [sx, sy] = [start % g.w, Math.floor(start / g.w)];
  const out: TracePt[] = [[sx, sy]];
  let [x, y, back] = [sx, sy, 4];
  for (let guard = 0; guard < mask.length * 4; guard++) {
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8;
      const [dx, dy] = DIRS[d] ?? [0, 0];
      if (on(x + dx, y + dy)) {
        [x, y] = [x + dx, y + dy];
        back = (d + 4) % 8;
        moved = true;
        break;
      }
    }
    if (!moved || (x === sx && y === sy)) break;
    out.push([x, y]);
  }
  return out;
};

const smoothed = (pts: ReadonlyArray<TracePt>, by: number): TracePt[] =>
  pts.map((_, i) => {
    let [sx, sy] = [0, 0];
    for (let d = -by; d <= by; d++) {
      const [x, y] = pts[(i + d + pts.length) % pts.length] ?? [0, 0];
      sx += x;
      sy += y;
    }
    return [sx / (2 * by + 1), sy / (2 * by + 1)];
  });

const resampled = (pts: ReadonlyArray<TracePt>, step: number): TracePt[] => {
  if (pts.length < 3) return [...pts];
  const out: TracePt[] = [pts[0] ?? [0, 0]];
  let carried = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i] ?? [0, 0];
    const [bx, by] = pts[(i + 1) % pts.length] ?? [0, 0];
    const len = Math.hypot(bx - ax, by - ay);
    let at = step - carried;
    while (at <= len) {
      out.push([ax + ((bx - ax) * at) / len, ay + ((by - ay) * at) / len]);
      at += step;
    }
    carried = len - (at - step);
  }
  const [fx, fy] = out[0] ?? [0, 0];
  const [lx, ly] = out[out.length - 1] ?? [0, 0];
  if (out.length > 3 && Math.hypot(lx - fx, ly - fy) < step / 2) out.pop();
  return out;
};

const half = (v: number) => Math.round(v * 2) / 2;

const areaOf = (pts: ReadonlyArray<TracePt>) => {
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i] ?? [0, 0];
    const [bx, by] = pts[(i + 1) % pts.length] ?? [0, 0];
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
};

type TracePath = 'points' | 'cubic';

const outward = (pts: ReadonlyArray<TracePt>): TracePt[] =>
  pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length] ?? p;
    const b = pts[(i + 1) % pts.length] ?? p;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(dx, dy);
    return l === 0 ? p : [p[0] + (0.5 * dy) / l, p[1] - (0.5 * dx) / l];
  });

const outlineOf = (
  g: Grid,
  pixels: ReadonlyArray<number>,
  path: TracePath,
  smooth?: number,
  edgeAt: 'middle' | 'outer' = 'middle',
): TracePt[] => {
  const edge = edgeOf(g, filled(g, maskOf(g, pixels)));
  const run = (by: number) =>
    edgeAt === 'outer' ? outward(smoothed(edge, by)) : smoothed(edge, by);
  const line =
    path === 'cubic'
      ? fitClosed(run(smooth ?? CUBIC_SMOOTH), SHEET_FIT)
      : resampled(run(smooth ?? SMOOTH), STEP);
  return line.map(([x, y]): TracePt => [half(g.x0 + x + 0.5), half(g.y0 + y + 0.5)]);
};

const pointTurns = (pts: ReadonlyArray<TracePt>) =>
  pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length] ?? p;
    const b = pts[(i + 1) % pts.length] ?? p;
    const [ux, uy, vx, vy] = [p[0] - a[0], p[1] - a[1], b[0] - p[0], b[1] - p[1]];
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return l === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / l)));
  });

const SHARP_REACH = 8;

const hairpinsOf = (
  pts: ReadonlyArray<TracePt>,
  path: TracePath,
  sharp: ReadonlyArray<TracePt> = [],
) => {
  const at = path === 'cubic' ? anchorsOf(pts) : pts;
  const turns = path === 'cubic' ? anchorTurns(pts) : pointTurns(pts);
  const vouched = (p: TracePt) =>
    sharp.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) <= SHARP_REACH);
  return turns.flatMap((t, i) => {
    const p = at[i] ?? [0, 0];
    return t > TURN_MAX && !vouched(p)
      ? [`${p.join(',')} (${Math.round((t * 180) / Math.PI)}°)`]
      : [];
  });
};

const CURL = { min: 5, max: 14 } as const;

const CURL_SPREAD = 0.8;

const inside = (g: Grid, mask: Uint8Array): Float32Array => {
  const d = new Float32Array(mask.length).map((_, k) => (mask[k] === 1 ? Infinity : 0));
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : (d[y * g.w + x] ?? 0);
  const pass = (ys: number[], xs: number[], dir: 1 | -1) => {
    for (const y of ys)
      for (const x of xs) {
        const k = y * g.w + x;
        if (mask[k] === 0) continue;
        d[k] = Math.min(
          d[k] ?? 0,
          at(x - dir, y) + 1,
          at(x, y - dir) + 1,
          at(x - dir, y - dir) + Math.SQRT2,
          at(x + dir, y - dir) + Math.SQRT2,
        );
      }
  };
  const ys = Array.from({ length: g.h }, (_, i) => i);
  const xs = Array.from({ length: g.w }, (_, i) => i);
  pass(ys, xs, 1);
  pass(ys.reverse(), xs.reverse(), -1);
  return d;
};

const curlsOf = (
  g: Grid,
  mask: Uint8Array,
  size: { readonly min: number; readonly max: number },
): Array<{ at: TracePt; r: number }> => {
  const d = inside(g, mask);
  const order = [...d.keys()]
    .filter((k) => (d[k] ?? 0) >= size.min)
    .sort((a, b) => (d[b] ?? 0) - (d[a] ?? 0));
  const taken: Array<{ x: number; y: number; r: number }> = [];
  for (const k of order) {
    const [x, y] = [k % g.w, Math.floor(k / g.w)];
    const r = Math.min(size.max, d[k] ?? 0);
    if (taken.every((c) => Math.hypot(c.x - x, c.y - y) >= CURL_SPREAD * (c.r + r)))
      taken.push({ x, y, r });
  }
  return taken.map((c) => ({ at: rounded([g.x0 + c.x + 0.5, g.y0 + c.y + 0.5]), r: half(c.r) }));
};

const eroded = (g: Grid, mask: Uint8Array, by: number): Uint8Array =>
  grown(
    g,
    mask.map((v) => 1 - v),
    by,
    () => true,
  ).map((v) => 1 - v);

const cleaned = (g: Grid, mask: Uint8Array, open: number, close: number): Uint8Array => {
  const all = () => true;
  const opened = grown(g, eroded(g, mask, open), open, all);
  return eroded(g, grown(g, opened, close, all), close);
};

const cleanedOf = (g: Grid, mask: Uint8Array, part: TracePart) =>
  cleaned(g, mask, part.open ?? OPEN, part.close ?? part.open ?? OPEN);

const markOf = (g: Grid, pixels: ReadonlyArray<number>) => {
  const pts = pixels.map((k): TracePt => [
    g.x0 + (k % g.w) + 0.5,
    g.y0 + Math.floor(k / g.w) + 0.5,
  ]);
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const centre: TracePt = [
    xs.reduce((a, b) => a + b, 0) / xs.length,
    ys.reduce((a, b) => a + b, 0) / ys.length,
  ];
  const far = (from: TracePt) =>
    pts.reduce((best, p) =>
      Math.hypot(p[0] - from[0], p[1] - from[1]) > Math.hypot(best[0] - from[0], best[1] - from[1])
        ? p
        : best,
    );
  const a = far(centre);
  const b = far(a);
  const length = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));
  const stroke = pixels.length / length;
  const inset = Math.min(stroke / 2, length / 2 - 0.5) / length;
  const toward = (p: TracePt, q: TracePt): TracePt => [
    p[0] + (q[0] - p[0]) * inset,
    p[1] + (q[1] - p[1]) * inset,
  ];
  const [ia, ib] = [toward(a, b), toward(b, a)];
  const [left, right] = ia[0] <= ib[0] ? [ia, ib] : [ib, ia];
  return {
    centre,
    size: [Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1] as const,
    ends: [left, right] as const,
    stroke,
  };
};

const nearestPiece = (
  g: Grid,
  pieces: ReadonlyArray<ReadonlyArray<number>>,
  p: TracePt,
  taken: ReadonlySet<ReadonlyArray<number>> = new Set(),
) => {
  const [px, py] = [p[0] - g.x0, p[1] - g.y0];
  let best: ReadonlyArray<number> = [];
  let bestD = Infinity;
  for (const piece of pieces)
    for (const k of taken.has(piece) ? [] : piece) {
      const d = Math.hypot((k % g.w) - px, Math.floor(k / g.w) - py);
      if (d < bestD) {
        bestD = d;
        best = piece;
      }
    }
  return best;
};

const rounded = (p: TracePt): TracePt => [half(p[0]), half(p[1])];

class TraceRefused extends Schema.TaggedError<TraceRefused>()('TraceRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the trace cannot be read: ${this.reason}`;
  }
}

interface Read {
  readonly g: Grid;
  readonly n: number;
  readonly ink: Uint8Array;
  readonly lined: Uint8Array;
  readonly kinds: Int8Array;
  readonly label: Int32Array;
  readonly core: (k: number) => boolean;
  readonly figure: (k: number) => boolean;
  readonly classIds: ReadonlyArray<string>;
  readonly labelled: Readonly<Record<string, TraceRegion>>;
  readonly refused: string[];
}

const addTo = (mask: Uint8Array, m: Uint8Array) => {
  for (let k = 0; k < mask.length; k++) if (m[k] === 1) mask[k] = 1;
};

const dropFrom = (mask: Uint8Array, drop: (k: number) => boolean) => {
  for (let k = 0; k < mask.length; k++) if (mask[k] === 1 && drop(k)) mask[k] = 0;
};

const addClasses = (rd: Read, name: string, classes: ReadonlyArray<string>, mask: Uint8Array) => {
  for (const c of classes) {
    const id = rd.classIds.indexOf(c) + 1;
    if (id === 0) rd.refused.push(`the part ${name} names no class ${c}`);
    else for (let k = 0; k < rd.n; k++) if (rd.kinds[k] === id) mask[k] = 1;
  }
};

const addSeeds = (rd: Read, name: string, seeds: ReadonlyArray<TracePt>, mask: Uint8Array) => {
  for (const seed of seeds) {
    const id = regionAt(rd.g, rd.label, seed);
    if (id === undefined)
      rd.refused.push(`the part ${name}'s seed ${seed.join(',')} lies in no region`);
    else for (let k = 0; k < rd.n; k++) if (rd.label[k] === id) mask[k] = 1;
  }
};

const addLabel = (rd: Read, name: string, label: string, mask: Uint8Array) => {
  const region = rd.labelled[label];
  if (region === undefined) rd.refused.push(`the part ${name} names no label ${label}`);
  else for (let k = 0; k < rd.n; k++) if (rd.label[k] === region.id) mask[k] = 1;
};

const holdToColour = (rd: Read, mask: Uint8Array, colour: NonNullable<TracePart['colour']>) => {
  const { g } = rd;
  const near = channels(colour.near);
  const far = colour.far.map(channels);
  const dist = (k: number, c: readonly [number, number, number]) => {
    const i = sheetIndex(g, k) * 4;
    return Math.hypot(
      (g.r.rgba[i] ?? 0) - c[0],
      (g.r.rgba[i + 1] ?? 0) - c[1],
      (g.r.rgba[i + 2] ?? 0) - c[2],
    );
  };
  dropFrom(mask, (k) => far.some((c) => dist(k, c) < dist(k, near)));
};

const reachOf = (rd: Read, part: TracePart) => (part.reach === 'figure' ? rd.figure : rd.core);

const pickedOf = (rd: Read, name: string, part: TracePart, of: (name: string) => Uint8Array) => {
  const mask = part.within === undefined ? new Uint8Array(rd.n) : of(part.within).slice();
  const reached = reachOf(rd, part);
  if (part.silhouette === true) for (let k = 0; k < rd.n; k++) if (reached(k)) mask[k] = 1;
  addClasses(rd, name, part.classes ?? [], mask);
  addSeeds(rd, name, part.seeds ?? [], mask);
  if (part.label !== undefined) addLabel(rd, name, part.label, mask);
  if (part.colour !== undefined) holdToColour(rd, mask, part.colour);
  for (const other of part.plus ?? []) addTo(mask, of(other));
  return mask;
};

const formedOf = (
  rd: Read,
  part: TracePart,
  picked: Uint8Array,
  of: (name: string) => Uint8Array,
) => {
  const { g } = rd;
  const reached = reachOf(rd, part);
  const seeded =
    (part.seeds ?? []).length > 0 || (part.classes ?? []).length > 0 || part.label !== undefined;
  const by = part.grow ?? (seeded ? GROW : 0);
  const mask =
    by > 0
      ? grown(
          g,
          picked,
          by,
          part.into === 'ink'
            ? (k) => rd.core(k) && rd.lined[k] === 1
            : (k) => rd.core(k) && (rd.ink[k] === 1 || lumaAt(g.r, sheetIndex(g, k)) < GROUND_LUMA),
        )
      : picked;
  const clip = part.clip;
  if (clip !== undefined)
    dropFrom(
      mask,
      (k) => !insidePolygon([g.x0 + (k % g.w) + 0.5, g.y0 + Math.floor(k / g.w) + 0.5], clip),
    );
  for (const other of part.minus ?? []) {
    const m = of(other);
    dropFrom(mask, (k) => m[k] === 1);
  }
  if (part.inside !== undefined) {
    const m = of(part.inside);
    dropFrom(mask, (k) => m[k] === 0);
  }
  dropFrom(mask, (k) => !reached(k));
  return part.shrink === undefined ? mask : eroded(g, mask, part.shrink);
};

const partsOf = (rd: Read, parts: TraceView['parts']) => {
  const made = new Map<string, Uint8Array>();
  const making = new Set<string>();
  const of = (name: string): Uint8Array => {
    const have = made.get(name);
    if (have !== undefined) return have;
    const part = parts[name];
    if (part === undefined || making.has(name)) {
      rd.refused.push(
        part === undefined
          ? `the trace names no part ${name}`
          : `the part ${name} is made of itself`,
      );
      return new Uint8Array(rd.n);
    }
    making.add(name);
    const mask = formedOf(rd, part, pickedOf(rd, name, part, of), of);
    making.delete(name);
    made.set(name, mask);
    return mask;
  };
  return of;
};

const circleOf = (g: Grid, piece: ReadonlyArray<number>) => {
  const largest = filled(g, maskOf(g, piece));
  const ks = [...largest.keys()].filter((k) => largest[k] === 1);
  const cx = ks.reduce((a, k) => a + (k % g.w), 0) / Math.max(1, ks.length);
  const cy = ks.reduce((a, k) => a + Math.floor(k / g.w), 0) / Math.max(1, ks.length);
  return {
    at: rounded([g.x0 + cx + 0.5, g.y0 + cy + 0.5]),
    r: half(Math.sqrt(ks.length / Math.PI)),
  };
};

const isReadMouth = (
  m: TraceMarkSeeds['mouth'],
): m is { readonly ends: readonly [TracePt, TracePt]; readonly line: number } => 'ends' in m;

const marksOf = (
  rd: Read,
  figure: (k: number) => boolean,
  seeds: TraceMarkSeeds,
): TracedMarks | undefined => {
  const { g } = rd;
  const inkPieces = piecesOf(
    g,
    rd.ink.map((v, k) => (v === 1 && figure(k) ? 1 : 0)),
  );
  const near = inkPieces.filter((p) => p.length < (g.w * g.h) / 50);
  const taken = new Set<ReadonlyArray<number>>();
  const mark = (what: string) => (p: TracePt) => {
    const piece = nearestPiece(g, near, p, taken);
    if (piece.length === 0) {
      rd.refused.push(`the ${what} at ${p.join(',')} finds no ink of its own`);
      return undefined;
    }
    taken.add(piece);
    return markOf(g, piece);
  };
  const eyes = seeds.eyes.map(mark('eye'));
  const brows = seeds.brows.map(mark('brow'));
  const mouth = isReadMouth(seeds.mouth)
    ? { ends: seeds.mouth.ends, stroke: seeds.mouth.line }
    : mark('mouth')(seeds.mouth);
  const [e0, e1] = [eyes[0], eyes[1] ?? eyes[0]];
  const [b0, b1] = [brows[0], brows[1] ?? brows[0]];
  if (
    e0 === undefined ||
    e1 === undefined ||
    b0 === undefined ||
    b1 === undefined ||
    mouth === undefined
  )
    return undefined;
  return {
    eyes: [rounded(e0.centre), rounded(e1.centre)],
    eye: [half((e0.size[0] + e1.size[0]) / 2), half((e0.size[1] + e1.size[1]) / 2)],
    brows: [
      [rounded(b0.ends[0]), rounded(b0.ends[1])],
      [rounded(b1.ends[0]), rounded(b1.ends[1])],
    ],
    brow: half((b0.stroke + b1.stroke) / 2),
    mouth: [rounded(mouth.ends[0]), rounded(mouth.ends[1])],
    mouthLine: half(mouth.stroke),
  };
};

const boxOfMask = (g: Grid, mask: Uint8Array): TraceBox => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < mask.length; k++)
    if (mask[k] === 1) {
      const [x, y] = [k % g.w, Math.floor(k / g.w)];
      [x0, y0, x1, y1] = [
        Math.min(x0, x),
        Math.min(y0, y),
        Math.max(x1, x + 1),
        Math.max(y1, y + 1),
      ];
    }
  return [g.x0 + x0, g.y0 + y0, g.x0 + x1, g.y0 + y1];
};

const readOf = (sheet: Raster, view: TraceView) => {
  const [bx0, by0, bx1, by1] = view.box;
  const g: Grid = { r: sheet, x0: bx0, y0: by0, w: bx1 - bx0, h: by1 - by0 };
  const n = g.w * g.h;
  const ink = new Uint8Array(n);
  for (let k = 0; k < n; k++) ink[k] = lumaAt(sheet, sheetIndex(g, k)) < INK_LUMA ? 1 : 0;
  const ground = flood(g, edgePixels(g), (k) => lumaAt(sheet, sheetIndex(g, k)) >= GROUND_LUMA);
  const figure = (k: number) => ground[k] === 0;
  const kinds = classesOf(g, view.classes, (k) => figure(k) && ink[k] === 0);
  const classIds = Object.keys(view.classes);
  const { label, regions } = regionsOf(g, kinds, classIds);
  const labels = labelRegions(regions, view.labels ?? {}, touchingOf(g, label, regions));
  const bridged = grown(
    g,
    ground,
    EDGE_AA,
    (k) => ink[k] === 0 && lumaAt(sheet, sheetIndex(g, k)) < GROUND_LUMA,
  );
  const inked = (k: number) => ink[k] === 1;
  const through =
    view.line === 'brown'
      ? grown(
          g,
          grown(
            g,
            bridged,
            LINE_MIN,
            (k) => inked(k) || lumaAt(sheet, sheetIndex(g, k)) < LINE_LUMA,
          ),
          LINE_MAX - LINE_MIN,
          inked,
        )
      : grown(g, bridged, LINE_MAX, inked);
  const line = grown(g, through, 1, () => true);
  const rd: Read = {
    g,
    n,
    ink,
    lined: grown(g, ink, EDGE_AA, (k) => lumaAt(sheet, sheetIndex(g, k)) < GROUND_LUMA),
    kinds,
    label,
    core: (k) => line[k] === 0,
    figure,
    classIds,
    labelled: labels.picked,
    refused: [...labels.refused],
  };
  return { rd, figure, regions: regions.filter((r) => r.size >= REGION_MIN) };
};

const curledOf = (rd: Read, name: string, part: TracePart, mask: Uint8Array) => {
  const curls = curlsOf(rd.g, cleanedOf(rd.g, mask, part), part.curl ?? CURL);
  if (curls.length === 0) rd.refused.push(`the part ${name} has no curl as wide as its least`);
  return curls;
};

const writtenOf = (rd: Read, view: TraceView, of: (name: string) => Uint8Array) => {
  const { g } = rd;
  const outlines: Record<string, ReadonlyArray<TracePt>> = {};
  const tones: Record<string, ReadonlyArray<ReadonlyArray<TracePt>>> = {};
  const circles: Record<string, { at: TracePt; r: number }> = {};
  const curls: Record<string, ReadonlyArray<{ at: TracePt; r: number }>> = {};
  for (const [name, part] of Object.entries(view.parts)) {
    const as = part.as ?? 'outline';
    if (as === 'none' || as === 'marks') continue;
    if (as === 'curls') {
      curls[name] = curledOf(rd, name, part, of(name));
      continue;
    }
    const path = part.path ?? view.path ?? 'points';
    const pieces = piecesOf(g, cleanedOf(g, of(name), part));
    const largest = pieces[0] ?? [];
    if (as !== 'tones' && largest.length === 0) rd.refused.push(`the part ${name} is empty`);
    else if (as === 'outline') {
      const outline = outlineOf(g, largest, path, part.smooth, part.edge);
      const hairpins = hairpinsOf(outline, path, part.sharp);
      if (hairpins.length > 0)
        rd.refused.push(`the part ${name} doubles back on itself at ${hairpins.join(', ')}`);
      outlines[name] = outline;
    } else if (as === 'circle') circles[name] = circleOf(g, largest);
    else
      tones[name] = pieces
        .filter((p) => p.length >= (part.min ?? TONE_MIN))
        .map((p) => outlineOf(g, p, path, part.smooth, part.edge))
        .filter((pts) => pts.length >= 3 && areaOf(pts) > 0);
  }
  return { outlines, tones, circles, curls };
};

export const traceView = (sheet: Raster, view: TraceView): Result.Result<Traced, TraceRefused> => {
  const { rd, figure, regions } = readOf(sheet, view);
  const { g } = rd;
  const of = partsOf(rd, view.parts);
  let traced: Traced = { ...writtenOf(rd, view, of), regions, labelled: rd.labelled };
  const marks = view.marks === undefined ? undefined : marksOf(rd, figure, view.marks);
  if (marks !== undefined) traced = { ...traced, marks };
  if (view.head !== undefined) {
    const [x0, y0, x1, y1] = boxOfMask(g, of(view.head));
    traced = {
      ...traced,
      head: { at: rounded([(x0 + x1) / 2, (y0 + y1) / 2]), top: y0, height: y1 - y0 },
    };
  }
  if (view.feet !== undefined && view.feet.length > 0) {
    const all = new Uint8Array(rd.n);
    for (const part of view.feet) addTo(all, of(part));
    const [x0, , x1, y1] = boxOfMask(g, all);
    traced = { ...traced, feet: rounded([(x0 + x1) / 2, y1]) };
  }
  if (rd.refused.length > 0)
    return Result.fail(TraceRefused.make({ reason: rd.refused.join('; ') }));
  return Result.succeed(traced);
};

export const labelMasks = (view: Raster, classes: TraceView['classes'], labels: LabelTable) => {
  const { rd } = readOf(view, { box: [0, 0, view.width, view.height], classes, parts: {}, labels });
  const masks: Readonly<Record<string, Uint8Array>> = Object.fromEntries(
    Object.entries(rd.labelled).map(([name, r]) => [
      name,
      Uint8Array.from(rd.label, (l) => Number(l === r.id)),
    ]),
  );
  return { masks, refused: rd.refused };
};

const constName = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const pts = (p: ReadonlyArray<TracePt>, indent: string) =>
  `[\n${p.map(([x, y]) => `${indent}  [${x}, ${y}],`).join('\n')}\n${indent}]`;

export const tracedModule = (view: TraceView, t: Traced): string => {
  const lines = [
    "import type { Pt } from '@manna/film/style';",
    '',
    `export const BOX = [${view.box.join(', ')}] as const;`,
  ];
  if (t.head !== undefined)
    lines.push(
      '',
      `export const HEAD_AT = { at: [${t.head.at.join(', ')}], top: ${t.head.top}, height: ${t.head.height} } as const satisfies { readonly at: Pt; readonly top: number; readonly height: number };`,
    );
  if (t.feet !== undefined) lines.push('', `export const FEET: Pt = [${t.feet.join(', ')}];`);
  for (const [name, outline] of Object.entries(t.outlines))
    lines.push('', `export const ${constName(name)}: Pt[] = ${pts(outline, '')};`);
  for (const [name, list] of Object.entries(t.tones))
    lines.push(
      '',
      `export const ${constName(name)}: Pt[][] = [\n${list.map((p) => `  ${pts(p, '  ')},`).join('\n')}\n];`,
    );
  for (const [name, list] of Object.entries(t.curls))
    lines.push(
      '',
      `export const ${constName(name)}: ReadonlyArray<{ readonly at: Pt; readonly r: number }> = [\n${list.map((c) => `  { at: [${c.at.join(', ')}], r: ${c.r} },`).join('\n')}\n];`,
    );
  for (const [name, c] of Object.entries(t.circles))
    lines.push(
      '',
      `export const ${constName(name)} = { at: [${c.at.join(', ')}], r: ${c.r} } as const satisfies { readonly at: Pt; readonly r: number };`,
    );
  if (t.marks !== undefined) {
    const m = t.marks;
    const pair = (p: readonly [TracePt, TracePt]) => `[[${p[0].join(', ')}], [${p[1].join(', ')}]]`;
    lines.push(
      '',
      'export const MARKS = {',
      `  eyes: ${pair(m.eyes)},`,
      `  eye: [${m.eye.join(', ')}],`,
      `  brows: [${pair(m.brows[0])}, ${pair(m.brows[1])}],`,
      `  brow: ${m.brow},`,
      `  mouth: ${pair(m.mouth)},`,
      `  mouthLine: ${m.mouthLine},`,
      '} as const;',
    );
  }
  return `${lines.join('\n')}\n`;
};
