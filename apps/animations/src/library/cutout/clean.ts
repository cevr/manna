import { SheetCleanRefused, labOf } from '@manna/film/core';
import type { PartSheet, Raster, SheetClean } from '@manna/film/tools';
import { Array as Arr, Option, Result } from 'effect';

type Rgb = readonly [number, number, number];

const deltaE = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const AROUND = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

interface Size {
  readonly width: number;
  readonly height: number;
}

const aroundOf = ({ width, height }: Size, i: number): ReadonlyArray<number> => {
  const x = i % width;
  const y = (i - x) / width;
  return AROUND.filter(
    ([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height,
  ).map(([dx, dy]) => (y + dy) * width + x + dx);
};

const NO_PIXELS: Raster = { width: 0, height: 0, rgba: new Uint8Array(0) };

const indexOf = (sheet: PartSheet, name: string): Result.Result<number, SheetCleanRefused> =>
  Result.fromOption(
    Option.liftPredicate(
      sheet.parts.findIndex((p) => p.name === name),
      (k) => k >= 0,
    ),
    () =>
      SheetCleanRefused.make({
        reason: `the sheet has no part ${name} (its parts: ${sheet.parts.map((p) => p.name).join(', ')})`,
      }),
  );

const indicesOf = (
  sheet: PartSheet,
  names: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<number>, SheetCleanRefused> =>
  Result.all(names.map((name) => indexOf(sheet, name)));

const withPixels = (
  sheet: PartSheet,
  pixelsOf: (k: number) => Option.Option<Uint8Array>,
): PartSheet => ({
  ...sheet,
  parts: sheet.parts.map((p, k) =>
    Option.match(pixelsOf(k), {
      onNone: () => p,
      onSome: (rgba) => ({ ...p, pixels: { ...p.pixels, rgba } }),
    }),
  ),
});

const regionFrom = (raster: Raster, seen: Uint8Array, start: number): ReadonlyArray<number> => {
  const opaque = (j: number) => (raster.rgba[j * 4 + 3] ?? 0) > 0;
  const region: Array<number> = [];
  const stack = [start];
  seen[start] = 1;
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    region.push(i);
    for (const j of aroundOf(raster, i)) {
      if (seen[j] === 1 || !opaque(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return region;
};

export const regionsOf = (raster: Raster): ReadonlyArray<ReadonlyArray<number>> => {
  const seen = new Uint8Array(raster.width * raster.height);
  const regions: Array<ReadonlyArray<number>> = [];
  for (let start = 0; start < seen.length; start++)
    if (seen[start] === 0 && (raster.rgba[start * 4 + 3] ?? 0) > 0)
      regions.push(regionFrom(raster, seen, start));
  return regions;
};

const looseOf = (
  regions: ReadonlyArray<ReadonlyArray<number>>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const largest = regions.reduce((a, r) => Math.max(a, r.length), 0);
  return regions.filter((r) => r.length < largest);
};

export const clearSpecks =
  (name: string, most: number): SheetClean =>
  (sheet) =>
    Result.map(indexOf(sheet, name), (k) => {
      const pixels = sheet.parts[k]?.pixels ?? NO_PIXELS;
      const rgba = new Uint8Array(pixels.rgba);
      const owner = new Uint8Array(sheet.owner);
      for (const region of looseOf(regionsOf(pixels))) {
        if (region.length > most) continue;
        for (const i of region) {
          rgba.fill(0, i * 4, i * 4 + 4);
          if (owner[i] === k + 1) owner[i] = 0;
        }
      }
      return {
        ...withPixels(sheet, (j) => Option.liftPredicate(rgba, () => j === k)),
        owner,
      };
    });

export interface HandArm {
  readonly name: string;
  readonly hand: { readonly c: readonly [number, number]; readonly r: number };
}

export interface CuffsToArms {
  readonly arms: ReadonlyArray<HandArm>;
  readonly body: ReadonlyArray<string>;
  readonly loose: string;
  readonly cuff?: CuffInk;
}

export interface CuffInk {
  readonly rim: number;
  readonly darker: number;
}

export const CUFF: CuffInk = { rim: 2, darker: 10 };

const BODY_PAST = 1;

const lightOf = (rgba: Uint8Array, i: number): number =>
  ((rgba[i * 4] ?? 0) + (rgba[i * 4 + 1] ?? 0) + (rgba[i * 4 + 2] ?? 0)) / 3;

interface SheetArm extends HandArm {
  readonly k: number;
}

const handDistance = (size: Size, arm: HandArm, i: number): number => {
  const x = i % size.width;
  return Math.hypot(x + 0.5 - arm.hand.c[0], (i - x) / size.width + 0.5 - arm.hand.c[1]);
};

const isCuffInk = (
  sheet: PartSheet,
  ink: CuffInk,
  arm: SheetArm,
  own: number,
  i: number,
): boolean => {
  const d = handDistance(sheet, arm, i);
  const row = Math.floor(i / sheet.width);
  if (d <= arm.hand.r || d > arm.hand.r + ink.rim || row + 0.5 > arm.hand.c[1]) return false;
  const near = aroundOf(sheet, i);
  if (!near.some((j) => sheet.owner[j] === arm.k + 1)) return false;
  const body = near.filter(
    (j) => sheet.owner[j] === own + 1 && handDistance(sheet, arm, j) > arm.hand.r + BODY_PAST,
  );
  const rgba = sheet.parts[own]?.pixels.rgba ?? NO_PIXELS.rgba;
  const bodyLight = body.reduce((s, j) => s + lightOf(rgba, j), 0) / body.length;
  return body.length > 0 && bodyLight - lightOf(rgba, i) >= ink.darker;
};

const cuffInkOf = (
  sheet: PartSheet,
  cuffInk: CuffInk,
  arms: ReadonlyArray<SheetArm>,
  bodies: ReadonlySet<number>,
): ReadonlyMap<number, number> => {
  const ink = new Map<number, number>();
  for (let i = 0; i < sheet.owner.length; i++) {
    const own = (sheet.owner[i] ?? 0) - 1;
    if (!bodies.has(own)) continue;
    for (const arm of arms) if (isCuffInk(sheet, cuffInk, arm, own, i)) ink.set(i, arm.k);
  }
  return ink;
};

const loosePiecesOf = (
  sheet: PartSheet,
  arms: ReadonlyArray<SheetArm>,
  loose: number,
): ReadonlyMap<number, number> => {
  const pieces = new Map<number, number>();
  for (const region of looseOf(regionsOf(sheet.parts[loose]?.pixels ?? NO_PIXELS))) {
    const first = region[0] ?? 0;
    const byNear = arms.toSorted(
      (a, b) => handDistance(sheet, a, first) - handDistance(sheet, b, first),
    );
    const nearest = byNear[0]?.k ?? -1;
    for (const i of region) if (sheet.owner[i] === loose + 1) pieces.set(i, nearest);
  }
  return pieces;
};

const refilled = (
  size: Size,
  rgba: Uint8Array,
  moved: ReadonlyMap<number, number>,
  i: number,
): ReadonlyArray<number> => {
  const kept = aroundOf(size, i).filter((j) => !moved.has(j) && (rgba[j * 4 + 3] ?? 0) > 0);
  return [0, 1, 2, 3].map((c) =>
    Option.match(
      Option.liftPredicate(kept, (k) => k.length > 0),
      {
        onNone: () => rgba[i * 4 + c] ?? 0,
        onSome: (k) => Math.round(k.reduce((s, j) => s + (rgba[j * 4 + c] ?? 0), 0) / k.length),
      },
    ),
  );
};

export const cuffsToArms =
  ({ arms, body, loose, cuff: cuffInk }: CuffsToArms): SheetClean =>
  (sheet) =>
    Result.map(
      Result.all([
        indicesOf(
          sheet,
          arms.map((arm) => arm.name),
        ),
        indicesOf(sheet, body),
        indexOf(sheet, loose),
      ]),
      ([armAt, bodyAt, looseAt]) => {
        const sheetArms = Arr.zipWith(arms, armAt, (arm, k) => ({ ...arm, k }));
        const ink = Option.getOrElse(Option.fromUndefinedOr(cuffInk), () => CUFF);
        const cuff = cuffInkOf(sheet, ink, sheetArms, new Set(bodyAt));
        const moved = new Map([...cuff, ...loosePiecesOf(sheet, sheetArms, looseAt)]);
        const owner = new Uint8Array(sheet.owner);
        const out = sheet.parts.map((p) => new Uint8Array(p.pixels.rgba));
        for (const [i, k] of moved) {
          const from = (sheet.owner[i] ?? 0) - 1;
          const rgba = sheet.parts[from]?.pixels.rgba ?? NO_PIXELS.rgba;
          out[k]?.set(rgba.subarray(i * 4, i * 4 + 4), i * 4);
          owner[i] = k + 1;
          out[from]?.set(
            Option.match(
              Option.liftPredicate(i, (j) => cuff.has(j)),
              {
                onNone: () => [0, 0, 0, 0],
                onSome: (j) => refilled(sheet, rgba, moved, j),
              },
            ),
            i * 4,
          );
        }
        return { ...withPixels(sheet, (k) => Option.fromUndefinedOr(out[k])), owner };
      },
    );

export interface PaperRim {
  readonly paper: Rgb;
  readonly band: number;
  readonly near: number;
}

const frontAt = (
  layers: ReadonlyArray<Raster>,
  i: number,
): Option.Option<readonly [number, number, number, number]> =>
  Option.map(
    Option.fromUndefinedOr(layers.find((l) => (l.rgba[i * 4 + 3] ?? 0) > 0)),
    ({ rgba }) => [
      rgba[i * 4] ?? 0,
      rgba[i * 4 + 1] ?? 0,
      rgba[i * 4 + 2] ?? 0,
      rgba[i * 4 + 3] ?? 0,
    ],
  );

const paperAt = (layers: ReadonlyArray<Raster>, i: number, paperLab: Rgb, near: number): boolean =>
  Option.match(frontAt(layers, i), {
    onNone: () => false,
    onSome: ([r, g, b]) => deltaE(labOf([r, g, b]), paperLab) < near,
  });

const groundBandOf = (
  layers: ReadonlyArray<Raster>,
  band: number,
  through: (i: number) => boolean,
): Uint8Array => {
  const size = layers[0] ?? NO_PIXELS;
  const count = size.width * size.height;
  const depth = new Int32Array(count).fill(-1);
  const queue: Array<number> = [];
  for (let i = 0; i < count; i++)
    if (!layers.some((l) => (l.rgba[i * 4 + 3] ?? 0) > 0)) {
      depth[i] = 0;
      queue.push(i);
    }
  const reached = new Uint8Array(count);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] ?? 0;
    const d = depth[i] ?? 0;
    if (d >= band) continue;
    for (const j of aroundOf(size, i)) {
      if (depth[j] !== -1 || !through(j)) continue;
      depth[j] = d + 1;
      reached[j] = 1;
      queue.push(j);
    }
  }
  return reached;
};

export const paperRimOf = (
  layers: ReadonlyArray<Raster>,
  { paper, band, near }: PaperRim,
): Uint8Array => {
  const paperLab = labOf(paper);
  return groundBandOf(layers, band, (j) => paperAt(layers, j, paperLab, near));
};

export interface RimLeft {
  readonly paper: Rgb;
  readonly shadow: ReadonlyArray<number>;
  readonly band: number;
  readonly ink: number;
  readonly near: number;
  readonly opaque: number;
}

export const RIM_LEFT = { band: 8, ink: 110, near: 12, opaque: 200 } as const satisfies Omit<
  RimLeft,
  'paper' | 'shadow'
>;

const lumaOf = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

export const paperRimLeftOf = (
  cut: ReadonlyArray<Raster>,
  unmatted: ReadonlyArray<Raster>,
  { paper, shadow, band, ink, near, opaque }: RimLeft,
): Uint8Array => {
  const paperLab = labOf(paper);
  const outer = groundBandOf(cut, band, (j) =>
    Option.match(frontAt(cut, j), {
      onNone: () => false,
      onSome: ([r, g, b]) => lumaOf(r, g, b) > ink,
    }),
  );
  const figure = (i: number) =>
    !shadow.includes(unmatted.findIndex((l) => (l.rgba[i * 4 + 3] ?? 0) > 0));
  return outer.map((o, i) =>
    Option.match(
      Option.filter(frontAt(unmatted, i), () => o === 1 && figure(i)),
      {
        onNone: () => 0,
        onSome: ([r, g, b, a]) => Number(a >= opaque && deltaE(labOf([r, g, b]), paperLab) < near),
      },
    ),
  );
};

export const clearedBy = (rgba: Uint8Array, rim: Uint8Array): Uint8Array => {
  const out = new Uint8Array(rgba);
  for (let i = 0; i < rim.length; i++)
    if (rim[i] === 1 && (out[i * 4 + 3] ?? 0) > 0) out.fill(0, i * 4, i * 4 + 4);
  return out;
};

export const clearPaperRim =
  (rim: PaperRim): SheetClean =>
  (sheet) => {
    const mask = paperRimOf(
      sheet.parts.map((p) => p.pixels),
      rim,
    );
    const owner = new Uint8Array(sheet.owner);
    for (let i = 0; i < mask.length; i++) if (mask[i] === 1) owner[i] = 0;
    return Result.succeed({
      ...withPixels(sheet, (k) =>
        Option.map(Option.fromUndefinedOr(sheet.parts[k]), (p) => clearedBy(p.pixels.rgba, mask)),
      ),
      owner,
    });
  };
