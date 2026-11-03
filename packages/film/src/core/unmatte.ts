import { type Rgb, deltaE, labOf } from './cast-sheet-pixels.ts';

export type BoxEdge = 'top' | 'right' | 'bottom' | 'left';

interface UnmatteOptions {
  readonly keep?: ReadonlyArray<Rgb>;
  readonly thin?: ReadonlyArray<number>;
  readonly shadow?: ReadonlyArray<number>;
  readonly open?: ReadonlyArray<BoxEdge>;
  readonly grain?: number;
}

const UNMATTE_BAND = 4;

const INK_REACH = 5;

const INK_LUMA = 110;

const BLACK: Rgb = [0, 0, 0];

interface Holders {
  readonly front: Int16Array;
  readonly colourAt: (i: number) => Rgb;
  readonly width: number;
  readonly height: number;
}

const lumaOf = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

const rgbOf = (rgba: Uint8Array, i: number): Rgb => [
  rgba[i * 4]!,
  rgba[i * 4 + 1]!,
  rgba[i * 4 + 2]!,
];

const holdersOf = (parts: ReadonlyArray<Uint8Array>, width: number, height: number): Holders => {
  const n = width * height;
  const front = new Int16Array(n).fill(-1);
  for (let k = parts.length - 1; k >= 0; k--)
    for (let i = 0; i < n; i++) if (parts[k]![i * 4 + 3]! > 0) front[i] = k;
  return { front, colourAt: (i) => rgbOf(parts[front[i]!]!, i), width, height };
};

export const unmatte = (
  parts: ReadonlyArray<Uint8Array>,
  width: number,
  height: number,
  paper: Rgb,
  options: UnmatteOptions = {},
): ReadonlyArray<Uint8Array> => {
  const holders = holdersOf(parts, width, height);
  const paperLab = labOf(paper);
  const keep = (options.keep ?? []).map(labOf);
  const isCloth = (c: Rgb) => {
    if (keep.length === 0) return false;
    const lab = labOf(c);
    const fromPaper = deltaE(lab, paperLab);
    return keep.some((k) => deltaE(lab, k) < fromPaper);
  };
  const thin = new Set(options.thin);
  const solve = (i: number) =>
    solved(
      holders.colourAt(i),
      inkNear(holders, i, paper),
      paper,
      isCloth,
      thin.has(holders.front[i]!),
    );
  const rim = rimOf(holders, (i) => solve(i)[3] === 0, options.open);
  const { grain } = options;
  const paperLuma = lumaOf(paper);
  const floored = (i: number, s: ReturnType<typeof solve>) => {
    if (grain === undefined || s[3] === 255) return s;
    const c = holders.colourAt(i);
    return paperLuma - lumaOf(c) > grain ? ([c[0], c[1], c[2], 255] as const) : s;
  };
  const out = parts.map((p) => Uint8Array.from(p));
  const changed = new Uint8Array(width * height);
  for (const i of rim) {
    const k = holders.front[i]!;
    if (parts[k]![i * 4 + 3] !== 255) continue;
    for (let b = k + 1; b < parts.length; b++) out[b]!.fill(0, i * 4, i * 4 + 4);
    out[k]!.set(floored(i, solve(i)), i * 4);
    changed[i] = 1;
  }
  restoreEnclosed(parts, out, holders, changed, paperLab, new Set(options.shadow));
  return out;
};

const FENCE = 16;

const PAPER_CORE = 2;

const SHEET_GROUND = 4.25;

const POCKET = 9;

const onFrame = (i: number, width: number, height: number) => {
  const [x, y] = [i % width, Math.floor(i / width)];
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
};

const flood = (
  n: number,
  passes: (i: number) => boolean,
  seed: (i: number) => boolean,
  next: (i: number) => ReadonlyArray<number>,
) => {
  const reached = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++)
    if (passes(i) && seed(i)) {
      reached[i] = 1;
      stack.push(i);
    }
  while (stack.length > 0)
    for (const j of next(stack.pop()!))
      if (reached[j] === 0 && passes(j)) {
        reached[j] = 1;
        stack.push(j);
      }
  return reached;
};

const regionsOf = (
  n: number,
  isIn: (i: number) => boolean,
  next: (i: number) => ReadonlyArray<number>,
) => {
  const seen = new Uint8Array(n);
  const regions: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] === 1 || !isIn(s)) continue;
    seen[s] = 1;
    const region = [s];
    for (let r = 0; r < region.length; r++)
      for (const j of next(region[r]!))
        if (seen[j] === 0 && isIn(j)) {
          seen[j] = 1;
          region.push(j);
        }
    regions.push(region);
  }
  return regions;
};

const paperDistance = ({ colourAt }: Holders, paperLab: Rgb) => {
  const byColour = new Map<number, number>();
  return (i: number) => {
    const c = colourAt(i);
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    let d = byColour.get(key);
    if (d === undefined) {
      d = deltaE(labOf(c), paperLab);
      byColour.set(key, d);
    }
    return d;
  };
};

const viewAlphaOf = (parts: ReadonlyArray<Uint8Array>, n: number) => {
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let through = 1;
    for (const p of parts) through *= 1 - p[i * 4 + 3]! / 255;
    alpha[i] = Math.round(255 * (1 - through));
  }
  return alpha;
};

const sides = (i: number, width: number, height: number) => {
  const x = i % width;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < width - 1) out.push(i + 1);
  if (i >= width) out.push(i - width);
  if (i < width * (height - 1)) out.push(i + width);
  return out;
};

const restoreEnclosed = (
  parts: ReadonlyArray<Uint8Array>,
  out: ReadonlyArray<Uint8Array>,
  holders: Holders,
  changed: Uint8Array,
  paperLab: Rgb,
  shadow: ReadonlySet<number>,
) => {
  const { front, width, height } = holders;
  const n = width * height;
  const fromPaper = paperDistance(holders, paperLab);
  const isCore = (i: number) => fromPaper(i) <= PAPER_CORE;
  const alpha = viewAlphaOf(out, n);
  const walls = out.filter((_, k) => !shadow.has(k));
  const wallAlpha = walls.length === out.length ? alpha : viewAlphaOf(walls, n);
  const step8 = (i: number) => neighbours(i, width, height);
  const step4 = (i: number) => sides(i, width, height);
  const outside = flood(
    n,
    (i) => wallAlpha[i]! < FENCE,
    (i) => front[i] === -1 || onFrame(i, width, height),
    step8,
  );
  const enclosed = (i: number) => outside[i] === 0 && alpha[i]! < FENCE;
  let sheet: ReturnType<typeof sheetPocketsOf> | undefined;
  for (const region of regionsOf(n, enclosed, step4)) {
    if (!region.some((i) => changed[i] === 1)) continue;
    if (region.filter(isCore).length >= POCKET) continue;
    sheet ??= sheetPocketsOf(holders, fromPaper);
    const { open, pockets } = sheet;
    if (region.some((i) => open[i] === 1 || pockets[i] === 1)) continue;
    for (const i of region)
      if (changed[i] === 1 && !isCore(i))
        for (let k = 0; k < parts.length; k++)
          out[k]!.set(parts[k]!.subarray(i * 4, i * 4 + 4), i * 4);
  }
};

const sheetPocketsOf = ({ front, width, height }: Holders, fromPaper: (i: number) => number) => {
  const n = width * height;
  const step4 = (i: number) => sides(i, width, height);
  const groundLike = (i: number) => front[i] === -1 || fromPaper(i) <= SHEET_GROUND;
  const open = flood(
    n,
    groundLike,
    (i) => front[i] === -1 || onFrame(i, width, height),
    (i) => neighbours(i, width, height),
  );
  const pockets = new Uint8Array(n);
  for (const hole of regionsOf(n, (i) => open[i] === 0 && groundLike(i), step4))
    if (hole.filter((i) => fromPaper(i) <= PAPER_CORE).length >= POCKET)
      for (const i of hole) pockets[i] = 1;
  return { open, pockets };
};

const solved = (
  c: Rgb,
  ink: Rgb,
  paper: Rgb,
  isCloth: (c: Rgb) => boolean,
  thin: boolean,
): readonly [number, number, number, number] => {
  const d = [ink[0] - paper[0], ink[1] - paper[1], ink[2] - paper[2]] as const;
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const along =
    len2 === 0
      ? 1
      : ((c[0] - paper[0]) * d[0] + (c[1] - paper[1]) * d[1] + (c[2] - paper[2]) * d[2]) / len2;
  const reached = Math.round(Math.max(0, Math.min(1, along)) * 255);
  if (reached === 0) return isCloth(c) ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0];
  const a = thin ? inGamut(c, paper, reached) : reached;
  const t = a / 255;
  const channel = (j: 0 | 1 | 2) =>
    Math.max(0, Math.min(255, Math.round((c[j] - paper[j] * (1 - t)) / t)));
  return [channel(0), channel(1), channel(2), a];
};

const inGamut = (c: Rgb, paper: Rgb, from: number) => {
  const out = (a: number) =>
    [0, 1, 2].some((j) => {
      const v = c[j]! * 255 - paper[j]! * (255 - a);
      return v < 0 || v > 255 * a;
    });
  let a = from;
  while (a < 255 && out(a)) a++;
  return a;
};

const neighbours = (i: number, width: number, height: number) => {
  const [x, y] = [i % width, Math.floor(i / width)];
  const out: number[] = [];
  for (let v = Math.max(0, y - 1); v <= Math.min(height - 1, y + 1); v++)
    for (let u = Math.max(0, x - 1); u <= Math.min(width - 1, x + 1); u++) out.push(v * width + u);
  return out;
};

const rimOf = (
  { front, colourAt, width, height }: Holders,
  isPaper: (i: number) => boolean,
  open: ReadonlyArray<BoxEdge> | undefined,
) => {
  const rim: number[] = [];
  const seen = Uint8Array.from(front, (k) => (k === -1 ? 1 : 0));
  let from = [...front.keys()].filter((i) => front[i] === -1);
  for (let step = 1; step <= UNMATTE_BAND && from.length > 0; step++) {
    const next: number[] = [];
    for (let f = 0; f < from.length; f++)
      for (const j of neighbours(from[f]!, width, height)) {
        if (seen[j] === 1) continue;
        seen[j] = 1;
        rim.push(j);
        if (lumaOf(colourAt(j)) <= INK_LUMA) continue;
        if (isPaper(j)) from.push(j);
        else next.push(j);
      }
    from = next;
  }
  return [...rim, ...pocketsOf(seen, isPaper, width, height, open)];
};

const closedEdgeOf = (width: number, height: number, open: ReadonlyArray<BoxEdge>) => {
  const perimeter = new Set<number>();
  for (let x = 0; x < width; x++) perimeter.add(x).add((height - 1) * width + x);
  for (let y = 0; y < height; y++) perimeter.add(y * width).add(y * width + width - 1);
  const isOpen = (i: number) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    return (
      (y === 0 && open.includes('top')) ||
      (x === width - 1 && open.includes('right')) ||
      (y === height - 1 && open.includes('bottom')) ||
      (x === 0 && open.includes('left'))
    );
  };
  return [...perimeter].filter((i) => !isOpen(i));
};

const pocketsOf = (
  seen: Uint8Array,
  isPaper: (i: number) => boolean,
  width: number,
  height: number,
  open: ReadonlyArray<BoxEdge> | undefined,
) => {
  const pocket: number[] = [];
  const take = (i: number) => {
    if (seen[i] === 1) return;
    seen[i] = 1;
    if (isPaper(i)) pocket.push(i);
  };
  const seeds =
    open === undefined
      ? [0, width - 1, (height - 1) * width, height * width - 1]
      : closedEdgeOf(width, height, open);
  for (const i of seeds) take(i);
  for (let f = 0; f < pocket.length; f++)
    for (const j of neighbours(pocket[f]!, width, height)) take(j);
  return pocket;
};

const inkNear = ({ front, colourAt, width, height }: Holders, i: number, paper: Rgb): Rgb => {
  const [x, y] = [i % width, Math.floor(i / width)];
  let best: Rgb = paper;
  let far = -1;
  for (let v = Math.max(0, y - INK_REACH); v <= Math.min(height - 1, y + INK_REACH); v++)
    for (let u = Math.max(0, x - INK_REACH); u <= Math.min(width - 1, x + INK_REACH); u++) {
      const j = v * width + u;
      if (front[j] === -1) continue;
      const c = colourAt(j);
      const d = (c[0] - paper[0]) ** 2 + (c[1] - paper[1]) ** 2 + (c[2] - paper[2]) ** 2;
      if (d > far) [far, best] = [d, c];
    }
  return lumaOf(best) > INK_LUMA ? BLACK : best;
};
