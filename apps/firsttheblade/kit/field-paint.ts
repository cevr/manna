import { LIGHT, sunLight } from '../src/motion/sun.ts';

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

const CLEAR_FROM = 0.42;
const CLEAR_TO = 0.62;
const HORIZON = 0.466;
export const REPAINT_TO = 0.4;
const FEATHER = 48;
const SKY_TOLERANCE = 0.06;

export const QUALITY = 0.86;

const BAND_TOP = 0.5;
const BAND_BOTTOM = 0.82;
const INK = 0.22;
const TALLEST = 0.27;

const scaled = (image: Pixels, px: number) => Math.max(1, Math.round((px * image.width) / 3072));

export const at = (values: ArrayLike<number>, i: number) => values[i] ?? 0;

const channel = (image: Pixels, i: number, k: number) => at(image.data, i * 4 + k) / 255;

const rowSky = (image: Pixels) => {
  const { width, height } = image;
  const from = Math.round(CLEAR_FROM * width);
  const to = Math.round(CLEAR_TO * width);
  const last = Math.round(HORIZON * height);
  const sky = new Float32Array(height * 3);
  for (let y = 0; y < height; y++) {
    const row = Math.min(y, last);
    for (let k = 0; k < 3; k++) {
      const values = Array.from({ length: to - from }, (_, x) =>
        channel(image, row * width + from + x, k),
      );
      values.sort((a, b) => a - b);
      sky[y * 3 + k] = at(values, values.length >> 1);
    }
  }
  return sky;
};

const skyLike = (image: Pixels, sky: Float32Array) => {
  const toLight = Float64Array.from(sky, (b, j) => at(LIGHT, j % 3) - b);
  const along = Float64Array.from({ length: image.height }, (_, y) => {
    const [d0, d1, d2] = [at(toLight, y * 3), at(toLight, y * 3 + 1), at(toLight, y * 3 + 2)];
    return Math.max(d0 * d0 + d1 * d1 + d2 * d2, 1e-6);
  });
  return (i: number) => {
    const y = Math.floor(i / image.width);
    const c0 = channel(image, i, 0) - at(sky, y * 3);
    const c1 = channel(image, i, 1) - at(sky, y * 3 + 1);
    const c2 = channel(image, i, 2) - at(sky, y * 3 + 2);
    const [d0, d1, d2] = [at(toLight, y * 3), at(toLight, y * 3 + 1), at(toLight, y * 3 + 2)];
    const amount = Math.min(0.95, Math.max(0, (c0 * d0 + c1 * d1 + c2 * d2) / at(along, y)));
    return Math.hypot(c0 - amount * d0, c1 - amount * d1, c2 - amount * d2) < SKY_TOLERANCE;
  };
};

const flood = (
  width: number,
  height: number,
  seeds: ReadonlyArray<number>,
  open: (i: number) => boolean,
) => {
  const reached = new Uint8Array(width * height);
  const stack: Array<number> = [];
  const visit = (i: number) => {
    if (reached[i] === 0 && open(i)) {
      reached[i] = 1;
      stack.push(i);
    }
  };
  seeds.forEach(visit);
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < width * (height - 1)) visit(i + width);
  }
  return reached;
};

export const skyMask = (image: Pixels) => {
  const { width, height } = image;
  const isSky = skyLike(image, rowSky(image));
  const bottom = Array.from({ length: width }, (_, x) => (height - 1) * width + x);
  const ground = flood(width, height, bottom, (i) => i >= (height - 1) * width || !isSky(i));
  const top = Array.from({ length: width }, (_, x) => x);
  return flood(width, height, top, (i) => ground[i] === 0);
};

export const withoutRays = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const out = new Uint8ClampedArray(image.data);
  const from = Math.round(CLEAR_FROM * width);
  const span = Math.round(CLEAR_TO * width) - from;
  const last = Math.round(HORIZON * height);
  const to = Math.round(REPAINT_TO * width);
  const feather = scaled(image, FEATHER);
  for (let y = 0; y < height; y++) {
    const row = Math.max(0, y - 2 * Math.max(0, y - last));
    for (let x = 0; x < to + feather; x++) {
      const i = y * width + x;
      if (sky[i] === 0) continue;
      const m = x % (2 * span);
      const sx = from + Math.min(m, 2 * span - 1 - m);
      const j = row * width + sx;
      const w = Math.min(1, Math.max(0, 1 - (x - to) / feather));
      for (let k = 0; k < 3; k++)
        out[i * 4 + k] = w * at(image.data, j * 4 + k) + (1 - w) * at(image.data, i * 4 + k);
    }
  }
  return { width, height, data: out };
};

interface HillStreak {
  readonly line: readonly [number, number, number, number];
  readonly step: readonly [number, number, number];
  readonly hill: readonly [number, number, number];
}

export const HILL_STREAKS: ReadonlyArray<HillStreak> = [
  { line: [439.5, 980.6, 522.7, 1087.2], step: [17, 9.5, -4.1], hill: [182.5, 213, 225.5] },
  { line: [960.6, 1005.6, 1046.3, 1076.9], step: [-10.5, -6.6, 3.6], hill: [176, 209.5, 229] },
  { line: [1038, 1070.9, 1091.6, 1127.3], step: [-7.6, -5.9, 2.5], hill: [144.5, 189.5, 220.5] },
  { line: [1288.1, 1068.3, 1350.3, 1133.3], step: [0.6, 1.2, 3.4], hill: [176, 210, 232] },
];
const STREAK_FADE = 150;
const STREAK_TAPER = 24;
const STREAK_HILL = 20;
const STREAK_HILL_SOFT = 16;
const STREAK_BIN = 0.25;
const STREAK_REACH = 8;

const smoothstep = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

const onHill = (image: Pixels, i: number, hill: HillStreak['hill']) => {
  const off = Math.max(...hill.map((h, k) => Math.abs(at(image.data, i * 4 + k) - h)));
  return 1 - smoothstep((off - STREAK_HILL) / STREAK_HILL_SOFT);
};

const streakLine = (image: Pixels, streak: HillStreak) => {
  const s = image.width / 3072;
  const [x0, y0, x1, y1] = [
    streak.line[0] * s,
    streak.line[1] * s,
    streak.line[2] * s,
    streak.line[3] * s,
  ];
  const length = Math.hypot(x1 - x0, y1 - y0);
  const dx = (x1 - x0) / length;
  const dy = (y1 - y0) / length;
  return { s, x0, y0, x1, y1, length, dx, dy, nx: dy, ny: -dx };
};

const riseOf = (image: Pixels, streak: HillStreak) => {
  const { width, height } = image;
  const g = streakLine(image, streak);
  const count = Math.round((2 * STREAK_REACH) / STREAK_BIN) + 1;
  const bins = Array.from({ length: 3 }, () => Array.from({ length: count }, (): number[] => []));
  const reach = (STREAK_REACH + 1) * g.s;
  for (
    let y = Math.max(0, Math.floor(Math.min(g.y0, g.y1) - reach));
    y <= Math.min(height - 1, Math.max(g.y0, g.y1) + reach);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(Math.min(g.x0, g.x1) - reach));
      x <= Math.min(width - 1, Math.max(g.x0, g.x1) + reach);
      x++
    ) {
      const t = (x - g.x0) * g.dx + (y - g.y0) * g.dy;
      const d = ((x - g.x0) * g.nx + (y - g.y0) * g.ny) / g.s;
      const i = y * width + x;
      if (t < 0 || t > g.length || Math.abs(d) > STREAK_REACH || onHill(image, i, streak.hill) < 1)
        continue;
      const bin = Math.round((d + STREAK_REACH) / STREAK_BIN);
      for (let k = 0; k < 3; k++) bins[k]?.[bin]?.push(at(image.data, i * 4 + k));
    }
  return bins.map((channel, k) => {
    const medians = channel.map((values) => {
      if (values.length === 0) return Number.NaN;
      const sorted = values.toSorted((a, b) => a - b);
      return at(sorted, sorted.length >> 1);
    });
    const smooth = medians.map((_, b) => {
      const near = medians.slice(Math.max(0, b - 2), b + 3).filter((v) => !Number.isNaN(v));
      return near.reduce((sum, v) => sum + v, 0) / Math.max(1, near.length);
    });
    const ends = (from: number) =>
      (at(smooth, from) + at(smooth, from + 4) + at(smooth, from + 8)) / 3;
    const low = ends(0);
    const high = ends(count - 9);
    const step = at(streak.step, k);
    const shares = smooth.map((v, b) => {
      const d = -STREAK_REACH + b * STREAK_BIN;
      if (Math.abs(high - low) < 2 || Math.abs(step) < 2)
        return Math.max(-0.5, Math.min(0.5, d / 4));
      if (b < 4) return -0.5;
      if (b > count - 5) return 0.5;
      return Math.max(-0.5, Math.min(0.5, (v - (low + high) / 2) / (high - low)));
    });
    const up = shares.map((_, b) => Math.max(...shares.slice(0, b + 1)));
    const down = shares.map((_, b) => Math.min(...shares.slice(b)));
    return shares.map((_, b) => (at(up, b) + at(down, b)) / 2);
  });
};

const riseAt = (rise: ReadonlyArray<number>, d: number) => {
  const f = Math.min(1, Math.max(0, (d + STREAK_REACH) / (2 * STREAK_REACH))) * (rise.length - 1);
  const b = Math.floor(f);
  return at(rise, b) + (f - b) * (at(rise, Math.min(rise.length - 1, b + 1)) - at(rise, b));
};

const liftStreak = (image: Pixels, sky: Uint8Array, streak: HillStreak, delta: Float32Array) => {
  const { width, height } = image;
  const g = streakLine(image, streak);
  const rise = riseOf(image, streak);
  const fade = STREAK_FADE * g.s;
  const taper = STREAK_TAPER * g.s;
  const reach = fade + taper;
  const top = Math.max(0, Math.floor(Math.min(g.y0, g.y1) - reach));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(g.y0, g.y1) + reach));
  const left = Math.max(0, Math.floor(Math.min(g.x0, g.x1) - reach));
  const right = Math.min(width - 1, Math.ceil(Math.max(g.x0, g.x1) + reach));
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const i = y * width + x;
      const t = (x - g.x0) * g.dx + (y - g.y0) * g.dy;
      const d = (x - g.x0) * g.nx + (y - g.y0) * g.ny;
      const past = Math.max(-t, t - g.length, 0);
      if (sky[i] === 1 || Math.abs(d) > fade || past > taper) continue;
      const weight =
        (1 - smoothstep(Math.abs(d) / fade)) *
        (1 - smoothstep(past / taper)) *
        onHill(image, i, streak.hill);
      for (let k = 0; k < 3; k++)
        delta[i * 3 + k] =
          at(delta, i * 3 + k) + riseAt(rise[k] ?? [], d / g.s) * weight * at(streak.step, k);
    }
};

export const withoutHillStreaks = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const delta = new Float32Array(width * height * 3);
  for (const streak of HILL_STREAKS) liftStreak(image, sky, streak, delta);
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < width * height; i++)
    for (let k = 0; k < 3; k++)
      out[i * 4 + k] = Math.round(at(image.data, i * 4 + k) - at(delta, i * 3 + k));
  return { width, height, data: out };
};

export const withSunLight = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const out = new Uint8ClampedArray(image.data);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (sky[i] === 0) continue;
      const a = sunLight((x + 0.5) / width, (y + 0.5) / height);
      for (let k = 0; k < 3; k++) {
        const c = at(image.data, i * 4 + k) / 255;
        out[i * 4 + k] = 255 * (1 - (1 - c) * (1 - a * at(LIGHT, k)));
      }
    }
  return { width, height, data: out };
};

export const grown = (width: number, height: number, mask: Uint8Array, r: number) => {
  const across = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  const span = (get: (n: number) => number, set: (n: number) => void, length: number) => {
    let last = -Infinity;
    for (let n = 0; n < length; n++) {
      if (get(n)) last = n;
      if (n - last <= r) set(n);
    }
    last = Infinity;
    for (let n = length - 1; n >= 0; n--) {
      if (get(n)) last = n;
      if (last - n <= r) set(n);
    }
  };
  for (let y = 0; y < height; y++)
    span(
      (x) => at(mask, y * width + x),
      (x) => (across[y * width + x] = 1),
      width,
    );
  for (let x = 0; x < width; x++)
    span(
      (y) => at(across, y * width + x),
      (y) => (out[y * width + x] = 1),
      height,
    );
  return out;
};

const closed = (width: number, height: number, mask: Uint8Array, r: number) =>
  grown(
    width,
    height,
    grown(width, height, mask, r).map((m) => 1 - m),
    r,
  ).map((m) => 1 - m);

export const blurred = (width: number, height: number, field: Float32Array, r: number) => {
  let f = field;
  const pass = (
    src: Float32Array,
    step: number,
    length: number,
    lines: number,
    lineStep: number,
  ) => {
    const out = new Float32Array(src.length);
    for (let l = 0; l < lines; l++) {
      const read = (n: number) =>
        at(src, l * lineStep + Math.min(length - 1, Math.max(0, n)) * step);
      let sum = 0;
      for (let n = -r; n <= r; n++) sum += read(n);
      for (let n = 0; n < length; n++) {
        out[l * lineStep + n * step] = sum / (2 * r + 1);
        sum += read(n + r + 1) - read(n - r);
      }
    }
    return out;
  };
  for (let k = 0; k < 3; k++) f = pass(pass(f, 1, width, height, width), width, height, width, 1);
  return f;
};

export const plantMask = (image: Pixels) => {
  const { width, height } = image;
  const top = Math.round(BAND_TOP * height);
  const bottom = Math.round(BAND_BOTTOM * height);
  const ink = new Uint8Array(width * height);
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const luma =
        0.299 * channel(image, i, 0) + 0.587 * channel(image, i, 1) + 0.114 * channel(image, i, 2);
      if (luma < INK) ink[i] = 1;
    }
  const wall = grown(width, height, ink, scaled(image, 3));
  const edges = Array.from({ length: width }, (_, x) => [
    top * width + x,
    (bottom - 1) * width + x,
  ]).flat();
  const land = flood(width, height, edges, (i) => {
    const y = Math.floor(i / width);
    return y >= top && y < bottom && wall[i] === 0;
  });
  const plants = new Uint8Array(width * height);
  for (let i = top * width; i < bottom * width; i++) plants[i] = 1 - at(land, i);
  return closed(width, height, plants, scaled(image, 20));
};

const feet = (width: number, height: number, plants: Uint8Array, reach: number) => {
  const lowest = Array.from({ length: width }, (_, x) => {
    for (let y = height - 1; y >= 0; y--) if (plants[y * width + x]) return y;
    return -1;
  });
  return lowest.map((_, x) =>
    Math.max(...lowest.slice(Math.max(0, x - reach), Math.min(width, x + reach + 1))),
  );
};

export const windMap = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const plants = plantMask(image);
  const foot = feet(width, height, plants, scaled(image, 40));
  const carried = grown(width, height, plants, scaled(image, 12));
  const tallest = TALLEST * height;
  const sway = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const base = at(foot, x);
      if (carried[i] === 0 || base < 0) continue;
      sway[i] = Math.min(1, Math.max(0, (base - y) / tallest)) ** 1.5;
    }
  const soft = blurred(width, height, sway, scaled(image, 6));
  const air = blurred(width, height, Float32Array.from(sky), scaled(image, 4));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = Math.round(at(soft, i) * 255);
    data[i * 4 + 1] = Math.round(at(air, i) * 255);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
};
