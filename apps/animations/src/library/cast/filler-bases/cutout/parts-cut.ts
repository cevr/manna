import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, decodePng, encodePng } from '@manna/film/tools';
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Option,
  Record as Records,
  Stdio,
} from 'effect';
import dressed1 from '../../filler-dressed/cast-sheet/views/poses-1.png' with { type: 'file' };
import dressed2 from '../../filler-dressed/cast-sheet/views/poses-2.png' with { type: 'file' };
import dressed3 from '../../filler-dressed/cast-sheet/views/poses-3.png' with { type: 'file' };
import dressed4 from '../../filler-dressed/cast-sheet/views/poses-4.png' with { type: 'file' };
import BASE from '../cast-sheet/kept/poses.png' with { type: 'file' };
import { FRAMES, type FramedView, boxOf } from './frames.ts';

const sheetsFolder = Stdio.Stdio.use(({ args }) =>
  Effect.map(args, (a) => Option.getOrElse(Arr.head(a), () => `${import.meta.dir}/sheets`)),
);

const DRESSED: Readonly<Record<FramedView, string>> = {
  'poses-1': dressed1,
  'poses-2': dressed2,
  'poses-3': dressed3,
  'poses-4': dressed4,
};

type Rgb = readonly [number, number, number];
type Pt = readonly [number, number];

export type HouseName = 'beard' | 'band' | 'headwear' | 'mantle';

type Seat = 'crown' | 'chin' | 'anywhere';

interface HousePart {
  readonly name: HouseName;
  readonly seat: Seat;
}

export const HOUSE: Readonly<Record<FramedView, ReadonlyArray<HousePart>>> = {
  'poses-1': [
    { name: 'beard', seat: 'chin' },
    { name: 'band', seat: 'crown' },
    { name: 'headwear', seat: 'crown' },
    { name: 'mantle', seat: 'anywhere' },
  ],
  'poses-2': [{ name: 'mantle', seat: 'anywhere' }],
  'poses-3': [
    { name: 'beard', seat: 'chin' },
    { name: 'headwear', seat: 'crown' },
    { name: 'mantle', seat: 'anywhere' },
  ],
  'poses-4': [{ name: 'mantle', seat: 'anywhere' }],
};

type Paint = HouseName | 'other';

const LINES: ReadonlyArray<readonly [Paint, Rgb]> = [
  ['other', [42, 20, 5]],
  ['other', [33, 15, 3]],
  ['other', [52, 26, 7]],
  ['other', [87, 63, 35]],
  ['other', [99, 61, 35]],
  ['other', [132, 79, 43]],
];

const SKIN: ReadonlyArray<readonly [Paint, Rgb]> = [
  ['other', [253, 189, 123]],
  ['other', [250, 196, 135]],
  ['other', [245, 168, 109]],
  ['other', [250, 212, 153]],
];

const PALETTES: Readonly<Record<FramedView, ReadonlyArray<readonly [Paint, Rgb]>>> = {
  'poses-1': [
    ...LINES,
    ...SKIN,
    ['beard', [118, 77, 48]],
    ['beard', [94, 62, 40]],
    ['band', [77, 79, 99]],
    ['band', [87, 93, 114]],
    ['headwear', [231, 205, 167]],
    ['headwear', [222, 194, 161]],
    ['headwear', [242, 217, 177]],
    ['mantle', [188, 134, 89]],
    ['mantle', [177, 123, 81]],
    ['mantle', [161, 107, 71]],
    ['other', [252, 238, 208]],
    ['other', [242, 222, 196]],
    ['other', [231, 209, 190]],
    ['other', [252, 244, 223]],
    ['headwear', [157, 127, 102]],
    ['headwear', [199, 169, 140]],
  ],
  'poses-2': [
    ...LINES,
    ...SKIN,
    ['mantle', [143, 136, 89]],
    ['mantle', [137, 129, 86]],
    ['mantle', [129, 121, 82]],
    ['mantle', [157, 149, 97]],
    ['mantle', [152, 142, 99]],
    ['mantle', [122, 113, 77]],
    ['other', [101, 90, 61]],
    ['other', [252, 237, 208]],
    ['other', [232, 210, 191]],
    ['other', [188, 171, 140]],
    ['other', [166, 134, 108]],
  ],
  'poses-3': [
    ...LINES,
    ...SKIN,
    ['beard', [218, 212, 218]],
    ['other', [115, 106, 112]],
    ['headwear', [234, 207, 167]],
    ['headwear', [241, 216, 175]],
    ['headwear', [225, 197, 163]],
    ['headwear', [239, 215, 183]],
    ['headwear', [216, 187, 159]],
    ['headwear', [193, 164, 137]],
    ['mantle', [91, 97, 116]],
    ['mantle', [85, 88, 108]],
    ['mantle', [79, 80, 103]],
    ['other', [70, 66, 83]],
    ['other', [147, 110, 81]],
    ['other', [94, 68, 53]],
  ],
  'poses-4': [
    ...LINES,
    ...SKIN,
    ['mantle', [171, 135, 97]],
    ['mantle', [181, 141, 100]],
    ['mantle', [152, 118, 87]],
    ['mantle', [161, 125, 91]],
    ['mantle', [141, 109, 82]],
    ['other', [114, 84, 62]],
    ['other', [229, 210, 180]],
    ['other', [213, 191, 171]],
    ['other', [235, 221, 197]],
    ['other', [180, 156, 132]],
  ],
};

export const DYED: ReadonlyArray<HouseName> = ['mantle', 'band'];

const GROUND = 90;

const LINE = 110;

const EYE_PX = [120, 400] as const;
const TALL = 1.5;

const MIN_REGION = 40;

const MANTLE_PX = 400;

const STROKE = 12;

const AA = 2;

const AA_LUM = 170;

const NEAR = 20;

const REACH = 14;

const PAPERISH = 10;

const HOLE = 60;

const lumOf = (r: Raster, i: number) =>
  0.299 * (r.rgba[i * 4] ?? 0) +
  0.587 * (r.rgba[i * 4 + 1] ?? 0) +
  0.114 * (r.rgba[i * 4 + 2] ?? 0);

const rgbAt = (r: Raster, i: number): Rgb => [
  r.rgba[i * 4] ?? 0,
  r.rgba[i * 4 + 1] ?? 0,
  r.rgba[i * 4 + 2] ?? 0,
];

const toLinear = (c: number) => {
  const v = c / 255;
  if (v <= 0.04045) return v / 12.92;
  return ((v + 0.055) / 1.055) ** 2.4;
};
const labF = (t: number) => {
  if (t > 216 / 24389) return Math.cbrt(t);
  return ((24389 / 27) * t + 16) / 116;
};

export const labOf = (c: Rgb): Rgb => {
  const [r, g, b] = [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])];
  const fx = labF((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = labF(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = labF((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const deltaE = (p: Rgb, q: Rgb) => {
  const [a, b] = [labOf(p), labOf(q)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

const medianRgb = (colours: ReadonlyArray<Rgb>): Rgb => {
  const channel = (c: 0 | 1 | 2) =>
    colours.map((v) => v[c]).sort((a, b) => a - b)[colours.length >> 1] ?? 0;
  return [channel(0), channel(1), channel(2)];
};

const hexOf = (rgb: Rgb): `#${string}` =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const componentsOf = (
  w: number,
  h: number,
  inside: (i: number) => boolean,
  joins: (i: number, j: number) => boolean = () => true,
) => {
  const seen = new Uint8Array(w * h);
  const out: Array<Array<number>> = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] === 1 || !inside(s)) continue;
    const px: Array<number> = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      px.push(i);
      const [x, y] = [i % w, Math.floor(i / w)];
      const near: ReadonlyArray<readonly [number, number]> = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of near) {
        const j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[j] === 1 || !inside(j) || !joins(i, j))
          continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    out.push(px);
  }
  return out;
};

const boxOfPx = (w: number, px: ReadonlyArray<number>) => {
  let [x0, y0, x1, y1, sx, sy] = [Infinity, Infinity, -1, -1, 0, 0];
  for (const i of px) {
    const [x, y] = [i % w, Math.floor(i / w)];
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    [sx, sy] = [sx + x, sy + y];
  }
  return { box: [x0, y0, x1, y1] as const, centre: [sx / px.length, sy / px.length] satisfies Pt };
};

export const eyesOf = (view: Raster): Option.Option<readonly [Pt, Pt]> => {
  const { width: w } = view;
  const h = Math.floor(view.height / 2);
  const blobs = componentsOf(w, h, (i) => lumOf(view, i) < 80)
    .filter((px) => px.length >= EYE_PX[0] && px.length <= EYE_PX[1])
    .map((px) => boxOfPx(w, px))
    .filter(({ box: [x0, y0, x1, y1] }) => y1 - y0 + 1 >= TALL * (x1 - x0 + 1));
  const pairs = blobs.flatMap((a, i) =>
    blobs.slice(i + 1).map((b) => ({ a, b, dy: Math.abs(a.centre[1] - b.centre[1]) })),
  );
  return Option.map(
    Arr.head(
      pairs
        .filter(({ a, b }) => Math.abs(a.centre[0] - b.centre[0]) > 30)
        .sort((p, q) => p.dy - q.dy),
    ),
    ({ a, b }) => {
      const sorted = [a.centre, b.centre].sort((p, q) => p[0] - q[0]);
      return [sorted[0] ?? a.centre, sorted[1] ?? b.centre] as const;
    },
  );
};

interface Similarity {
  readonly a: number;
  readonly b: number;
  readonly tx: number;
  readonly ty: number;
}

export const similarityOf = (from: readonly [Pt, Pt], to: readonly [Pt, Pt]): Similarity => {
  const [[fx1, fy1], [fx2, fy2]] = from;
  const [[tx1, ty1], [tx2, ty2]] = to;
  const [dx, dy, ex, ey] = [fx2 - fx1, fy2 - fy1, tx2 - tx1, ty2 - ty1];
  const n = dx * dx + dy * dy;
  const a = (ex * dx + ey * dy) / n;
  const b = (ey * dx - ex * dy) / n;
  return { a, b, tx: tx1 - (a * fx1 - b * fy1), ty: ty1 - (b * fx1 + a * fy1) };
};

const apply = ({ a, b, tx, ty }: Similarity, [x, y]: Pt): Pt => [
  a * x - b * y + tx,
  b * x + a * y + ty,
];

export const outsideOf = (view: Raster): Uint8Array => {
  const { width: w, height: h } = view;
  const out = new Uint8Array(w * h);
  const stack: Array<number> = [];
  const visit = (x: number, y: number) => {
    const i = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || out[i] === 1 || lumOf(view, i) < GROUND) return;
    out[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    visit(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    visit(0, y);
    visit(w - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const [x, y] = [i % w, Math.floor(i / w)];
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }
  return out;
};

interface Region {
  readonly px: ReadonlyArray<number>;
  readonly box: readonly [number, number, number, number];
  readonly centre: Pt;
  readonly median: Rgb;
}

const paintsOf = (
  view: Raster,
  outside: Uint8Array,
  palette: ReadonlyArray<readonly [Paint, Rgb]>,
): Int16Array => {
  const labs = palette.map(([, rgb]) => labOf(rgb));
  return Int16Array.from({ length: view.width * view.height }, (_, i) => {
    if (outside[i] === 1) return -1;
    const [l, a, b] = labOf(rgbAt(view, i));
    const ds = labs.map((p) => Math.hypot(p[0] - l, p[1] - a, p[2] - b));
    const d = Math.min(...ds);
    if (d > NEAR) return -1;
    return ds.indexOf(d);
  });
};

const opened = (mask: Uint8Array, w: number, h: number): Uint8Array => {
  const pass = (from: Uint8Array, keep: (all: boolean, any: boolean) => boolean) =>
    Uint8Array.from({ length: w * h }, (_, i) => {
      const [x, y] = [i % w, Math.floor(i / w)];
      const near = [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) => {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return 0;
          return from[ny * w + nx] ?? 0;
        }),
      );
      return Number(
        keep(
          near.every((v) => v === 1),
          near.some((v) => v === 1),
        ),
      );
    });
  return pass(
    pass(mask, (all) => all),
    (_, any) => any,
  );
};

const regionsOf = (
  view: Raster,
  paints: Int16Array,
  palette: ReadonlyArray<readonly [Paint, Rgb]>,
  name: HouseName,
): ReadonlyArray<Region> => {
  const { width: w, height: h } = view;
  const own = Uint8Array.from(paints, (k) => Number(palette[k]?.[0] === name));
  const open = opened(own, w, h);
  return componentsOf(w, h, (i) => open[i] === 1)
    .filter((px) => px.length >= MIN_REGION)
    .map((px) => ({ px, ...boxOfPx(w, px), median: medianRgb(px.map((i) => rgbAt(view, i))) }));
};

const isStroke = ({ box: [x0, y0, x1, y1] }: Region) => Math.min(x1 - x0, y1 - y0) + 1 < STROKE;

const sits = (seat: Seat, region: Region, [l, r]: readonly [Pt, Pt]) => {
  const eyeY = (l[1] + r[1]) / 2;
  const eyeX = (l[0] + r[0]) / 2;
  if (seat === 'crown') return region.box[1] < eyeY - 15;
  if (seat === 'chin')
    return (
      region.centre[1] > eyeY + 10 &&
      region.centre[1] < eyeY + 140 &&
      Math.abs(region.centre[0] - eyeX) < 70
    );
  return region.px.length >= MANTLE_PX;
};

const maskOf = (
  view: Raster,
  outside: Uint8Array,
  others: Uint8Array,
  own: ReadonlyArray<Region>,
  paper: Rgb,
): Uint8Array => {
  const { width: w, height: h } = view;
  const mask = new Uint8Array(w * h);
  const line = (i: number) => {
    if (others[i] === 1) return false;
    if (outside[i] === 1) return deltaE(rgbAt(view, i), paper) > PAPERISH;
    return lumOf(view, i) < LINE;
  };
  const cost = new Float64Array(w * h).fill(Infinity);
  const buckets: Array<Array<number>> = Array.from({ length: REACH * 2 + 4 }, () => []);
  for (const r of own)
    for (const i of r.px) {
      mask[i] = 1;
      cost[i] = 0;
      buckets[0]?.push(i);
    }
  const steps: ReadonlyArray<readonly [number, number, number]> = [
    [-1, 0, 2],
    [1, 0, 2],
    [0, -1, 2],
    [0, 1, 2],
    [-1, -1, 3],
    [1, -1, 3],
    [-1, 1, 3],
    [1, 1, 3],
  ];
  buckets.forEach((bucket, c) => {
    while (bucket.length > 0) {
      const i = bucket.pop() ?? 0;
      if ((cost[i] ?? Infinity) < c) continue;
      const [x, y] = [i % w, Math.floor(i / w)];
      for (const [dx, dy, step] of steps) {
        const [nx, ny] = [x + dx, y + dy];
        const j = ny * w + nx;
        const next = c + step;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || next > REACH * 2) continue;
        if (next >= (cost[j] ?? Infinity) || !line(j)) continue;
        cost[j] = next;
        mask[j] = 1;
        buckets[next]?.push(j);
      }
    }
  });
  for (const hole of componentsOf(w, h, (i) => mask[i] !== 1))
    if (hole.length < HOLE) for (const i of hole) mask[i] = 1;
  const edge = (i: number) => {
    if (others[i] === 1) return false;
    if (outside[i] === 1) return deltaE(rgbAt(view, i), paper) > PAPERISH;
    return lumOf(view, i) < AA_LUM;
  };
  for (let pass = 0; pass < AA; pass++) {
    const grown = Array.from({ length: w * h }, (_, i) => i).filter((i) => {
      if (mask[i] === 1 || !edge(i)) return false;
      const [x, y] = [i % w, Math.floor(i / w)];
      return (
        (x > 0 && mask[i - 1] === 1) ||
        (x < w - 1 && mask[i + 1] === 1) ||
        (y > 0 && mask[i - w] === 1) ||
        (y < h - 1 && mask[i + w] === 1)
      );
    });
    for (const i of grown) mask[i] = 1;
  }
  return mask;
};

const atPercentiles = (sorted: ReadonlyArray<Rgb>, lo: number, hi: number): Rgb =>
  medianRgb(sorted.slice(Math.floor(sorted.length * lo), Math.ceil(sorted.length * hi)));

export interface DrawnRamp {
  readonly shade: `#${string}`;
  readonly base: `#${string}`;
  readonly light: `#${string}`;
}

const interiorOf = (view: Raster, own: ReadonlyArray<Region>) => {
  const { width: w } = view;
  const mine = new Set(own.flatMap((r) => r.px));
  return [...mine]
    .filter((i) => [-2, 2, -2 * w, 2 * w].every((d) => mine.has(i + d)))
    .map((i) => rgbAt(view, i))
    .map((c) => ({ c, l: labOf(c)[0] }))
    .sort((p, q) => p.l - q.l);
};

const rampOf = (view: Raster, own: ReadonlyArray<Region>): DrawnRamp => {
  const sorted = interiorOf(view, own).map(({ c }) => c);
  return {
    shade: hexOf(atPercentiles(sorted, 0, 0.05)),
    base: hexOf(atPercentiles(sorted, 0.45, 0.55)),
    light: hexOf(atPercentiles(sorted, 0.95, 1)),
  };
};

const spreadOf = (view: Raster, own: ReadonlyArray<Region>) => {
  const ls = interiorOf(view, own).map(({ l }) => l);
  return [0.05, 0.5, 0.95].map((p) => ls[Math.floor(ls.length * p)] ?? 0);
};

const warped = (
  dressed: Raster,
  mask: Uint8Array,
  to: Similarity,
  w: number,
  h: number,
): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  const { width: dw, height: dh } = dressed;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [u, v] = apply(to, [x + 0.5, y + 0.5]);
      const [u0, v0] = [Math.floor(u - 0.5), Math.floor(v - 0.5)];
      const [fu, fv] = [u - 0.5 - u0, v - 0.5 - v0];
      let [r, g, b, a] = [0, 0, 0, 0];
      for (const [du, dv, wt] of [
        [0, 0, (1 - fu) * (1 - fv)],
        [1, 0, fu * (1 - fv)],
        [0, 1, (1 - fu) * fv],
        [1, 1, fu * fv],
      ] as const) {
        const [su, sv] = [u0 + du, v0 + dv];
        if (su < 0 || sv < 0 || su >= dw || sv >= dh) continue;
        const i = sv * dw + su;
        const k = wt * (mask[i] ?? 0);
        [r, g, b, a] = [
          r + k * (dressed.rgba[i * 4] ?? 0),
          g + k * (dressed.rgba[i * 4 + 1] ?? 0),
          b + k * (dressed.rgba[i * 4 + 2] ?? 0),
          a + k,
        ];
      }
      if (a < 1 / 255) continue;
      const o = (y * w + x) * 4;
      rgba[o] = Math.round(r / a);
      rgba[o + 1] = Math.round(g / a);
      rgba[o + 2] = Math.round(b / a);
      rgba[o + 3] = Math.round(a * 255);
    }
  return { width: w, height: h, rgba };
};

const cropOf = (
  sheet: Raster,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): Raster => {
  const [w, h] = [x1 - x0, y1 - y0];
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    rgba.set(
      sheet.rgba.subarray(((y0 + y) * sheet.width + x0) * 4, ((y0 + y) * sheet.width + x1) * 4),
      y * w * 4,
    );
  return { width: w, height: h, rgba };
};

const showingOf = (head: Raster, parts: ReadonlyArray<Raster>, eyeY: number) => {
  const { width: w } = head;
  const shows = (i: number) => {
    if (Math.floor(i / w) >= eyeY || (head.rgba[i * 4 + 3] ?? 0) < 128) return false;
    if (parts.some((p) => (p.rgba[i * 4 + 3] ?? 0) >= 128)) return false;
    const [r, g, b] = rgbAt(head, i);
    const max = Math.max(r, g, b, 1);
    return (max - Math.min(r, g, b)) / max < 0.4 || lumOf(head, i) < 80;
  };
  return componentsOf(w, head.height, shows)
    .filter((px) => px.length >= 4)
    .map((px) => ({ n: px.length, box: boxOfPx(w, px).box }));
};

const FEATURE = 3000;

const AGREE = 15;

const coveredOf = (head: Raster, figure: Raster): Raster => {
  const { width: w, height: h } = head;
  const skins = SKIN.map(([, c]) => labOf(c));
  const opaque = (r: Raster, i: number) => (r.rgba[i * 4 + 3] ?? 0) >= 128;
  const skin = Uint8Array.from({ length: w * h }, (_, i) => {
    if (!opaque(head, i)) return 0;
    const [l, a, b] = labOf(rgbAt(head, i));
    return Number(skins.some((s) => Math.hypot(s[0] - l, s[1] - a, s[2] - b) < NEAR));
  });
  for (const hole of componentsOf(w, h, (i) => skin[i] !== 1)) {
    const open = hole.some((i) => {
      const [x, y] = [i % w, Math.floor(i / w)];
      return !opaque(head, i) || x === 0 || y === 0 || x === w - 1 || y === h - 1;
    });
    if (!open && hole.length < FEATURE) for (const i of hole) skin[i] = 1;
  }
  const face = skin;
  const rgba = Uint8Array.from(head.rgba);
  for (let i = 0; i < w * h; i++) {
    if ((head.rgba[i * 4 + 3] ?? 0) === 0 || face[i] === 1) continue;
    if (!opaque(figure, i)) {
      rgba[i * 4 + 3] = 0;
      continue;
    }
    if (deltaE(rgbAt(head, i), rgbAt(figure, i)) < AGREE) continue;
    rgba.set(rgbAt(figure, i), i * 4);
  }
  return { width: w, height: h, rgba };
};

const pt = ([x, y]: Pt) => `(${x.toFixed(1)},${y.toFixed(1)})`;

const cutView = (sheet: Raster, view: FramedView, sheets: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const base = cropOf(sheet, boxOf(view));
    const dressed = yield* Effect.fromResult(decodePng(yield* fs.readFile(DRESSED[view])));
    const baseEyes = yield* Effect.fromOption(eyesOf(base)).pipe(
      Effect.mapError(() => `${view}: no eyes found on the base`),
    );
    const dressedEyes = yield* Effect.fromOption(eyesOf(dressed)).pipe(
      Effect.mapError(() => `${view}: no eyes found on the dressed view`),
    );
    const to = similarityOf(baseEyes, dressedEyes);
    yield* Console.log(
      `${view}: eyes base ${baseEyes.map(pt).join(' ')}, dressed ${dressedEyes.map(pt).join(' ')}; scale ${Math.hypot(to.a, to.b).toFixed(4)}, turn ${((Math.atan2(to.b, to.a) * 180) / Math.PI).toFixed(2)}°, shift ${pt([to.tx, to.ty])}`,
    );
    const outside = outsideOf(dressed);
    const paper = medianRgb(
      Arr.makeBy(dressed.width, (x) => rgbAt(dressed, x)).filter((_, x) => outside[x] === 1),
    );
    const palette = PALETTES[view];
    const paints = paintsOf(dressed, outside, palette);
    const seated = HOUSE[view].map((part) => {
      const all = regionsOf(dressed, paints, palette, part.name).filter((r) =>
        sits(part.seat, r, dressedEyes),
      );
      return {
        name: part.name,
        regions: all.filter((r) => !isStroke(r)),
        strokes: all.filter(isStroke),
      };
    });
    for (const { name, strokes } of seated)
      if (strokes.length > 0)
        yield* Console.log(
          `  ${name}: strokes dropped${strokes.map((r) => ` [${r.px.length} px ${r.box.join(',')}]`).join('')}`,
        );
    const owned = Records.fromEntries(seated.map((s) => [s.name, s.regions]));
    const head = yield* Effect.fromResult(
      decodePng(yield* fs.readFile(`${sheets}/${view}/head.png`)),
    );
    const covered = Option.liftPredicate(
      coveredOf(
        head,
        warped(
          dressed,
          Uint8Array.from(outside, (v) => 1 - v),
          to,
          base.width,
          base.height,
        ),
      ),
      () => HOUSE[view].some((p) => p.name === 'headwear'),
    );
    yield* Option.match(covered, {
      onNone: () => Effect.void,
      onSome: (r) => fs.writeFile(`${sheets}/${view}/head-covered.png`, encodePng(r)),
    });
    const written = yield* Effect.forEach(HOUSE[view], (part) =>
      Effect.gen(function* () {
        const own = owned[part.name] ?? [];
        if (own.length === 0)
          return yield* Effect.fail(`${view}: no region keys as its ${part.name}`);
        const others = new Uint8Array(dressed.width * dressed.height);
        for (const [name, regions] of Object.entries(owned))
          if (name !== part.name) for (const r of regions) for (const i of r.px) others[i] = 1;
        const raster = warped(
          dressed,
          maskOf(dressed, outside, others, own, paper),
          to,
          base.width,
          base.height,
        );
        yield* fs.writeFile(`${sheets}/${view}/${part.name}.png`, encodePng(raster));
        const ramp = Option.liftPredicate(rampOf(dressed, own), () => DYED.includes(part.name));
        yield* Console.log(
          `  ${part.name}.png: ${own.length} regions${own.map((r) => ` [${r.px.length} px ${r.box.join(',')} ${hexOf(r.median)}]`).join('')}${Option.match(
            ramp,
            {
              onNone: () => '',
              onSome: (r) =>
                `; ramp ${r.shade} ${r.base} ${r.light}; L* p5 p50 p95 ${spreadOf(dressed, own)
                  .map((l) => l.toFixed(1))
                  .join(' ')}`,
            },
          )}`,
        );
        return { name: part.name, raster, ramp };
      }),
    );
    const eyeY = (baseEyes[0][1] + baseEyes[1][1]) / 2;
    const showing = showingOf(
      Option.getOrElse(covered, () => head),
      written.map((p) => p.raster),
      eyeY,
    );
    yield* Console.log(
      `  ${Option.match(covered, { onNone: () => 'base head', onSome: () => 'covered head' })} showing above the eyes: ${showing.length}${showing.map((s) => ` [${s.n} px ${s.box.join(',')}]`).join('')}`,
    );
    return Records.fromEntries(
      written.flatMap((p) =>
        Option.match(p.ramp, { onNone: () => [], onSome: (r) => [[p.name, r] as const] }),
      ),
    );
  });

const rampsModule = (ramps: Readonly<Record<string, Readonly<Record<string, DrawnRamp>>>>) =>
  `import type { Ramp } from '@manna/film/canvas';

export const RAMPS = {
${Object.entries(ramps)
  .map(
    ([view, parts]) =>
      `  '${view}': {\n${Object.entries(parts)
        .map(
          ([name, r]) =>
            `    ${name}: { shade: '${r.shade}', base: '${r.base}', light: '${r.light}' },\n`,
        )
        .join('')}  },\n`,
  )
  .join('')}} as const satisfies Readonly<Record<string, Readonly<Record<string, Ramp>>>>;
`;

const cut = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const sheet = yield* Effect.fromResult(decodePng(yield* fs.readFile(BASE)));
  const sheets = yield* sheetsFolder;
  const ramps = yield* Effect.forEach(Records.keys(FRAMES), (view) =>
    Effect.map(cutView(sheet, view, sheets), (r) => [view, r] as const),
  );
  yield* fs.writeFileString(`${sheets}/ramps.ts`, rampsModule(Records.fromEntries(ramps)));
});

if (import.meta.main) cut.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
